import { fetchJson } from "../lib/http";
import { encodeGeohash } from "../lib/geohash";
import { eventId, GeoPoint, ParsedEvent } from "../lib/model";
import { findLan } from "../lib/regions";

/**
 * SMHI impact-based weather warnings (IBWW). Free incl. commercial use, but the
 * warning content must not be altered and SMHI must always be credited.
 * https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning
 * Only current warnings are published — there is no history to backfill.
 */
export const SMHI_WARNINGS_API = "https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json";
export const SMHI_ATTRIBUTION = "Källa: SMHI";
export const SMHI_WARNINGS_PAGE = "https://www.smhi.se/vader/varningar-och-brandrisk/varningar-och-meddelanden";

interface Text {
  sv?: string;
  en?: string;
  code?: string;
}

interface SmhiWarningArea {
  id: number;
  approximateStart?: string;
  approximateEnd?: string;
  published?: string;
  created?: string;
  areaName?: Text;
  warningLevel?: Text;
  eventDescription?: Text;
  affectedAreas?: { id: number; sv?: string; en?: string }[];
  descriptions?: { title?: Text; text?: Text }[];
  area?: { geometry?: { type: string; coordinates: unknown } };
}

export interface SmhiWarning {
  id: number;
  event?: Text & { mhoClassification?: Text };
  descriptions?: { title?: Text; text?: Text }[];
  warningAreas?: SmhiWarningArea[];
}

export async function fetchSmhiWarnings(): Promise<SmhiWarning[]> {
  const data = await fetchJson<SmhiWarning[]>(SMHI_WARNINGS_API);
  if (!Array.isArray(data)) throw new Error("SMHI: unexpected response shape");
  return data;
}

/** Rough centre of the polygon's bounding box — enough for "near me" at area level. */
function bboxCenter(coordinates: unknown): GeoPoint | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      const [lng, lat] = c as number[];
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    } else if (Array.isArray(c)) {
      c.forEach(walk);
    }
  };
  walk(coordinates);
  return Number.isFinite(minLat) ? { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 } : null;
}

const toDate = (s?: string) => (s ? new Date(s) : null);

/** One event per warning area (an area has its own level, period and geometry). */
export function normalizeSmhi(warning: SmhiWarning): ParsedEvent[] {
  return (warning.warningAreas ?? []).map((area) => {
    // Ids 1–25 are counties (same codes as SCB); higher ids are sea / mountain areas.
    const counties = (area.affectedAreas ?? []).map((a) => findLan(a.id)).filter((l) => l !== null);
    const lan = counties.length === 1 ? counties[0] : null;
    const geo = area.area?.geometry ? bboxCenter(area.area.geometry.coordinates) : null;
    const level = area.warningLevel?.sv ?? "";
    const what = area.eventDescription?.sv ?? warning.event?.sv ?? "Varning";
    const where = area.areaName?.sv ?? (area.affectedAreas ?? []).map((a) => a.sv).join(", ");
    const description = (area.descriptions ?? [])
      .map((d) => d.text?.sv)
      .filter(Boolean)
      .join("\n\n");
    const published = toDate(area.published);
    // Polygons can be large; keep them out of the stored raw payload.
    const { area: _polygon, ...areaWithoutPolygon } = area;

    return {
      raw: { warningId: warning.id, event: warning.event, area: areaWithoutPolygon },
      event: {
        id: eventId("smhi", area.id),
        source: "smhi",
        sourceId: String(area.id),
        groupId: String(warning.id),
        sourceUrl: SMHI_WARNINGS_PAGE,
        attribution: SMHI_ATTRIBUTION,
        category: "varning",
        subtype: warning.event?.sv ?? "Varning",
        title: [level, what, where].filter(Boolean).join(" – "),
        summary: description || null,
        startTime: toDate(area.approximateStart) ?? published ?? new Date(),
        endTime: toDate(area.approximateEnd),
        publishedAt: toDate(area.created) ?? published,
        updatedAtSource: published,
        status: "aktiv",
        severity: area.warningLevel?.code ?? null,
        kommunKod: null,
        kommunNamn: null,
        lanKod: lan?.kod ?? null,
        lanNamn: lan?.namn ?? null,
        roadNumber: null,
        geo,
        geohash: geo ? encodeGeohash(geo.lat, geo.lng) : null,
        geoPrecision: geo ? "omrade" : "saknas",
      },
    };
  });
}
