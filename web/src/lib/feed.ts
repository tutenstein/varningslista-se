// Client for the precomputed feeds written by the `publishFeeds` Cloud Function.
// One Firestore REST GET per shard — no SDK, no queries against the event store.

export type Category = "trafikolycka" | "brand" | "raddning" | "trafikstorning" | "varning";
export type SourceId = "polisen" | "smhi" | "trafikverket";
export type Shard = "live" | "week" | "month";

export interface FeedEvent {
  id: string;
  s: SourceId;
  c: Category;
  t: string;
  ti: string;
  su: string | null;
  st: number;
  en: number | null;
  up: number | null;
  x: "aktiv" | "avslutad" | "okand";
  sv: string | null;
  k: string | null;
  l: string | null;
  r: string | null;
  g: [number, number] | null;
  gp: "exakt" | "omrade" | "kommun" | "lan" | "saknas";
  u: string | null;
  e?: { ti: string; su: string | null };
}

export interface SourceStatus {
  ok: number | null;
  err: number | null;
  fails: number;
  attribution: string | null;
}

export interface FeedShard {
  events: FeedEvent[];
  generatedAt: number | null;
  sources: Record<string, SourceStatus> | null;
}

const PROJECT = "varningslista-se";
export const FEED_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/feeds`;

export function feedUrl(shard: Shard): string {
  return `${FEED_BASE}/${shard}?mask.fieldPaths=data&mask.fieldPaths=sources&mask.fieldPaths=generatedAt`;
}

interface FirestoreDoc {
  fields?: {
    data?: { stringValue?: string };
    sources?: { stringValue?: string };
    generatedAt?: { timestampValue?: string };
  };
}

export function parseFeedDoc(doc: FirestoreDoc): FeedShard {
  const f = doc.fields ?? {};
  return {
    events: f.data?.stringValue ? (JSON.parse(f.data.stringValue) as FeedEvent[]) : [],
    generatedAt: f.generatedAt?.timestampValue ? Date.parse(f.generatedAt.timestampValue) : null,
    sources: f.sources?.stringValue ? (JSON.parse(f.sources.stringValue) as Record<string, SourceStatus>) : null,
  };
}

export async function fetchShard(shard: Shard, init?: RequestInit): Promise<FeedShard> {
  const res = await fetch(feedUrl(shard), { ...init, cache: "no-store" });
  if (!res.ok) throw new Error(`feed ${shard}: HTTP ${res.status}`);
  return parseFeedDoc((await res.json()) as FirestoreDoc);
}

// ---------------------------------------------------------------- filtering

export type Range = "24h" | "7d" | "30d";
export const RANGE_MS: Record<Range, number> = { "24h": 24 * 3600_000, "7d": 7 * 86400_000, "30d": 30 * 86400_000 };
export const shardsFor = (range: Range): Shard[] =>
  range === "24h" ? ["live"] : range === "7d" ? ["live", "week"] : ["live", "week", "month"];

export interface Filters {
  range: Range;
  categories: Set<Category>; // empty = all
  lan: string | null;
  kommun: string | null;
  q: string;
  near: { lat: number; lng: number; km: number } | null;
}

/** Great-circle distance in km. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/gu, "");
}

/** Road numbers ("E4", "222") must match a whole token, so "E4" doesn't find E45. */
const ROAD_LIKE = /^(e\d{1,3}|\d{1,4})$/u;

export function matchesQuery(q: string, text: string): boolean {
  const words = normalizeText(q).split(/\s+/u).filter(Boolean);
  const hay = normalizeText(text);
  const tokens = new Set(hay.split(/[^a-z0-9]+/u));
  return words.every((w) => (ROAD_LIKE.test(w) ? tokens.has(w) : hay.includes(w)));
}

/** Everything except the category filter (used for the category counts). */
export function matchesScope(ev: FeedEvent, f: Filters, now: number, searchText: (ev: FeedEvent) => string): boolean {
  const isActiveWarning = ev.c === "varning" && ev.x === "aktiv";
  if (!isActiveWarning && now - ev.st > RANGE_MS[f.range]) return false;
  if (f.kommun && ev.k !== f.kommun && !(ev.c === "varning" && ev.l === f.kommun.slice(0, 2))) return false;
  if (f.lan && ev.l !== f.lan) return false;
  if (f.near) {
    if (!ev.g || ev.gp === "lan" || ev.gp === "saknas") return false;
    if (distanceKm([f.near.lat, f.near.lng], ev.g) > f.near.km) return false;
  }
  if (f.q && !matchesQuery(f.q, searchText(ev))) return false;
  return true;
}

export function mergeShards(shards: FeedShard[]): FeedEvent[] {
  const byId = new Map<string, FeedEvent>();
  for (const sh of shards) for (const ev of sh.events) byId.set(ev.id, ev);
  return [...byId.values()].sort((a, b) => b.st - a.st);
}
