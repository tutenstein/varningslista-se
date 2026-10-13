import { describe, expect, it } from "vitest";
import { encodeGeohash } from "../src/lib/geohash";
import { findKommun, findLan } from "../src/lib/regions";
import { backfillDays, stockholmDate } from "../src/jobs";

describe("regions", () => {
  it("finds kommuner by name, case-insensitively and with suffixes", () => {
    expect(findKommun("Botkyrka")?.kod).toBe("0127");
    expect(findKommun("göteborg")?.lanKod).toBe("14");
    expect(findKommun("Botkyrka kommun")?.kod).toBe("0127");
    expect(findKommun("Stockholm")?.kod).toBe("0180");
    expect(findKommun("Upplands Bro")?.namn).toBe("Upplands-Bro");
    expect(findKommun("Atlantis")).toBeNull();
  });

  it("finds län by name or numeric code", () => {
    expect(findLan("Skåne län")?.kod).toBe("12");
    expect(findLan(1)?.namn).toBe("Stockholms län");
    expect(findLan("25")?.namn).toBe("Norrbottens län");
    expect(findLan(44)).toBeNull(); // SMHI sea area
  });
});

describe("geohash", () => {
  it("encodes a known point", () => {
    // Reference example from the geohash specification (Wikipedia).
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
  });
});

describe("backfill days", () => {
  it("lists yesterday back to N days ago in Swedish dates", () => {
    const now = new Date("2026-10-13T22:30:00Z"); // already 14 Oct in Sweden
    expect(stockholmDate(now)).toBe("2026-10-14");
    const days = backfillDays(now, 3);
    expect(days).toEqual(["2026-10-13", "2026-10-12", "2026-10-11"]);
  });
});
