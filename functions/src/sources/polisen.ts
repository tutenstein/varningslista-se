import { fetchJson } from "../lib/http";
import { encodeGeohash } from "../lib/geohash";
import { Category, eventId, ParsedEvent } from "../lib/model";
import { KOMMUN_GEO } from "../data/kommunGeo";
import { findKommun, findLan } from "../lib/regions";

/**
 * Polisen open data: https://polisen.se/om-polisen/om-webbplatsen/oppna-data/
 * Rules: >= 10 s between calls, <= 60 calls/hour, User-Agent with contact info,
 * attribution "Polismyndigheten". The plain endpoint returns the 500 latest notices;
 * `?DateTime=YYYY-MM-DD` returns one day, also older than the 500 window.
 */
export const POLISEN_API = "https://polisen.se/api/events";
export const POLISEN_BASE = "https://polisen.se";
export const POLISEN_ATTRIBUTION = "Källa: Polismyndigheten";
/** Minimum spacing between two calls in the same run. */
export const POLISEN_MIN_INTERVAL_MS = 11_000;

export interface PolisenEvent {
  id: number;
  datetime: string; // "2026-10-13 9:33:15 +02:00" (hour not zero padded)
  name: string; // "13 oktober 14.10, Trafikolycka, personskada, Botkyrka"
  summary: string;
  url: string;
  type: string;
  location: { name: string; gps: string };
}

export async function fetchPolisen(day?: string): Promise<PolisenEvent[]> {
  const url = day ? `${POLISEN_API}?DateTime=${encodeURIComponent(day)}` : POLISEN_API;
  // attempts: 1 — retrying immediately would break the 10 s rule.
  const data = await fetchJson<PolisenEvent[]>(url, { attempts: 1 });
  if (!Array.isArray(data)) throw new Error("Polisen: unexpected response shape");
  return data;
}

const MONTHS: Record<string, number> = {
  januari: 0,
  februari: 1,
  mars: 2,
  april: 3,
  maj: 4,
  juni: 5,
  juli: 6,
  augusti: 7,
  september: 8,
  oktober: 9,
  november: 10,
  december: 11,
};

