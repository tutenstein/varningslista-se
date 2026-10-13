import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentType } from "preact";
import { detailText, routes, smhiLevel, t, typeLabel, type Lang } from "../i18n";
import { CATEGORIES, LEVEL_ORDER, LIST_CATEGORIES } from "../lib/categories";
import {
  fetchShard,
  matchesScope,
  mergeShards,
  parseFeedDoc,
  shardsFor,
  type Category,
  type FeedEvent,
  type FeedShard,
  type Filters,
  type Range,
  type Shard,
} from "../lib/feed";
import { ago, clock, dateTime, dayKey, dayLabel, number } from "../lib/format";
import { kommunByCode, kommunName, lanByCode, LANS, lanName } from "../lib/regions";
import Icon from "./Icon";
import type { MapProps } from "./EventMap";

interface Props {
  lang: Lang;
  /** Fixed scope for county / municipality pages. */
  lan?: string;
  kommun?: string;
}

const PAGE = 50;
const LIVE_REFRESH_MS = 60_000;
const OLDER_REFRESH_MS = 10 * 60_000;
const RADII = [5, 10, 25, 50, 100];

declare global {
  interface Window {
    __vlLive?: Promise<unknown>;
  }
}

type LoadState = "loading" | "ok" | "error";
type GeoState = "idle" | "locating" | "denied" | "unsupported";

function readUrl(scoped: boolean): Partial<Filters> {
  if (typeof location === "undefined") return {};
  const p = new URLSearchParams(location.search);
  const range = p.get("t");
  const cats = (p.get("c") ?? "").split(",").filter((c): c is Category => (CATEGORIES as string[]).includes(c));
  return {
    range: range === "7d" || range === "30d" || range === "24h" ? range : undefined,
    categories: new Set(cats),
    lan: !scoped && p.get("lan") && lanByCode.has(p.get("lan")!) ? p.get("lan") : null,
    q: p.get("q") ?? "",
  };
}

