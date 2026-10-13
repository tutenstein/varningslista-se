/**
 * Fetches live data and prints what would be stored — no Firestore access.
 *   npm run dry-run              (Polisen + SMHI)
 *   TRAFIKVERKET_API_KEY=… npm run dry-run
 * Respects Polisen's rules: a single call per run.
 */
import { ParsedEvent } from "../lib/model";
import { fetchPolisen, normalizePolisen } from "../sources/polisen";
import { fetchSmhiWarnings, normalizeSmhi } from "../sources/smhi";
import { fetchSituations, normalizeSituation } from "../sources/trafikverket";
import { hasUsableKey } from "../jobs";

function summarize(name: string, parsed: ParsedEvent[]) {
  const by = (key: (p: ParsedEvent) => string) => {
    const counts = new Map<string, number>();
    for (const p of parsed) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  };
  const noKommun = parsed.filter((p) => p.event.source === "polisen" && !p.event.kommunKod);
  console.log(`\n=== ${name}: ${parsed.length} events`);
  console.log("category:", Object.fromEntries(by((p) => p.event.category)));
  console.log("geoPrecision:", Object.fromEntries(by((p) => p.event.geoPrecision)));
  console.log("without län:", parsed.filter((p) => !p.event.lanKod).length);
  if (noKommun.length) console.log("polisen titles without kommun:", noKommun.slice(0, 10).map((p) => p.event.title));
  console.log("sample:", JSON.stringify(parsed[0]?.event, null, 2));
}

async function main() {
  summarize("Polisen", (await fetchPolisen()).map(normalizePolisen));
  summarize("SMHI", (await fetchSmhiWarnings()).flatMap((w) => normalizeSmhi(w)));
  const key = process.env.TRAFIKVERKET_API_KEY;
  if (hasUsableKey(key)) {
    const { situations, lastChangeId } = await fetchSituations(key, "0");
    summarize("Trafikverket", situations.flatMap((s) => normalizeSituation(s)));
    console.log("lastChangeId:", lastChangeId);
  } else {
    console.log("\n(Trafikverket skipped: TRAFIKVERKET_API_KEY not set)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
