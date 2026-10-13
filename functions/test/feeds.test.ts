import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { FeedEvent, isFeedEligible, partition, shardOf, StoredEvent, toFeedEvent } from "../src/feeds";

const now = new Date("2026-10-13T12:00:00Z");
const hoursAgo = (h: number) => Timestamp.fromMillis(now.getTime() - h * 3600_000);

function stored(overrides: Partial<StoredEvent>): StoredEvent {
  return {
    source: "polisen",
    sourceId: "1",
    groupId: null,
    sourceUrl: "https://polisen.se/x",
    attribution: "Källa: Polismyndigheten",
    category: "trafikolycka",
    subtype: "Trafikolycka",
    title: "13 oktober 11.00, Trafikolycka, Botkyrka",
    summary: "En bil har kört av vägen.",
    startTime: hoursAgo(1),
    endTime: null,
    publishedAt: hoursAgo(1),
    updatedAtSource: hoursAgo(1),
    status: "okand",
    severity: null,
    kommunKod: "0127",
    kommunNamn: "Botkyrka",
    lanKod: "01",
    lanNamn: "Stockholms län",
    roadNumber: null,
    geo: { lat: 59.2, lng: 17.833333 },
    geohash: "u6sc",
    geoPrecision: "kommun",
    en: null,
    ...overrides,
  };
}

describe("isFeedEligible", () => {
  it("keeps emergency categories from Polisen and drops crime and summaries", () => {
    expect(isFeedEligible(stored({}), now)).toBe(true);
    expect(isFeedEligible(stored({ category: "brand" }), now)).toBe(true);
    expect(isFeedEligible(stored({ category: "brott", subtype: "Misshandel" }), now)).toBe(false);
    expect(isFeedEligible(stored({ category: "ovrigt", subtype: "Sammanfattning natt" }), now)).toBe(false);
  });

  it("keeps Trafikverket incidents but not planned works or standing restrictions", () => {
    const tv = (category: StoredEvent["category"], subtype: string, extra: Partial<StoredEvent> = {}) =>
      stored({ source: "trafikverket", category, subtype, ...extra });
    expect(isFeedEligible(tv("trafikolycka", "Olycka"), now)).toBe(true);
    expect(isFeedEligible(tv("trafikstorning", "Fordonshaveri", { severity: "Stor påverkan" }), now)).toBe(true);
    expect(isFeedEligible(tv("trafikstorning", "Fordonshaveri", { severity: "Liten påverkan" }), now)).toBe(false);
    expect(isFeedEligible(tv("trafikstorning", "Fordon på fel vägbana", { severity: "Liten påverkan" }), now)).toBe(true);
    expect(isFeedEligible(tv("vagarbete", "Vägarbete"), now)).toBe(false);
    expect(isFeedEligible(tv("trafikstorning", "Hastighetsbegränsning gäller"), now)).toBe(false);
    expect(isFeedEligible(tv("trafikstorning", "Körfältsavstängningar"), now)).toBe(false);
    expect(isFeedEligible(tv("trafikstorning", "Vägen avstängd", { severity: "Stor påverkan" }), now)).toBe(true);
    expect(isFeedEligible(tv("trafikstorning", "Vägen avstängd", { severity: "Liten påverkan" }), now)).toBe(false);
    expect(
      isFeedEligible(tv("trafikstorning", "Vägen avstängd", { severity: "Stor påverkan", startTime: hoursAgo(72) }), now),
    ).toBe(false);
    expect(
      isFeedEligible(
        tv("trafikstorning", "Vägen avstängd", { severity: "Stor påverkan", summary: "Underhållsarbete vid plankorsning." }),
        now,
      ),
    ).toBe(false);
  });

  it("drops events older than 30 days and planned future events", () => {
    expect(isFeedEligible(stored({ startTime: hoursAgo(31 * 24) }), now)).toBe(false);
    expect(isFeedEligible(stored({ startTime: hoursAgo(-5) }), now)).toBe(false);
  });

  it("keeps active warnings regardless of age", () => {
    const warning = stored({ source: "smhi", category: "varning", status: "aktiv", startTime: hoursAgo(24 * 170) });
    expect(isFeedEligible(warning, now)).toBe(true);
    expect(isFeedEligible({ ...warning, status: "avslutad" }, now)).toBe(false);
  });
});

describe("toFeedEvent", () => {
  it("produces a compact record with epoch times and rounded coordinates", () => {
    const ev = toFeedEvent("polisen-1", stored({ summary: "x".repeat(1000) }));
    expect(ev.st).toBe(now.getTime() - 3600_000);
    expect(ev.g).toEqual([59.2, 17.8333]);
    expect(ev.su!.length).toBeLessThanOrEqual(320);
    expect(ev.su!.endsWith("…")).toBe(true);
    expect(ev.e).toBeUndefined();
  });

  it("carries English text when available", () => {
    const ev = toFeedEvent("smhi-1", stored({ en: { title: "Yellow warning – Wind", summary: "Strong wind." } }));
    expect(ev.e).toEqual({ ti: "Yellow warning – Wind", su: "Strong wind." });
  });
});

describe("partition", () => {
  const ev = (id: string, ageHours: number, extra: Partial<FeedEvent> = {}): FeedEvent => ({
    ...toFeedEvent(id, stored({ startTime: hoursAgo(ageHours) })),
    ...extra,
  });

  it("splits by age into live / week / month and sorts newest first", () => {
    const parts = partition([ev("a", 50), ev("b", 1), ev("c", 3), ev("d", 24 * 10), ev("e", 24 * 40)], now);
    expect(parts.live.map((e) => e.id)).toEqual(["b", "c"]);
    expect(parts.week.map((e) => e.id)).toEqual(["a"]);
    expect(parts.month.map((e) => e.id)).toEqual(["d"]);
  });

  it("puts active warnings in live even when they started long ago", () => {
    expect(shardOf(ev("w", 24 * 100, { c: "varning", x: "aktiv" }), now)).toBe("live");
  });
});
