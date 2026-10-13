export type SourceId = "polisen" | "smhi" | "trafikverket";

/** Our own taxonomy, shared by every source. */
export type Category =
  | "trafikolycka" // road traffic accident
  | "brand" // fire
  | "raddning" // rescue / other accident (drowning, missing person, workplace accident …)
  | "trafikstorning" // traffic disruption (obstacle, restriction, ferry …)
  | "vagarbete" // roadworks
  | "varning" // weather / hydrological warning
  | "brott" // crime notice (stored, hidden by default in the UI)
  | "ovrigt"; // summaries, information, everything else

export type EventStatus = "aktiv" | "avslutad" | "okand";

/**
 * How precise `geo` is. Polisen only gives the county centroid, so the UI must
 * never present such a point as the incident location.
 */
export type GeoPrecision = "exakt" | "omrade" | "kommun" | "lan" | "saknas";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface NormalizedEvent {
  /** Firestore document id: `${source}-${sourceId}` */
  id: string;
  source: SourceId;
  sourceId: string;
  /** Parent object at the source (Trafikverket situation, SMHI warning); null if none. */
  groupId: string | null;
  sourceUrl: string | null;
  attribution: string;

  category: Category;
  /** Original type label from the source, e.g. "Trafikolycka, personskada". */
  subtype: string;
  title: string;
  summary: string | null;

  startTime: Date;
  endTime: Date | null;
  publishedAt: Date | null;
  updatedAtSource: Date | null;
  status: EventStatus;
  severity: string | null;

  kommunKod: string | null;
  kommunNamn: string | null;
  lanKod: string | null;
  lanNamn: string | null;
  roadNumber: string | null;

  geo: GeoPoint | null;
  geohash: string | null;
  geoPrecision: GeoPrecision;

  /** English text when the source publishes one (SMHI); otherwise null. */
  en: { title: string; summary: string | null } | null;
}

/** Normalized event plus the untouched source payload (stored separately). */
export interface ParsedEvent {
  event: NormalizedEvent;
  raw: unknown;
}

export function eventId(source: SourceId, sourceId: string | number): string {
  return `${source}-${sourceId}`;
}
