/**
 * Diagnoses which Trafikverket object types the API key can read.
 * Prints only OK/error per variant — never the key.
 *   TRAFIKVERKET_API_KEY=… node lib/cli/trafikverketProbe.js
 */
import { TRAFIKVERKET_API } from "../sources/trafikverket";
import { userAgent } from "../lib/http";

const VARIANTS: { objecttype: string; schemaversion: string; namespace?: string }[] = [
  { objecttype: "Situation", schemaversion: "1.6", namespace: "road.trafficinfo" },
  { objecttype: "RoadCondition", schemaversion: "1.2" },
  { objecttype: "TrainStation", schemaversion: "1.4", namespace: "rail.infrastructure" },
];

async function main() {
  const key = process.env.TRAFIKVERKET_API_KEY?.trim();
  if (!key) throw new Error("TRAFIKVERKET_API_KEY is not set");
  for (const v of VARIANTS) {
    const ns = v.namespace ? ` namespace="${v.namespace}"` : "";
    const body = `<REQUEST><LOGIN authenticationkey="${key}" /><QUERY objecttype="${v.objecttype}" schemaversion="${v.schemaversion}"${ns} limit="1" /></REQUEST>`;
    const label = `${v.objecttype} ${v.schemaversion}${v.namespace ? ` (${v.namespace})` : ""}`;
    try {
      const res = await fetch(TRAFIKVERKET_API, {
        method: "POST",
        body,
        headers: { "Content-Type": "text/xml", "User-Agent": userAgent() },
        signal: AbortSignal.timeout(20_000),
      });
      const json = (await res.json()) as { RESPONSE?: { RESULT?: Record<string, unknown>[] } };
      const result = json.RESPONSE?.RESULT?.[0] ?? {};
      const error = result.ERROR as { MESSAGE?: string } | undefined;
      const rows = Array.isArray(result[v.objecttype]) ? (result[v.objecttype] as unknown[]).length : 0;
      console.log(error ? `✗ ${label}: HTTP ${res.status} – ${error.MESSAGE}` : `✓ ${label}: HTTP ${res.status}, ${rows} rad`);
    } catch (err) {
      console.log(`✗ ${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
