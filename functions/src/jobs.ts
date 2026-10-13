import { sleep } from "./lib/http";
import { EVENTS, firestore, markEnded, readState, RunStats, upsertEvents, writeState } from "./lib/store";
import { fetchPolisen, normalizePolisen, POLISEN_MIN_INTERVAL_MS } from "./sources/polisen";
import { fetchSmhiWarnings, normalizeSmhi } from "./sources/smhi";
import { fetchSituations, normalizeSituation } from "./sources/trafikverket";

// ---------------------------------------------------------------- Polisen

/**
 * Bump when normalization changes in a way that should be applied to already
 * stored history (e.g. 2 = kommun centre points). The backfill then runs again.
 */
export const BACKFILL_VERSION = 2;

interface BackfillState {
  version?: number;
  pending: string[]; // days "YYYY-MM-DD", newest first
  done: { day: string; count: number }[];
  startedAt: Date;
  completedAt: Date | null;
}

interface PolisenState {
  hashes: Record<string, string>;
  backfill: BackfillState;
}

/** Calendar date in Sweden, "YYYY-MM-DD". */
export function stockholmDate(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(d);
}

/** Yesterday back to `days` days ago (today is covered by the live feed). */
export function backfillDays(now: Date, days: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= days; i++) out.push(stockholmDate(new Date(now.getTime() - i * 24 * 3600_000)));
  return out;
}

/**
 * Every run: one call for the live list (latest 500 notices). While the backfill
 * is pending, one extra call for a single past day, 11 s later. With a 5-minute
 * schedule that is at most 24 calls/hour — well under Polisen's 60/hour.
 */
export async function runPolisenJob(now = new Date()): Promise<RunStats> {
  const state = await readState<PolisenState>("polisen");

  const live = await fetchPolisen();
  const liveResult = await upsertEvents(live.map(normalizePolisen), state.hashes ?? {});
  const stats: RunStats = {
    fetched: live.length,
    written: liveResult.written,
    unchanged: liveResult.unchanged,
    mode: "live",
  };

  let backfill = state.backfill;
  if (!backfill || (backfill.version ?? 1) < BACKFILL_VERSION) {
    const days = Number(process.env.BACKFILL_DAYS ?? 14);
    backfill = { version: BACKFILL_VERSION, pending: backfillDays(now, days), done: [], startedAt: now, completedAt: null };
  }

  if (backfill.pending.length > 0) {
    await sleep(POLISEN_MIN_INTERVAL_MS);
    const day = backfill.pending[0];
    const dayEvents = await fetchPolisen(day);
    const dayResult = await upsertEvents(dayEvents.map(normalizePolisen), liveResult.hashes);
    backfill = {
      ...backfill,
      pending: backfill.pending.slice(1),
      done: [...backfill.done, { day, count: dayEvents.length }],
      completedAt: backfill.pending.length === 1 ? new Date() : null,
    };
    stats.fetched += dayEvents.length;
    stats.written += dayResult.written;
    stats.unchanged += dayResult.unchanged;
    stats.mode = `live+backfill ${day} (${backfill.pending.length} kvar)`;
  }

  // Only the live list is kept in the hash index; it is what the next run compares against.
  await writeState("polisen", { hashes: liveResult.hashes, backfill });
  return stats;
}

// ---------------------------------------------------------------- SMHI

interface SmhiState {
  hashes: Record<string, string>;
}

/** Warnings that disappear from the feed are marked as ended. */
export async function runSmhiJob(now = new Date()): Promise<RunStats> {
  const state = await readState<SmhiState>("smhi");
  const warnings = await fetchSmhiWarnings();
  const parsed = warnings.flatMap(normalizeSmhi);
  const result = await upsertEvents(parsed, state.hashes ?? {});

  const goneIds = Object.keys(state.hashes ?? {}).filter((id) => !(id in result.hashes));
  const ended = await markEnded(goneIds, now);

  await writeState("smhi", { hashes: result.hashes });
  return { fetched: parsed.length, written: result.written, unchanged: result.unchanged, ended, mode: "live" };
}

// ---------------------------------------------------------------- Trafikverket

interface TrafikverketState {
  changeId: string;
}

export function hasUsableKey(key: string | undefined): key is string {
  return !!key && key.trim().length > 10 && key.trim().toUpperCase() !== "SAKNAS";
}

/**
 * First run (changeId "0") loads every active situation; later runs only get
 * changes. Deviations that vanish from an updated situation are marked as ended.
 */
export async function runTrafikverketJob(apiKey: string | undefined, now = new Date()): Promise<RunStats> {
  if (!hasUsableKey(apiKey)) {
    return { fetched: 0, written: 0, unchanged: 0, mode: "inaktiv", note: "TRAFIKVERKET_API_KEY saknas" };
  }
  const state = await readState<TrafikverketState>("trafikverket");
  const changeId = state.changeId ?? "0";
  const { situations, lastChangeId } = await fetchSituations(apiKey.trim(), changeId);

  const parsed = situations.flatMap((s) => normalizeSituation(s, now));
  const result = await upsertEvents(parsed);

  // Reconcile: deviations no longer present in an updated (or deleted) situation have ended.
  let ended = 0;
  if (changeId !== "0") {
    for (const situation of situations) {
      const keep = new Set((situation.Deleted ? [] : situation.Deviation ?? []).map((d) => `trafikverket-${d.Id}`));
      const existing = await firestore()
        .collection(EVENTS)
        .where("source", "==", "trafikverket")
        .where("groupId", "==", situation.Id)
        .where("status", "==", "aktiv")
        .select()
        .get();
      ended += await markEnded(
        existing.docs.map((d) => d.id).filter((id) => !keep.has(id)),
        now,
      );
    }
  }

  await writeState("trafikverket", { changeId: lastChangeId ?? changeId });
  return {
    fetched: parsed.length,
    written: result.written,
    unchanged: result.unchanged,
    ended,
    mode: changeId === "0" ? "initial" : "delta",
  };
}

// ---------------------------------------------------------------- Maintenance

/** Events whose end time has passed but were never explicitly closed. */
export async function closeExpiredEvents(now = new Date()): Promise<number> {
  const snap = await firestore()
    .collection(EVENTS)
    .where("status", "==", "aktiv")
    .where("endTime", "<", now)
    .select()
    .limit(2000)
    .get();
  return markEnded(
    snap.docs.map((d) => d.id),
    now,
  );
}
