import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { Category, EventStatus, GeoPrecision, NormalizedEvent, SourceId } from "./lib/model";
import { EVENTS, firestore, INGEST_STATE, SOURCES } from "./lib/store";

/**
 * Public feeds for the website. Visitors never query `events` directly: this job
 * merges only what changed since the last run into three compact documents, so a
 * page view costs one document read regardless of how many events exist.
 *
 *   feeds/live   – started within 48 h, plus every active warning (+ source status)
 *   feeds/week   – 2–7 days old
 *   feeds/month  – 7–30 days old
 */
export const FEEDS = "feeds";
export const FEED_DAYS = 30;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Compact event shape shipped to browsers (short keys keep the payload small). */
export interface FeedEvent {
  id: string;
  s: SourceId;
  c: Category;
  t: string; // subtype
  ti: string; // title (Swedish, as published)
  su: string | null; // summary, truncated
  st: number; // start, epoch ms
  en: number | null; // end, epoch ms
  up: number | null; // last update at source, epoch ms
  x: EventStatus;
  sv: string | null; // severity
  k: string | null; // kommun code
  l: string | null; // län code
  r: string | null; // road number
  g: [number, number] | null; // [lat, lng]
  gp: GeoPrecision;
  u: string | null; // source url
  e?: { ti: string; su: string | null }; // English text when the source has it
}

/** Shape of an `events` document as read back from Firestore. */
export type StoredEvent = Omit<NormalizedEvent, "id" | "startTime" | "endTime" | "updatedAtSource" | "publishedAt"> & {
  startTime: Timestamp;
  endTime: Timestamp | null;
  updatedAtSource: Timestamp | null;
  publishedAt: Timestamp | null;
  ingestedAt?: Timestamp;
};

/** Trafikverket deviations that are incidents (not planned works or standing restrictions). */
const TRAFIKVERKET_INCIDENTS = new Set(
  [
    "Fordonshaveri",
    "Djur på vägen",
    "Föremål på vägen",
    "Faror på vägen",
    "Hinder på vägbanan",
    "Bärgning",
    "Nedfallet träd",
    "Människor på vägen",
    "Olja på vägen",
    "Översvämning",
    "Fordon på fel vägbana",
    "Viktig trafikinformation",
    "Vägskada",
    "Långsam kö",
    "Vägen avstängd",
  ].map((s) => s.toLowerCase()),
);

/** Shown whatever the impact: directly dangerous for road users. */
const TRAFIKVERKET_ALWAYS = new Set(
  ["Människor på vägen", "Fordon på fel vägbana", "Översvämning", "Viktig trafikinformation"].map((s) => s.toLowerCase()),
);

/** Texts describing planned work rather than an incident. */
const PLANNED_WORK = /arbete|underhåll|planerad|planerat|beläggning|reparation/iu;

const isMajorImpact = (severity: string | null) => /stor påverkan/iu.test(severity ?? "");

const SUMMARY_MAX = 320;
const MAX_SHARD_BYTES = 900_000;

export function isFeedEligible(e: StoredEvent, now: Date): boolean {
  const start = e.startTime.toMillis();
  const nowMs = now.getTime();
  if (e.category === "varning") return e.status === "aktiv" || start >= nowMs - FEED_DAYS * DAY;
  if (start < nowMs - FEED_DAYS * DAY) return false;
  if (start > nowMs + HOUR) return false; // planned for the future

  switch (e.source) {
    case "polisen":
      return ["trafikolycka", "brand", "raddning", "trafikstorning"].includes(e.category);
    case "trafikverket": {
      if (e.category === "trafikolycka" || e.category === "brand") return true;
      if (e.category !== "trafikstorning") return false;
      const subtype = e.subtype.toLowerCase();
      if (!TRAFIKVERKET_INCIDENTS.has(subtype)) return false;
      if (TRAFIKVERKET_ALWAYS.has(subtype)) return true;
      // Minor-impact disruptions (a breakdown on the hard shoulder …) would drown the list.
      if (!isMajorImpact(e.severity)) return false;
      // Closures: only fresh, unplanned ones (planned closures for works run for days or weeks).
      if (subtype !== "vägen avstängd") return true;
      return start >= nowMs - DAY && !PLANNED_WORK.test(`${e.title} ${e.summary ?? ""}`);
    }
    case "smhi":
      return true;
    default:
      return false;
  }
}

const ms = (t: Timestamp | null | undefined) => (t ? t.toMillis() : null);

