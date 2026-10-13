import { fetchJson } from "../lib/http";
import { encodeGeohash } from "../lib/geohash";
import { Category, eventId, GeoPoint, ParsedEvent } from "../lib/model";
import { findLan } from "../lib/regions";

/**
 * Trafikverket open API (CC0). Requires a free key from https://data.trafikverket.se/.
 * We poll `Situation` with `changeid` so each run only returns what changed since
 * the previous one; `includedeletedobjects` tells us when a situation has ended.
 * Only currently active situations are available — there is no history to backfill.
 *
 * Situation lives in the "road.trafficinfo" namespace and only schema 1.6 is
 * accepted (verified 2026-10-13 with lib/cli/trafikverketProbe.js).
 */
export const TRAFIKVERKET_API = "https://api.trafikinfo.trafikverket.se/v2/data.json";
export const TRAFIKVERKET_ATTRIBUTION = "Källa: Trafikverket";
export const TRAFIKVERKET_SCHEMA_VERSION = "1.6";
export const TRAFIKVERKET_NAMESPACE = "road.trafficinfo";

export interface TrafikverketDeviation {
  Id: string;
  Header?: string;
  Message?: string;
  MessageType?: string; // "Olycka", "Vägarbete", "Hinder", "Restriktion", "Färjor", …
  MessageCode?: string;
  SeverityCode?: number;
  SeverityText?: string;
  StartTime?: string;
  EndTime?: string;
  VersionTime?: string;
  CreationTime?: string;
  CountyNo?: number[];
  RoadNumber?: string;
  RoadNumberNumeric?: number;
  LocationDescriptor?: string;
  WebLink?: string;
  Geometry?: { Point?: { WGS84?: string }; Line?: { WGS84?: string } };
}

export interface TrafikverketSituation {
  Id: string;
  PublicationTime?: string;
  ModifiedTime?: string;
  Deleted?: boolean;
  Deviation?: TrafikverketDeviation[];
}

interface TrafikverketResponse {
  RESPONSE?: {
    RESULT?: { Situation?: TrafikverketSituation[]; INFO?: { LASTCHANGEID?: string }; ERROR?: unknown }[];
  };
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/gu, (c) => `&#${c.charCodeAt(0)};`);
}

export function buildSituationQuery(apiKey: string, changeId: string): string {
  return [
    "<REQUEST>",
    `  <LOGIN authenticationkey="${escapeXml(apiKey)}" />`,
    `  <QUERY objecttype="Situation" namespace="${TRAFIKVERKET_NAMESPACE}" schemaversion="${TRAFIKVERKET_SCHEMA_VERSION}" changeid="${escapeXml(changeId)}" includedeletedobjects="true" />`,
    "</REQUEST>",
  ].join("\n");
}

export async function fetchSituations(
  apiKey: string,
  changeId: string,
): Promise<{ situations: TrafikverketSituation[]; lastChangeId: string | null }> {
  const res = await fetchJson<TrafikverketResponse>(TRAFIKVERKET_API, {
    method: "POST",
    body: buildSituationQuery(apiKey, changeId),
    headers: { "Content-Type": "text/xml" },
    timeoutMs: 60_000,
  });
  const result = res.RESPONSE?.RESULT?.[0];
  if (!result) throw new Error("Trafikverket: unexpected response shape");
  if (result.ERROR) throw new Error(`Trafikverket: ${JSON.stringify(result.ERROR).slice(0, 300)}`);
  return { situations: result.Situation ?? [], lastChangeId: result.INFO?.LASTCHANGEID ?? null };
}

/** "POINT (18.06 59.33)" -> { lat: 59.33, lng: 18.06 }; for lines, the first coordinate. */
export function parseWgs84(wkt: string | undefined): GeoPoint | null {
  if (!wkt) return null;
  const m = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/u.exec(wkt);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function categorizeTrafikverket(messageType: string | undefined, messageCode: string | undefined): Category {
  const t = (messageType ?? "").toLowerCase();
  const c = (messageCode ?? "").toLowerCase();
  if (t === "olycka" || c.includes("olycka")) return "trafikolycka";
  if (t === "vägarbete" || c.includes("vägarbete")) return "vagarbete";
  if (c.includes("brand")) return "brand";
  return "trafikstorning";
}

const toDate = (s?: string) => (s ? new Date(s) : null);

/** One event per deviation; deleted situations are marked as ended. */
export function normalizeSituation(situation: TrafikverketSituation, now = new Date()): ParsedEvent[] {
  return (situation.Deviation ?? []).map((d) => {
    const geo = parseWgs84(d.Geometry?.Point?.WGS84) ?? parseWgs84(d.Geometry?.Line?.WGS84);
    const lan = d.CountyNo?.length === 1 ? findLan(d.CountyNo[0]) : null;
    const end = toDate(d.EndTime);
    const ended = situation.Deleted === true || (end !== null && end.getTime() < now.getTime());
    const road = d.RoadNumber ?? (d.RoadNumberNumeric ? String(d.RoadNumberNumeric) : null);
    const title = [d.MessageCode ?? d.MessageType, road, d.LocationDescriptor].filter(Boolean).join(", ");

    return {
      raw: { situationId: situation.Id, deleted: situation.Deleted ?? false, deviation: d },
      event: {
        id: eventId("trafikverket", d.Id),
        source: "trafikverket",
        sourceId: d.Id,
        groupId: situation.Id,
        sourceUrl: d.WebLink ?? null,
        attribution: TRAFIKVERKET_ATTRIBUTION,
        category: categorizeTrafikverket(d.MessageType, d.MessageCode),
        subtype: d.MessageCode ?? d.MessageType ?? "Trafikinformation",
        title: d.Header ? `${title} – ${d.Header}` : title || "Trafikinformation",
        summary: d.Message?.trim() || null,
        startTime: toDate(d.StartTime) ?? toDate(d.CreationTime) ?? toDate(situation.PublicationTime) ?? now,
        endTime: situation.Deleted && !end ? now : end,
        publishedAt: toDate(d.CreationTime) ?? toDate(situation.PublicationTime),
        updatedAtSource: toDate(d.VersionTime) ?? toDate(situation.ModifiedTime),
        status: ended ? "avslutad" : "aktiv",
        severity: d.SeverityText ?? (d.SeverityCode !== undefined ? String(d.SeverityCode) : null),
        kommunKod: null,
        kommunNamn: null,
        lanKod: lan?.kod ?? null,
        lanNamn: lan?.namn ?? null,
        roadNumber: road,
        geo,
        geohash: geo ? encodeGeohash(geo.lat, geo.lng) : null,
        geoPrecision: geo ? "exakt" : "saknas",
        en: null,
      },
    };
  });
}
