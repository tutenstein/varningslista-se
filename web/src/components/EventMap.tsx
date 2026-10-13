// Loaded on demand (dynamic import from LiveFeed) so MapLibre never weighs down the first paint.
import { useEffect, useRef } from "preact/hooks";
import {
  Map as MlMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
// MapLibre 6 locates its (self-contained) worker next to its own module, which bundling breaks.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
// Linked on demand (not bundled into page CSS, which every page would otherwise inline).
import maplibreCss from "maplibre-gl/dist/maplibre-gl.css?url";
import type { Feature, FeatureCollection } from "geojson";
import { t, typeLabel, type Lang } from "../i18n";
import { CATEGORY_HEX } from "../lib/categories";
import type { FeedEvent } from "../lib/feed";
import { clock } from "../lib/format";
import { kommunName, lanName } from "../lib/regions";

export interface MapProps {
  lang: Lang;
  events: FeedEvent[];
  near: { lat: number; lng: number; km: number } | null;
  onSelect: (id: string) => void;
  /** Zoom to the events (county / municipality pages) instead of showing all of Sweden. */
  fitTo: boolean;
}

setWorkerUrl(workerUrl);

// OpenFreeMap: free vector tiles from OpenStreetMap data, no key required.
const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const SWEDEN: [[number, number], [number, number]] = [
  [10.9, 55.2],
  [24.2, 69.1],
];

function toGeoJSON(events: FeedEvent[], lang: Lang): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: events
      .filter((e) => e.g && e.gp !== "lan" && e.gp !== "saknas")
      .map((e) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [e.g![1], e.g![0]] },
        properties: {
          id: e.id,
          c: e.c,
          approx: e.gp !== "exakt",
          label: typeLabel(lang, e),
          place: kommunName(e.k) ?? lanName(e.l) ?? "",
          time: clock(lang, e.st),
        },
      })),
  };
}

/** Circle polygon for the "near me" radius. */
function circle(lat: number, lng: number, km: number): Feature {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    const dLat = (km / 111.32) * Math.sin(a);
    const dLng = (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a);
    pts.push([lng + dLng, lat + dLat]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [pts] }, properties: {} };
}

export default function EventMap({ lang, events, near, onSelect, fitTo }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const latest = useRef({ events, near });
  latest.current = { events, near };
  const fitted = useRef(false);

  useEffect(() => {
    if (!document.querySelector("link[data-maplibre]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = maplibreCss;
      link.dataset.maplibre = "";
      document.head.append(link);
    }
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const palette = dark ? "dark" : "light";
    const m = new MlMap({
      container: el.current!,
      style: STYLE[palette],
      bounds: SWEDEN,
      fitBoundsOptions: { padding: 16 },
      attributionControl: { compact: true },
      cooperativeGestures: window.matchMedia("(pointer: coarse)").matches,
    });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");

    m.on("load", () => {
      m.addSource("near", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "near-fill",
        type: "fill",
        source: "near",
        paint: { "fill-color": dark ? "#60a5fa" : "#2563eb", "fill-opacity": 0.08 },
      });
      m.addLayer({
        id: "near-line",
        type: "line",
        source: "near",
        paint: { "line-color": dark ? "#60a5fa" : "#2563eb", "line-width": 1.5, "line-dasharray": [2, 2] },
      });

      m.addSource("events", { type: "geojson", data: toGeoJSON(latest.current.events, lang) });
      const color = [
        "match",
        ["get", "c"],
        ...Object.entries(CATEGORY_HEX).flatMap(([c, v]) => [c, v[palette]]),
        "#64748b",
      ] as unknown as ExpressionSpecification;
      // Approximate positions (kommun centre / warning area): soft ring.
      m.addLayer({
        id: "events-approx",
        type: "circle",
        source: "events",
        filter: ["==", ["get", "approx"], true],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 9, 14],
          "circle-color": color,
          "circle-opacity": 0.14,
          "circle-stroke-color": color,
          "circle-stroke-width": 1.5,
        },
      });
      m.addLayer({
        id: "events-exact",
        type: "circle",
        source: "events",
        filter: ["==", ["get", "approx"], false],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 10, 8],
          "circle-color": color,
          "circle-stroke-color": dark ? "#0b0f14" : "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });

      const popup = new Popup({ closeButton: false, offset: 10, className: "map-popup" });
      for (const layer of ["events-exact", "events-approx"]) {
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => {
          m.getCanvas().style.cursor = "";
          popup.remove();
        });
        m.on("mousemove", layer, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as { label: string; place: string; time: string };
          // Built with textContent: labels come from external sources.
          const node = document.createElement("div");
          const strong = document.createElement("strong");
          strong.textContent = p.label;
          const meta = document.createElement("div");
          meta.textContent = [p.time, p.place].filter(Boolean).join(" · ");
          node.append(strong, meta);
          popup.setLngLat(e.lngLat).setDOMContent(node).addTo(m);
        });
        m.on("click", layer, (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (typeof id === "string") onSelect(id);
        });
      }
      ready.current = true;
      sync();
    });

    return () => {
      ready.current = false;
      m.remove();
    };
  }, []);

  function sync() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { events: evs, near: n } = latest.current;
    (m.getSource("events") as GeoJSONSource).setData(toGeoJSON(evs, lang));
    (m.getSource("near") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: n ? [circle(n.lat, n.lng, n.km)] : [],
    });
    if (n) {
      const dLat = n.km / 111.32;
      const dLng = n.km / (111.32 * Math.cos((n.lat * Math.PI) / 180));
      m.fitBounds(
        [
          [n.lng - dLng, n.lat - dLat],
          [n.lng + dLng, n.lat + dLat],
        ],
        { padding: 24, duration: 600 },
      );
    } else if (fitTo && !fitted.current) {
      const pts = evs.filter((e) => e.g && e.gp !== "lan").map((e) => e.g!);
      if (pts.length) {
        fitted.current = true;
        const lats = pts.map((p) => p[0]);
        const lngs = pts.map((p) => p[1]);
        m.fitBounds(
          [
            [Math.min(...lngs) - 0.15, Math.min(...lats) - 0.1],
            [Math.max(...lngs) + 0.15, Math.max(...lats) + 0.1],
          ],
          { padding: 24, maxZoom: 10, duration: 0 },
        );
      }
    }
  }

  useEffect(sync, [events, near]);

  return <div ref={el} class="map" role="region" aria-label={t(lang).map.title} />;
}