/** "2026-10-13 9:33:15 +02:00" -> Date */
export function parsePolisenDatetime(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2}) ([+-]\d{2}):?(\d{2})$/u.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se, oh, om] = m;
  const iso = `${y}-${mo}-${d}T${h.padStart(2, "0")}:${mi}:${se}${oh}:${om}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Offset of Europe/Stockholm at a given instant, e.g. "+02:00". */
function stockholmOffset(at: Date): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Stockholm", timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-]\d{2}:\d{2})/u.exec(part ?? "");
  return m ? m[1] : "+01:00";
}

/**
 * The title starts with the incident time in Swedish local time, without a year:
 * "13 oktober 14.10, ...". The year comes from the publish time; an incident in
 * December published in January belongs to the previous year.
 */
export function parseIncidentTime(name: string, published: Date): Date | null {
  const m = /^(\d{1,2}) ([a-zåäö]+)(?: (\d{1,2})[.:](\d{2}))?/iu.exec(name.trim());
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  const day = Number(m[1]);
  const hour = m[3] ? Number(m[3]) : 0;
  const minute = m[4] ? Number(m[4]) : 0;

  const build = (year: number) => {
    const local = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    // Resolve the offset at (roughly) that instant to get DST right.
    const guess = new Date(`${local}Z`);
    return new Date(`${local}${stockholmOffset(guess)}`);
  };

  let date = build(published.getFullYear());
  if (date.getTime() - published.getTime() > 2 * 24 * 3600_000) {
    date = build(published.getFullYear() - 1);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

const CRIME =
  /brott|vållande|hets mot|misshandel|stöld|rån|inbrott|mord|dråp|våld|hot\b|narkotika|fylleri|skadegörelse|bedrägeri|ofredande|olaga|sexual|våldtäkt|knivlagen|vapen|häleri|skottlossning|bråk|olovlig körning|anträffat stulet|tillgrepp|utpressning|frihetsberövande|människohandel|kidnappning|egenmäktigt|förfalskning|penningtvätt|smuggling|ordningslagen|missbruk|övergrepp|grov|detonation|sprängning|bombhot|ofog/iu;

export function categorizePolisen(type: string): Category {
  const t = type.trim().toLowerCase();
  if (t.startsWith("trafikolycka")) return "trafikolycka";
  if (t === "brand" || t.startsWith("brand,") || t === "brand automatlarm") return "brand";
  if (t.startsWith("trafikhinder")) return "trafikstorning";
  if (
    /^(räddningsinsats|olycka|arbetsplatsolycka|drunkning|fjällräddning|sjöräddning|försvunnen person|ras|explosion|gasläcka|luftfartsolycka|sjukdom\/olycksfall|naturkatastrof)/u.test(
      t,
    )
  ) {
    return "raddning";
  }
  if (t === "mordbrand") return "brott";
  if (t.startsWith("sammanfattning") || /^(information|övrigt|djur|polisinsats\/kommendering|kontroll|trafikkontroll|uppdatering|larm)/u.test(t)) {
    return "ovrigt";
  }
  if (CRIME.test(t) || t.startsWith("trafikbrott") || t.startsWith("rattfylleri")) return "brott";
  return "ovrigt";
}

function parseGps(gps: string | undefined): { lat: number; lng: number } | null {
  if (!gps) return null;
  const [lat, lng] = gps.split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function normalizePolisen(raw: PolisenEvent): ParsedEvent {
  const published = parsePolisenDatetime(raw.datetime);
  const parts = raw.name.split(",").map((p) => p.trim());
  const placeFromTitle = parts.length >= 3 ? parts[parts.length - 1] : null;

  const kommun = findKommun(placeFromTitle) ?? findKommun(raw.location?.name);
  const lan = kommun ? { kod: kommun.lanKod, namn: kommun.lanNamn } : findLan(raw.location?.name) ?? findLan(placeFromTitle);

  // Polisen's coordinate is the centroid of `location.name` (usually the county), never the
  // incident. When the title names a kommun, its centre point is a better approximation.
  const kommunPoint = kommun ? KOMMUN_GEO[kommun.kod] : undefined;
  const polisenPoint = parseGps(raw.location?.gps);
  const locationIsLan = /län$/iu.test(raw.location?.name ?? "");
  const geo = kommunPoint ? { lat: kommunPoint[0], lng: kommunPoint[1] } : polisenPoint;
  const geoPrecision = kommunPoint
    ? "kommun"
    : polisenPoint
      ? locationIsLan
        ? "lan"
        : "omrade"
      : "saknas";

  const startTime = (published && parseIncidentTime(raw.name, published)) ?? published ?? new Date();

  return {
    raw,
    event: {
      id: eventId("polisen", raw.id),
      source: "polisen",
      sourceId: String(raw.id),
      groupId: null,
      sourceUrl: raw.url ? new URL(raw.url, POLISEN_BASE).toString() : null,
      attribution: POLISEN_ATTRIBUTION,
      category: categorizePolisen(raw.type),
      subtype: raw.type.trim(),
      title: raw.name,
      summary: raw.summary?.trim() || null,
      startTime,
      endTime: null,
      publishedAt: published,
      updatedAtSource: published,
      status: "okand",
      severity: null,
      kommunKod: kommun?.kod ?? null,
      kommunNamn: kommun?.namn ?? null,
      lanKod: lan?.kod ?? null,
      lanNamn: lan?.namn ?? null,
      roadNumber: null,
      geo,
      geohash: geo ? encodeGeohash(geo.lat, geo.lng) : null,
      geoPrecision,
      en: null,
    },
  };
}
