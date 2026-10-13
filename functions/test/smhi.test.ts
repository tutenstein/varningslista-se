import { describe, expect, it } from "vitest";
import fixture from "./fixtures/smhi-warnings.json";
import { normalizeSmhi, SmhiWarning } from "../src/sources/smhi";

const warnings = fixture as SmhiWarning[];

describe("normalizeSmhi", () => {
  it("creates one event per warning area", () => {
    const total = warnings.reduce((n, w) => n + (w.warningAreas?.length ?? 0), 0);
    expect(warnings.flatMap(normalizeSmhi)).toHaveLength(total);
  });

  it("maps county area ids to SCB län codes", () => {
    const [first] = normalizeSmhi(warnings[0]);
    expect(first.event.lanKod).toBe("12");
    expect(first.event.lanNamn).toBe("Skåne län");
    expect(first.event.category).toBe("varning");
    expect(first.event.groupId).toBe(String(warnings[0].id));
  });

  it("keeps SMHI's English text for the English site", () => {
    const [first] = normalizeSmhi(warnings[0]);
    expect(first.event.en?.title).toContain("Skåne County");
    expect(first.event.en?.summary).toContain("groundwater");
  });

  it("leaves sea areas without a län", () => {
    const sea = normalizeSmhi(warnings[1]).filter((p) => !p.event.lanKod);
    expect(sea.length).toBeGreaterThan(0);
  });

  it("keeps SMHI's own text unchanged and credits SMHI", () => {
    const [first] = normalizeSmhi(warnings[0]);
    const original = warnings[0].warningAreas![0].descriptions![0].text!.sv!;
    expect(first.event.summary).toContain(original);
    expect(first.event.attribution).toBe("Källa: SMHI");
  });

  it("drops polygons from the raw payload and never produces nested arrays", () => {
    const [first] = normalizeSmhi(warnings[0]);
    expect(JSON.stringify(first.raw)).not.toContain('"coordinates"');
    expect(first.event.geo).not.toBeNull();
    expect(first.event.geoPrecision).toBe("omrade");
  });
});