function writeUrl(f: Filters, scoped: boolean) {
  const p = new URLSearchParams();
  if (f.range !== "24h") p.set("t", f.range);
  if (f.categories.size) p.set("c", [...f.categories].join(","));
  if (!scoped && f.lan) p.set("lan", f.lan);
  if (f.q) p.set("q", f.q);
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

export default function LiveFeed({ lang, lan, kommun }: Props) {
  const tr = t(lang);
  const scoped = Boolean(lan || kommun);

  const [shards, setShards] = useState<Partial<Record<Shard, FeedShard & { fetchedAt: number }>>>({});
  const [load, setLoad] = useState<LoadState>("loading");
  const [now, setNow] = useState(() => Date.now());
  const [range, setRange] = useState<Range>("24h");
  const [categories, setCategories] = useState<Set<Category>>(new Set());
  const [lanFilter, setLanFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(25);
  const [geo, setGeo] = useState<GeoState>("idle");
  const [limit, setLimit] = useState(PAGE);
  const [showMap, setShowMap] = useState(false);
  const [MapView, setMapView] = useState<ComponentType<MapProps> | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const hydrated = useRef(false);

  // ---- initial state from the URL
  useEffect(() => {
    const u = readUrl(scoped);
    if (u.range) setRange(u.range);
    if (u.categories?.size) setCategories(u.categories);
    if (u.lan) setLanFilter(u.lan);
    if (u.q) setQ(u.q);
    hydrated.current = true;
    // Desktop shows the map by default; phones open it on demand.
    if (window.matchMedia("(min-width: 1100px)").matches) setShowMap(true);
  }, []);

  useEffect(() => {
    if (hydrated.current) writeUrl({ range, categories, lan: lanFilter, kommun: null, q, near: null }, scoped);
  }, [range, categories, lanFilter, q]);

  // ---- data loading
  async function loadShard(shard: Shard) {
    try {
      let data: FeedShard;
      const early = shard === "live" ? window.__vlLive : undefined;
      if (early) {
        window.__vlLive = undefined;
        data = parseFeedDoc((await early) as Parameters<typeof parseFeedDoc>[0]);
      } else {
        data = await fetchShard(shard);
      }
      setShards((s) => ({ ...s, [shard]: { ...data, fetchedAt: Date.now() } }));
      setLoad("ok");
    } catch {
      setLoad((l) => (l === "ok" ? "ok" : "error"));
    }
  }

  useEffect(() => {
    void loadShard("live");
    const tick = setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    const refresh = setInterval(() => {
      if (document.visibilityState === "visible") void loadShard("live");
    }, LIVE_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void loadShard("live");
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    for (const shard of shardsFor(range)) {
      if (shard === "live") continue;
      const have = shards[shard];
      if (!have || Date.now() - have.fetchedAt > OLDER_REFRESH_MS) void loadShard(shard);
    }
  }, [range]);

  // ---- map (loaded lazily, only when shown)
  useEffect(() => {
    // Wait for the list first: the map bundle is large and must not delay the incidents.
    if (showMap && !MapView && load !== "loading") void import("./EventMap").then((m) => setMapView(() => m.default));
  }, [showMap, load]);

  // ---- derived data
  const filters: Filters = {
    range,
    categories,
    lan: lan ?? lanFilter,
    kommun: kommun ?? null,
    q,
    near: near ? { ...near, km: radius } : null,
  };

  const searchText = (ev: FeedEvent) =>
    [ev.t, typeLabel("en", ev), ev.ti, ev.su, ev.e?.ti, kommunName(ev.k), lanName(ev.l), ev.r].filter(Boolean).join(" ");

  const all = useMemo(
    () => mergeShards(shardsFor(range).map((s) => shards[s]).filter((s): s is FeedShard & { fetchedAt: number } => !!s)),
    [shards, range],
  );

  const scopedEvents = useMemo(
    () => all.filter((ev) => matchesScope(ev, filters, now, searchText)),
    [all, range, lan, kommun, lanFilter, q, near, radius, now],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const ev of scopedEvents) c[ev.c] = (c[ev.c] ?? 0) + 1;
    return c;
  }, [scopedEvents]);

  const warnings = useMemo(
    () =>
      scopedEvents
        .filter((ev) => ev.c === "varning" && ev.x === "aktiv")
        .sort((a, b) => (LEVEL_ORDER[a.sv ?? ""] ?? 9) - (LEVEL_ORDER[b.sv ?? ""] ?? 9) || b.st - a.st),
    [scopedEvents],
  );

  const list = useMemo(
    () =>
      scopedEvents.filter((ev) =>
        categories.size ? categories.has(ev.c) : ev.c !== "varning",
      ),
    [scopedEvents, categories],
  );

  const groups = useMemo(() => {
    const out: { key: string; events: FeedEvent[] }[] = [];
    for (const ev of list.slice(0, limit)) {
      const key = dayKey(ev.st);
      const last = out[out.length - 1];
      if (last?.key === key) last.events.push(ev);
      else out.push({ key, events: [ev] });
    }
    return out;
  }, [list, limit]);

  const stats = useMemo(() => {
    const types = new Map<string, number>();
    const places = new Map<string, number>();
    for (const ev of list) {
      if (ev.c === "varning") continue;
      const label = typeLabel(lang, ev);
      types.set(label, (types.get(label) ?? 0) + 1);
      const place = scoped || filters.lan ? ev.k : ev.l;
      if (place) places.set(place, (places.get(place) ?? 0) + 1);
    }
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { types: top(types), places: top(places), placeIsKommun: scoped || !!filters.lan };
  }, [list, lang]);

  const generatedAt = shards.live?.generatedAt ?? null;
  const filtersActive = categories.size > 0 || !!lanFilter || !!q || !!near;

  // ---- actions
  function toggleCategory(c: Category) {
    setLimit(PAGE);
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function locate() {
    if (near) {
      setNear(null);
      setGeo("idle");
      return;
    }
    if (!("geolocation" in navigator)) {
      setGeo("unsupported");
      return;
    }
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Rounded to ~100 m: precise enough for a radius filter, never stored or sent anywhere.
        setNear({ lat: Math.round(pos.coords.latitude * 1000) / 1000, lng: Math.round(pos.coords.longitude * 1000) / 1000 });
        setGeo("idle");
      },
      () => setGeo("denied"),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  function clearFilters() {
    setCategories(new Set());
    setLanFilter(null);
    setQ("");
    setNear(null);
    setGeo("idle");
    setLimit(PAGE);
  }

  function selectFromMap(id: string) {
    setSelected(id);
    const idx = list.findIndex((e) => e.id === id);
    if (idx >= limit) setLimit(idx + 10);
    requestAnimationFrame(() => document.getElementById(`ev-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  const mapEvents = useMemo(() => [...list.slice(0, 400), ...(categories.size ? [] : warnings)], [list, warnings, categories]);

  // ---- render
  return (
    <div class="feed">
      <div class="feed-status" aria-live="polite">
        <span class={`live-dot ${load === "ok" ? "is-live" : ""}`} aria-hidden="true" />
        <span class="live-label">{tr.live}</span>
        {generatedAt && (
          <span class="muted">
            · {tr.updated} {clock(lang, generatedAt)}
          </span>
        )}
      </div>

      <div class="tiles" role="group" aria-label={lang === "sv" ? "Kategorier" : "Categories"}>
        {LIST_CATEGORIES.map((c) => (
          <button
            type="button"
            class={`tile ${categories.has(c) ? "is-on" : ""}`}
            data-c={c}
            aria-pressed={categories.has(c)}
            onClick={() => toggleCategory(c)}
          >
            <span class="tile-icon">
              <Icon name={c} size={22} />
            </span>
            <span class="tile-count">{load === "loading" ? "–" : number(lang, counts[c] ?? 0)}</span>
            <span class="tile-label">{tr.categories[c]}</span>
          </button>
        ))}
      </div>

      <div class="toolbar">
        <div class="segmented" role="radiogroup" aria-label={lang === "sv" ? "Tidsperiod" : "Time range"}>
          {(["24h", "7d", "30d"] as Range[]).map((r) => (
            <button
              type="button"
              role="radio"
              aria-checked={range === r}
              class={range === r ? "is-on" : ""}
              onClick={() => {
                setRange(r);
                setLimit(PAGE);
              }}
            >
              <span class="only-wide">{tr.range[r]}</span>
              <span class="only-narrow">{tr.rangeShort[r]}</span>
            </button>
          ))}
        </div>

        <label class="search">
          <Icon name="search" size={18} />
          <span class="sr-only">{lang === "sv" ? "Sök" : "Search"}</span>
          <input
            type="search"
            value={q}
            placeholder={tr.searchPlaceholder}
            onInput={(e) => {
              setQ((e.target as HTMLInputElement).value);
              setLimit(PAGE);
            }}
          />
        </label>

        {!scoped && (
          <label class="select">
            <span class="sr-only">{tr.county}</span>
            <select
              value={lanFilter ?? ""}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                setLanFilter(v || null);
                setLimit(PAGE);
              }}
            >
              <option value="">{tr.allSweden}</option>
              {LANS.map((l) => (
                <option value={l.code}>{l.name}</option>
              ))}
            </select>
          </label>
        )}

        <div class="near">
          <button type="button" class={`btn ${near ? "is-on" : ""}`} onClick={locate} aria-pressed={!!near}>
            <Icon name="locate" size={18} />
            <span>{geo === "locating" ? tr.locating : near ? tr.nearMeActive(radius) : tr.nearMe}</span>
            {near && <Icon name="close" size={14} />}
          </button>
          {near && (
            <select
              class="radius"
              value={radius}
              aria-label={lang === "sv" ? "Avstånd" : "Distance"}
              onChange={(e) => setRadius(Number((e.target as HTMLSelectElement).value))}
            >
              {RADII.map((r) => (
                <option value={r}>{r} km</option>
              ))}
            </select>
          )}
        </div>

        <button type="button" class="btn map-toggle" onClick={() => setShowMap((v) => !v)} aria-expanded={showMap}>
          <Icon name="map" size={18} />
          <span>{showMap ? tr.map.hide : tr.map.show}</span>
        </button>
      </div>

      {(geo === "denied" || geo === "unsupported") && (
        <p class="notice">{geo === "denied" ? tr.geoDenied : tr.geoUnsupported}</p>
      )}
      {near && <p class="hint">{tr.geoNote}</p>}

      {warnings.length > 0 && !categories.has("varning") && (
        <section class="warnings" aria-label={tr.warningsTitle}>
          <div class="warnings-head">
            <Icon name="varning" size={20} />
            <h2>{tr.warningsTitle}</h2>
            <span class="muted">{tr.warningsCount(warnings.length)}</span>
          </div>
          <ul>
            {(warningsOpen ? warnings : warnings.slice(0, 3)).map((w) => (
              <li class="warning" data-level={w.sv ?? ""}>
                <span class="level">{smhiLevel(lang, w.sv)}</span>
                <span class="warning-title">{typeLabel(lang, w)}</span>
                {w.en && (
                  <span class="muted warning-until">
                    {lang === "sv" ? "till" : "until"} {dateTime(lang, w.en)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {warnings.length > 3 && (
            <button type="button" class="link-btn" onClick={() => setWarningsOpen((v) => !v)}>
              {warningsOpen ? tr.hide : `${tr.showAll} (${warnings.length})`}
            </button>
          )}
        </section>
      )}

      <div class={`feed-grid ${showMap ? "with-map" : ""}`}>
        <section class="feed-list" aria-label={tr.nav.events}>
          <div class="list-head">
            <strong>{load === "loading" ? tr.loading : tr.results(list.length)}</strong>
            {filtersActive && (
              <button type="button" class="link-btn" onClick={clearFilters}>
                {tr.clearFilters}
              </button>
            )}
          </div>
          {lang === "en" && <p class="hint">{tr.dataInSwedish}</p>}

          {load === "loading" && <Skeleton />}
          {load === "error" && (
            <p class="notice">
              {tr.loadError}{" "}
              <button type="button" class="link-btn" onClick={() => void loadShard("live")}>
                {tr.retry}
              </button>
            </p>
          )}
          {load === "ok" && list.length === 0 && <p class="empty">{tr.noResults}</p>}

          {groups.map((g) => (
            <div class="day" key={g.key}>
              <h2 class="day-label">{dayLabel(lang, g.key, now)}</h2>
              <ol class="events">
                {g.events.map((ev) => (
                  <EventItem ev={ev} lang={lang} now={now} selected={selected === ev.id} key={ev.id} />
                ))}
              </ol>
            </div>
          ))}

          {list.length > limit && (
            <button type="button" class="btn more" onClick={() => setLimit((l) => l + PAGE)}>
              {tr.showMore} ({number(lang, list.length - limit)})
            </button>
          )}
        </section>

        <aside class="feed-side">
          {showMap && (
            <div class="card map-card">
              {MapView ? (
                <MapView lang={lang} events={mapEvents} near={filters.near} onSelect={selectFromMap} fitTo={scoped} />
              ) : (
                <div class="map-placeholder" />
              )}
              <p class="hint">{tr.map.approx}</p>
            </div>
          )}

          {load === "ok" && stats.types.length > 0 && (
            <div class="card">
              <h2 class="card-title">{tr.stats.topTypes}</h2>
              <Bars rows={stats.types.map(([label, n]) => ({ label, n }))} lang={lang} />
            </div>
          )}
          {load === "ok" && stats.places.length > 1 && (
            <div class="card">
              <h2 class="card-title">{tr.stats.topPlaces}</h2>
              <Bars
                lang={lang}
                rows={stats.places.map(([code, n]) => {
                  const k = stats.placeIsKommun ? kommunByCode.get(code) : null;
                  const l = stats.placeIsKommun ? null : lanByCode.get(code);
                  return {
                    label: k?.name ?? l?.name ?? code,
                    href: k ? routes.kommun(lang, k.slug) : l ? routes.lan(lang, l.slug) : undefined,
                    n,
                  };
                })}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function EventItem({ ev, lang, now, selected }: { ev: FeedEvent; lang: Lang; now: number; selected: boolean }) {
  const tr = t(lang);
  const [open, setOpen] = useState(false);
  const kommun = ev.k ? kommunByCode.get(ev.k) : null;
  const lan = ev.l ? lanByCode.get(ev.l) : null;
  const detail = detailText(lang, ev);
  const status = ev.x === "aktiv" ? tr.ongoing : ev.x === "avslutad" ? tr.ended : null;
  const severity = ev.s === "smhi" ? smhiLevel(lang, ev.sv) : ev.sv && ev.sv !== "Ingen påverkan" ? tr.severity(ev.sv) : null;

  return (
    <li id={`ev-${ev.id}`} class={`ev ${selected ? "is-selected" : ""} ${open ? "is-open" : ""}`} data-c={ev.c}>
      <span class="ev-icon" aria-hidden="true">
        <Icon name={ev.c} size={20} />
      </span>
      <div class="ev-body">
        <div class="ev-head">
          <h3 class="ev-type">{typeLabel(lang, ev)}</h3>
          {ev.r && (
            <span class="chip road">
              <Icon name="road" size={13} />
              {ev.r}
            </span>
          )}
          {severity && <span class={`chip sev ${/stor|RED|ORANGE/u.test(ev.sv ?? "") ? "is-high" : ""}`}>{severity}</span>}
          {status && <span class={`chip status ${ev.x === "aktiv" ? "is-active" : ""}`}>{status}</span>}
        </div>
        <div class="ev-meta">
          <time datetime={new Date(ev.st).toISOString()} title={dateTime(lang, ev.st)}>
            {clock(lang, ev.st)}
          </time>
          <span class="dot" aria-hidden="true">·</span>
          <span>{ago(lang, ev.st, now)}</span>
          {(kommun || lan) && <span class="dot" aria-hidden="true">·</span>}
          {(kommun || lan) && (
            <span class="place">
              {kommun && <a href={routes.kommun(lang, kommun.slug)}>{kommun.name}</a>}
              {kommun && lan && <span class="muted">, </span>}
              {lan && (
                <a class={kommun ? "muted" : ""} href={routes.lan(lang, lan.slug)}>
                  {kommun ? lan.short : lan.name}
                </a>
              )}
              {ev.gp === "kommun" && (
                <span class="approx" title={tr.approxLocation} aria-label={tr.approxLocation}>
                  {" "}≈
                </span>
              )}
            </span>
          )}
        </div>
        {detail && (
          <p class="ev-text" onClick={() => setOpen((o) => !o)}>
            {detail}
          </p>
        )}
        {ev.u && (
          <a class="ev-source" href={ev.u} target="_blank" rel="noopener nofollow">
            {tr.source}: {tr.sources[ev.s] ?? ev.s}
            <Icon name="external" size={13} />
          </a>
        )}
        {!ev.u && <span class="ev-source muted">{tr.source}: {tr.sources[ev.s] ?? ev.s}</span>}
      </div>
    </li>
  );
}

function Bars({ rows, lang }: { rows: { label: string; n: number; href?: string }[]; lang: Lang }) {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul class="bars">
      {rows.map((r) => (
        <li>
          <div class="bar-label">
            {r.href ? <a href={r.href}>{r.label}</a> : <span>{r.label}</span>}
            <span class="bar-n">{number(lang, r.n)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style={{ width: `${(r.n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Skeleton() {
  return (
    <ol class="events skeleton" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map(() => (
        <li class="ev">
          <span class="ev-icon" />
          <div class="ev-body">
            <span class="sk sk-title" />
            <span class="sk sk-line" />
            <span class="sk sk-line short" />
          </div>
        </li>
      ))}
    </ol>
  );
}
