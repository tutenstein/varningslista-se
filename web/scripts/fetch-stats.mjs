// Build-time statistics for the kommun pages (runs in GitHub Actions, not Firebase).
//   - MCF (Myndigheten för civilt försvar): räddningstjänstens insatser per kommun and year
//   - SCB: population per kommun (for per-1000 rates)
// On any failure the committed src/data/stats.json is kept, so the build never breaks.
import { readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../src/data/stats.json", import.meta.url);
const MCF = "https://statistik.mcf.se/PXWeb/api/v1/sv/PxData";
const SCB = "https://api.scb.se/OV0104/v1/doris/sv/ssd/BE/BE0101/BE0101A/BefolkningNy";
const YEARS = 5;
const UA = "VarningslistaSE/0.1 (build; +https://varningslista-se.web.app)";

async function px(url, query) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ query, response: { format: "json-stat2" } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** json-stat2 -> Map<kommun, Map<year, number>> summing over every other dimension. */
function byKommunYear(ds, kommunDim, yearDim) {
  const ids = ds.id;
  const sizes = ds.size;
  const index = (dim) => Object.entries(ds.dimension[dim].category.index).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const labels = ids.map(index);
  const out = new Map();
  ds.value.forEach((value, flat) => {
    if (value == null) return;
    let rest = flat;
    const coords = new Array(ids.length);
    for (let d = ids.length - 1; d >= 0; d--) {
      coords[d] = rest % sizes[d];
      rest = Math.floor(rest / sizes[d]);
    }
    const kommun = labels[ids.indexOf(kommunDim)][coords[ids.indexOf(kommunDim)]];
    const year = labels[ids.indexOf(yearDim)][coords[ids.indexOf(yearDim)]];
    const m = out.get(kommun) ?? new Map();
    m.set(year, (m.get(year) ?? 0) + value);
    out.set(kommun, m);
  });
  return out;
}

const all = (code) => ({ code, selection: { filter: "all", values: ["*"] } });
const top = (code, n) => ({ code, selection: { filter: "top", values: [String(n)] } });

async function main() {
  const [events, accidents, fires, traffic] = await Promise.all([
    // All rescue-service call-outs, all mission types
    px(`${MCF}/B/B1/B10`, [all("kommun"), all("uppdragstypId"), top("ar", YEARS)]),
    // Only "Inträffad eller befarad olycka" (accidents and feared accidents)
    px(`${MCF}/B/B1/B10`, [all("kommun"), { code: "uppdragstypId", selection: { filter: "item", values: ["20"] } }, top("ar", YEARS)]),
    px(`${MCF}/B/B2/B20`, [all("kommun"), top("ar", YEARS)]),
    px(`${MCF}/B/B6/B60`, [all("kommun"), { code: "ContentsCode", selection: { filter: "item", values: ["B60A"] } }, top("ar", YEARS)]),
  ]);

  const regionCodes = Object.keys(events.dimension.kommun.category.index);
  const population = await (async () => {
    const res = await fetch(SCB, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        query: [
          { code: "Region", selection: { filter: "item", values: regionCodes } },
          { code: "ContentsCode", selection: { filter: "item", values: ["BE0101N1"] } },
          top("Tid", 1),
        ],
        response: { format: "json-stat2" },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`SCB: HTTP ${res.status}`);
    return res.json();
  })();

  const ev = byKommunYear(events, "kommun", "ar");
  const acc = byKommunYear(accidents, "kommun", "ar");
  const fir = byKommunYear(fires, "kommun", "ar");
  const tra = byKommunYear(traffic, "kommun", "ar");
  const pop = byKommunYear(population, "Region", "Tid");
  const years = Object.keys(events.dimension.ar.category.index).sort();
  const popYear = Object.keys(population.dimension.Tid.category.index)[0];

  const series = (m, k) => years.map((y) => m.get(k)?.get(y) ?? null);
  const kommuner = {};
  for (const k of regionCodes) {
    kommuner[k] = {
      pop: pop.get(k)?.get(popYear) ?? null,
      events: series(ev, k),
      accidents: series(acc, k),
      buildingFires: series(fir, k),
      trafficAccidents: series(tra, k),
    };
  }

  const stats = {
    generatedAt: new Date().toISOString(),
    years,
    populationYear: popYear,
    sources: {
      mcf: "Myndigheten för civilt försvar – Räddningstjänstens insatser (B10, B20, B60)",
      scb: "SCB – Folkmängd efter region (BE0101N1)",
    },
    kommuner,
  };
  await writeFile(OUT, `${JSON.stringify(stats)}\n`);
  console.log(`stats.json: ${regionCodes.length} kommuner, years ${years.join(", ")}, population ${popYear}`);
}

main().catch(async (err) => {
  const existing = await readFile(OUT, "utf8").catch(() => null);
  console.warn(`fetch-stats failed (${err.message}); ${existing ? "keeping committed stats.json" : "no stats available"}`);
  if (!existing) await writeFile(OUT, `${JSON.stringify({ generatedAt: null, years: [], kommuner: {} })}\n`);
});
