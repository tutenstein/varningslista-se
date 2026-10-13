import { describe, expect, it } from "vitest";
import fixture from "./fixtures/polisen-events.json";
import {
  categorizePolisen,
  normalizePolisen,
  parseIncidentTime,
  parsePolisenDatetime,
  PolisenEvent,
} from "../src/sources/polisen";

const events = fixture as PolisenEvent[];

describe("parsePolisenDatetime", () => {
  it("handles hours without zero padding", () => {
    expect(parsePolisenDatetime("2026-10-13 9:33:15 +02:00")?.toISOString()).toBe("2026-10-13T07:33:15.000Z");
  });
  it("returns null for garbage", () => {
    expect(parsePolisenDatetime("igår")).toBeNull();
  });
});

describe("parseIncidentTime", () => {
  it("reads local Swedish time from the title (summer time)", () => {
    const published = new Date("2026-10-13T14:31:12Z");
    expect(parseIncidentTime("13 oktober 14.10, Misshandel, Huddinge", published)?.toISOString()).toBe(
      "2026-10-13T12:10:00.000Z",
    );
  });
  it("uses winter time in January", () => {
    const published = new Date("2027-01-05T10:00:00Z");
    expect(parseIncidentTime("5 januari 08.00, Brand, Umeå", published)?.toISOString()).toBe("2027-01-05T07:00:00.000Z");
  });
  it("puts a December incident published in January in the previous year", () => {
    const published = new Date("2027-01-01T08:00:00Z");
    expect(parseIncidentTime("31 december 23.50, Brand, Malmö", published)?.getUTCFullYear()).toBe(2026);
  });
});

describe("categorizePolisen", () => {
  it.each([
    ["Trafikolycka, personskada", "trafikolycka"],
    ["Trafikolycka, vilt", "trafikolycka"],
    ["Brand", "brand"],
    ["Arbetsplatsolycka", "raddning"],
    ["Försvunnen person", "raddning"],
    ["Trafikhinder", "trafikstorning"],
    ["Sammanfattning natt", "ovrigt"],
    ["Misshandel", "brott"],
    ["Mordbrand", "brott"],
    ["Rattfylleri", "brott"],
    ["Vållande till kroppsskada", "brott"],
    ["Lagen om hundar och katter ", "ovrigt"],
    ["Farligt föremål, misstänkt", "ovrigt"],
  ])("%s -> %s", (type, category) => {
    expect(categorizePolisen(type)).toBe(category);
  });
});

describe("normalizePolisen", () => {
  it("takes the kommun from the last title segment, even when the type contains a comma", () => {
    const raw = events.find((e) => e.type === "Trafikolycka, personskada")!;
    const { event } = normalizePolisen(raw);
    const place = raw.name.split(",").pop()!.trim();
    expect(event.kommunNamn?.toLowerCase()).toBe(place.toLowerCase());
    expect(event.kommunKod).toMatch(/^\d{4}$/u);
    expect(event.lanKod).toBe(event.kommunKod!.slice(0, 2));
    expect(event.category).toBe("trafikolycka");
  });

  it("marks the county centroid as county-level precision, not the incident location", () => {
    const { event } = normalizePolisen(events[0]);
    expect(event.geo).not.toBeNull();
    expect(event.geoPrecision).toBe("lan");
    expect(event.geohash).toHaveLength(9);
  });

  it("resolves county summaries to a län without a kommun", () => {
    const raw = events.find((e) => e.type === "Sammanfattning natt")!;
    const { event } = normalizePolisen(raw);
    expect(event.kommunKod).toBeNull();
    expect(event.lanKod).toMatch(/^\d{2}$/u);
  });

  it("builds a stable id and an absolute source url", () => {
    const { event } = normalizePolisen(events[0]);
    expect(event.id).toBe(`polisen-${events[0].id}`);
    expect(event.sourceUrl).toMatch(/^https:\/\/polisen\.se\/aktuellt\/handelser\//u);
    expect(event.attribution).toContain("Polismyndigheten");
  });
});
