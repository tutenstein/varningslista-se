import { describe, expect, it } from "vitest";
import {
  buildSituationQuery,
  categorizeTrafikverket,
  normalizeSituation,
  parseWgs84,
  TrafikverketSituation,
} from "../src/sources/trafikverket";
import { hasUsableKey } from "../src/jobs";

// Synthetic example shaped after the published Situation data model.
// Replace with a real captured response once the API key is available.
const situation: TrafikverketSituation = {
  Id: "SE_STA_TRISSID_1_1234567",
  PublicationTime: "2026-10-13T14:00:00.000+02:00",
  ModifiedTime: "2026-10-13T14:05:00.000+02:00",
  Deviation: [
    {
      Id: "SE_STA_TRISSID_1_1234567:1",
      MessageType: "Olycka",
      MessageCode: "Olycka",
      Header: "Olycka med flera fordon",
      Message: "Körfält avstängt.",
      SeverityCode: 4,
      SeverityText: "Stor påverkan",
      StartTime: "2026-10-13T13:55:00.000+02:00",
      CountyNo: [1],
      RoadNumber: "E4",
      LocationDescriptor: "E4 från Trafikplats Kista till Trafikplats Häggvik",
      Geometry: { Point: { WGS84: "POINT (17.9401 59.4031)" } },
    },
  ],
};

describe("trafikverket", () => {
  it("parses WKT points as lat/lng", () => {
    expect(parseWgs84("POINT (17.9401 59.4031)")).toEqual({ lat: 59.4031, lng: 17.9401 });
    expect(parseWgs84("LINESTRING (11.9 57.7, 12.0 57.8)")).toEqual({ lat: 57.7, lng: 11.9 });
    expect(parseWgs84(undefined)).toBeNull();
  });

  it("categorizes message types", () => {
    expect(categorizeTrafikverket("Olycka", undefined)).toBe("trafikolycka");
    expect(categorizeTrafikverket("Vägarbete", "Vägarbete")).toBe("vagarbete");
    expect(categorizeTrafikverket("Hinder", "Fordonsbrand")).toBe("brand");
    expect(categorizeTrafikverket("Restriktion", undefined)).toBe("trafikstorning");
  });

  it("normalizes a deviation with exact position, road and county", () => {
    const [{ event }] = normalizeSituation(situation, new Date("2026-10-13T12:10:00Z"));
    expect(event.id).toBe("trafikverket-SE_STA_TRISSID_1_1234567:1");
    expect(event.groupId).toBe(situation.Id);
    expect(event.category).toBe("trafikolycka");
    expect(event.roadNumber).toBe("E4");
    expect(event.lanKod).toBe("01");
    expect(event.geoPrecision).toBe("exakt");
    expect(event.status).toBe("aktiv");
  });

  it("marks deleted situations as ended", () => {
    const [{ event }] = normalizeSituation({ ...situation, Deleted: true }, new Date("2026-10-13T12:10:00Z"));
    expect(event.status).toBe("avslutad");
    expect(event.endTime).not.toBeNull();
  });

  it("queries Situation 1.6 in the road.trafficinfo namespace with changeid", () => {
    const xml = buildSituationQuery("key", "123");
    expect(xml).toContain('objecttype="Situation" namespace="road.trafficinfo" schemaversion="1.6"');
    expect(xml).toContain('changeid="123"');
  });

  it("escapes the key in the XML query", () => {
    expect(buildSituationQuery('a"b<c', "0")).toContain('authenticationkey="a&#34;b&#60;c"');
  });

  it("treats a missing or placeholder key as inactive", () => {
    expect(hasUsableKey(undefined)).toBe(false);
    expect(hasUsableKey("SAKNAS")).toBe(false);
    expect(hasUsableKey("0123456789abcdef0123456789abcdef")).toBe(true);
  });
});
