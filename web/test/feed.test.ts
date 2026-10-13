import { describe, expect, it } from "vitest";
import { distanceKm, matchesQuery, matchesScope, mergeShards, type FeedEvent, type Filters } from "../src/lib/feed";
import { alternatePath } from "../src/i18n";
import { KOMMUNS } from "../src/lib/regions";

const now = Date.UTC(2026, 9, 13, 12);
const ev = (over: Partial<FeedEvent> = {}): FeedEvent => ({
  id: "x",
  s: "trafikverket",
  c: "trafikolycka",
  t: "Olycka",
  ti: "Olycka, E4, E4 vid Kista",
  su: null,
  st: now - 3600_000,
  en: null,
  up: null,
  x: "aktiv",
  sv: null,
  k: "0180",
  l: "01",
  r: "E4",
  g: [59.4, 17.94],
  gp: "exakt",
  u: null,
  ...over,
});
const filters = (over: Partial<Filters> = {}): Filters => ({
  range: "24h",
  categories: new Set(),
  lan: null,
  kommun: null,
  q: "",
  near: null,
  ...over,
});
const text = (e: FeedEvent) => [e.t, e.ti, e.su, e.r].filter(Boolean).join(" ");

describe("search", () => {
  it("matches road numbers as whole tokens", () => {
    expect(matchesQuery("E4", "Olycka E4 vid Kista")).toBe(true);
    expect(matchesQuery("E4", "Olycka E45 vid Trollhättan")).toBe(false);
    expect(matchesQuery("132", "Väg 132 från Renstorp")).toBe(true);
    expect(matchesQuery("13", "Väg 132 från Renstorp")).toBe(false);
  });

  it("matches words as substrings, ignoring case and diacritics", () => {
    expect(matchesQuery("goteborg olyck", "Trafikolycka i Göteborg")).toBe(true);
    expect(matchesQuery("brand", "Trafikolycka i Göteborg")).toBe(false);
  });
});

describe("matchesScope", () => {
  it("applies time range, county, municipality and distance", () => {
    expect(matchesScope(ev(), filters(), now, text)).toBe(true);
    expect(matchesScope(ev({ st: now - 2 * 86400_000 }), filters(), now, text)).toBe(false);
    expect(matchesScope(ev({ st: now - 2 * 86400_000 }), filters({ range: "7d" }), now, text)).toBe(true);
    expect(matchesScope(ev(), filters({ lan: "14" }), now, text)).toBe(false);
    expect(matchesScope(ev(), filters({ kommun: "0127" }), now, text)).toBe(false);
    expect(matchesScope(ev(), filters({ near: { lat: 59.33, lng: 18.06, km: 25 } }), now, text)).toBe(true);
    expect(matchesScope(ev(), filters({ near: { lat: 57.7, lng: 11.97, km: 25 } }), now, text)).toBe(false);
  });

  it("never treats county-centroid positions as near", () => {
    expect(matchesScope(ev({ gp: "lan" }), filters({ near: { lat: 59.4, lng: 17.94, km: 100 } }), now, text)).toBe(false);
  });

  it("keeps active warnings of the municipality's county regardless of age", () => {
    const w = ev({ s: "smhi", c: "varning", k: null, l: "01", st: now - 100 * 86400_000, x: "aktiv" });
    expect(matchesScope(w, filters({ kommun: "0180" }), now, text)).toBe(true);
  });
});

describe("helpers", () => {
  it("computes distances", () => {
    const d = distanceKm([59.3293, 18.0686], [57.7089, 11.9746]); // Stockholm–Göteborg ≈ 397 km
    expect(d).toBeGreaterThan(395);
    expect(d).toBeLessThan(400);
  });

  it("merges shards newest first without duplicates", () => {
    const merged = mergeShards([
      { events: [ev({ id: "a", st: 1 }), ev({ id: "b", st: 3 })], generatedAt: null, sources: null },
      { events: [ev({ id: "a", st: 1 }), ev({ id: "c", st: 2 })], generatedAt: null, sources: null },
    ]);
    expect(merged.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("maps pages between languages", () => {
    expect(alternatePath("/kommun/botkyrka/", "en")).toBe("/en/municipality/botkyrka/");
    expect(alternatePath("/en/county/skane-lan/", "sv")).toBe("/lan/skane-lan/");
    expect(alternatePath("/om/", "en")).toBe("/en/about/");
    expect(alternatePath("/", "en")).toBe("/en/");
  });

  it("gives every kommun a unique slug", () => {
    expect(new Set(KOMMUNS.map((k) => k.slug)).size).toBe(KOMMUNS.length);
    expect(KOMMUNS.filter((k) => k.slug.startsWith("habo")).map((k) => k.slug).sort()).toEqual(["habo-jonkoping", "habo-uppsala"]);
  });
});