function truncate(s: string | null, max: number): string | null {
  if (!s) return null;
  const clean = s.replace(/\s+\n/gu, "\n").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function toFeedEvent(id: string, e: StoredEvent): FeedEvent {
  const feed: FeedEvent = {
    id,
    s: e.source,
    c: e.category,
    t: e.subtype,
    ti: e.title,
    su: truncate(e.summary, SUMMARY_MAX),
    st: e.startTime.toMillis(),
    en: ms(e.endTime),
    up: ms(e.updatedAtSource),
    x: e.status,
    sv: e.severity,
    k: e.kommunKod,
    l: e.lanKod,
    r: e.roadNumber,
    g: e.geo ? [Math.round(e.geo.lat * 1e4) / 1e4, Math.round(e.geo.lng * 1e4) / 1e4] : null,
    gp: e.geoPrecision,
    u: e.sourceUrl,
  };
  if (e.en) feed.e = { ti: e.en.title, su: truncate(e.en.summary, SUMMARY_MAX) };
  return feed;
}

export type Shard = "live" | "week" | "month";

export function shardOf(ev: FeedEvent, now: Date): Shard | null {
  const age = now.getTime() - ev.st;
  if (ev.c === "varning" && ev.x === "aktiv") return "live";
  if (age <= 2 * DAY) return "live";
  if (age <= 7 * DAY) return "week";
  if (age <= FEED_DAYS * DAY) return "month";
  return null;
}

export function partition(events: Iterable<FeedEvent>, now: Date): Record<Shard, FeedEvent[]> {
  const out: Record<Shard, FeedEvent[]> = { live: [], week: [], month: [] };
  for (const ev of events) {
    const shard = shardOf(ev, now);
    if (shard) out[shard].push(ev);
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.st - a.st);
  return out;
}

interface FeedDoc {
  data?: string;
  hash?: string;
}

interface PublisherState {
  cursor: Timestamp;
  version: number;
}

/** Bump when eligibility or the feed format changes: the next run rebuilds the feeds from scratch. */
export const FEED_VERSION = 3;

/** Re-read window behind the cursor: serverTimestamp commits can land slightly out of order. */
const CURSOR_OVERLAP_MS = 60_000;

async function changedEvents(cursor: Timestamp | undefined, now: Date) {
  const col = firestore().collection(EVENTS);
  if (cursor) {
    const since = Timestamp.fromMillis(cursor.toMillis() - CURSOR_OVERLAP_MS);
    return (await col.where("ingestedAt", ">", since).orderBy("ingestedAt").limit(5000).get()).docs;
  }
  // First run: everything recent, plus long-running active warnings.
  const since = Timestamp.fromMillis(now.getTime() - FEED_DAYS * DAY);
  const [recent, warnings] = await Promise.all([
    col.where("startTime", ">=", since).get(),
    col.where("category", "==", "varning").where("status", "==", "aktiv").get(),
  ]);
  return [...recent.docs, ...warnings.docs];
}

export async function runPublishJob(now = new Date()) {
  const db = firestore();
  const stateRef = db.collection(INGEST_STATE).doc("publisher");
  const state = ((await stateRef.get()).data() ?? {}) as Partial<PublisherState>;
  const shardNames: Shard[] = ["live", "week", "month"];
  const shardRefs = shardNames.map((n) => db.collection(FEEDS).doc(n));

  const rebuild = state.version !== FEED_VERSION;
  const [docs, shardSnaps, sourceSnaps] = await Promise.all([
    changedEvents(rebuild ? undefined : state.cursor, now),
    db.getAll(...shardRefs),
    db.collection(SOURCES).get(),
  ]);

  // Current feed content, keyed by id.
  const current = new Map<string, FeedEvent>();
  for (const snap of rebuild ? [] : shardSnaps) {
    const data = (snap.data() as FeedDoc | undefined)?.data;
    if (data) for (const ev of JSON.parse(data) as FeedEvent[]) current.set(ev.id, ev);
  }

  let cursor = rebuild ? undefined : state.cursor;
  for (const doc of docs) {
    const e = doc.data() as StoredEvent;
    if (isFeedEligible(e, now)) current.set(doc.id, toFeedEvent(doc.id, e));
    else current.delete(doc.id);
    if (e.ingestedAt && (!cursor || e.ingestedAt.toMillis() > cursor.toMillis())) cursor = e.ingestedAt;
  }

  const shards = partition(current.values(), now);
  const sources = Object.fromEntries(
    sourceSnaps.docs.map((d) => {
      const s = d.data();
      return [
        d.id,
        {
          ok: ms(s.lastSuccessAt),
          err: ms(s.lastErrorAt),
          fails: s.consecutiveFailures ?? 0,
          attribution: s.attribution ?? null,
        },
      ];
    }),
  );

  const batch = db.batch();
  let written = 0;
  shardNames.forEach((name, i) => {
    // Firestore documents are capped at 1 MiB; drop the oldest entries if a shard ever gets close.
    while (shards[name].length && Buffer.byteLength(JSON.stringify(shards[name])) > MAX_SHARD_BYTES) {
      shards[name].pop();
      logger.warn(`feeds/${name} over size limit, dropping oldest event`);
    }
    const data = JSON.stringify(shards[name]);
    const hash = createHash("sha1").update(data).digest("hex").slice(0, 16);
    const extra = name === "live" ? { sources: JSON.stringify(sources) } : {};
    const unchanged = (shardSnaps[i].data() as FeedDoc | undefined)?.hash === hash;
    // The live doc always gets a fresh timestamp: it doubles as the "last checked" signal.
    if (unchanged && name !== "live") return;
    batch.set(shardRefs[i], {
      v: 1,
      data,
      hash,
      count: shards[name].length,
      generatedAt: FieldValue.serverTimestamp(),
      ...extra,
    });
    written++;
  });
  batch.set(
    stateRef,
    { cursor: cursor ?? Timestamp.fromDate(now), version: FEED_VERSION, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await batch.commit();

  return {
    rebuild,
    changed: docs.length,
    live: shards.live.length,
    week: shards.week.length,
    month: shards.month.length,
    shardsWritten: written,
  };
}
