import type { Category, FeedEvent } from "./lib/feed";

export type Lang = "sv" | "en";
export const LANGS: Lang[] = ["sv", "en"];

// ---------------------------------------------------------------- routes

export const routes = {
  home: (l: Lang) => (l === "sv" ? "/" : "/en/"),
  lan: (l: Lang, slug: string) => (l === "sv" ? `/lan/${slug}/` : `/en/county/${slug}/`),
  kommun: (l: Lang, slug: string) => (l === "sv" ? `/kommun/${slug}/` : `/en/municipality/${slug}/`),
  directory: (l: Lang) => (l === "sv" ? "/kommuner/" : "/en/municipalities/"),
  about: (l: Lang) => (l === "sv" ? "/om/" : "/en/about/"),
};

/** The same page in the other language. */
export function alternatePath(path: string, to: Lang): string {
  const pairs: [RegExp, (m: RegExpMatchArray) => string][] =
    to === "en"
      ? [
          [/^\/lan\/([^/]+)\/$/u, (m) => routes.lan("en", m[1])],
          [/^\/kommun\/([^/]+)\/$/u, (m) => routes.kommun("en", m[1])],
          [/^\/kommuner\/$/u, () => routes.directory("en")],
          [/^\/om\/$/u, () => routes.about("en")],
        ]
      : [
          [/^\/en\/county\/([^/]+)\/$/u, (m) => routes.lan("sv", m[1])],
          [/^\/en\/municipality\/([^/]+)\/$/u, (m) => routes.kommun("sv", m[1])],
          [/^\/en\/municipalities\/$/u, () => routes.directory("sv")],
          [/^\/en\/about\/$/u, () => routes.about("sv")],
        ];
  for (const [re, fn] of pairs) {
    const m = path.match(re);
    if (m) return fn(m);
  }
  return routes.home(to);
}

// ---------------------------------------------------------------- UI strings

const sv = {
  siteName: "Varningslista",
  tagline: "Olyckor, bränder och störningar i hela Sverige – samlat från öppna källor",
  nav: { events: "Händelser", directory: "Kommuner", about: "Om tjänsten" },
  skip: "Hoppa till innehållet",
  emergency: "Vid nödläge – ring 112",
  notOfficial: "Varningslista är en oberoende sammanställning av öppna data och ingen myndighetstjänst.",
  live: "Live",
  updated: "Uppdaterad",
  loading: "Hämtar händelser…",
  loadError: "Kunde inte hämta händelser just nu. Försöker igen automatiskt.",
  retry: "Försök igen",
  range: { "24h": "24 timmar", "7d": "7 dagar", "30d": "30 dagar" },
  rangeShort: { "24h": "24 h", "7d": "7 d", "30d": "30 d" },
  allCategories: "Alla",
  allSweden: "Hela Sverige",
  county: "Län",
  searchPlaceholder: "Sök typ, ort, väg (t.ex. E4)…",
  nearMe: "Nära mig",
  nearMeActive: (km: number) => `Inom ${km} km`,
  nearMeOff: "Stäng av",
  locating: "Hämtar position…",
  geoDenied: "Platsåtkomst nekades. Du kan fortfarande filtrera på län.",
  geoUnsupported: "Din webbläsare stöder inte platsåtkomst.",
  geoNote: "Din position används bara i webbläsaren och sparas inte.",
  results: (n: number) => (n === 1 ? "1 händelse" : `${n} händelser`),
  noResults: "Inga händelser matchar filtren.",
  clearFilters: "Rensa filter",
  showMore: "Visa fler",
  today: "Idag",
  yesterday: "Igår",
  ongoing: "Pågår",
  ended: "Avslutad",
  approxLocation: "Ungefärlig plats (kommunens mitt)",
  source: "Källa",
  readMore: "Läs mer",
  warningsTitle: "Aktuella vädervarningar",
  warningsCount: (n: number) => (n === 1 ? "1 aktiv varning" : `${n} aktiva varningar`),
  showAll: "Visa alla",
  hide: "Dölj",
  stats: { title: "Senaste 7 dagarna", topTypes: "Vanligaste händelser", topPlaces: "Mest aktiva områden" },
  map: { show: "Visa karta", hide: "Dölj karta", title: "Karta", approx: "Ungefärliga platser visas som ringar." },
  ago: { now: "nyss", min: (n: number) => `${n} min sedan`, h: (n: number) => `${n} h sedan` },
  categories: {
    trafikolycka: "Trafikolyckor",
    brand: "Bränder",
    raddning: "Räddning",
    trafikstorning: "Trafikstörningar",
    varning: "Varningar",
  } as Record<Category, string>,
  category1: {
    trafikolycka: "Trafikolycka",
    brand: "Brand",
    raddning: "Räddning",
    trafikstorning: "Trafikstörning",
    varning: "Varning",
  } as Record<Category, string>,
  sources: { polisen: "Polisen", trafikverket: "Trafikverket", smhi: "SMHI" } as Record<string, string>,
  severity: (s: string) => s,
  // pages
  homeTitle: "Varningslista – olyckor, bränder och störningar i realtid",
  homeLead: "Senaste händelserna i Sverige",
  countiesTitle: "Län",
  lanTitle: (name: string) => `Händelser i ${name}`,
  lanLead: (name: string) => `Olyckor, bränder, räddningsinsatser och trafikstörningar i ${name}.`,
  kommunTitle: (name: string) => `Händelser i ${name}`,
  kommunLead: (name: string, lan: string) => `Senaste olyckor, bränder och störningar i ${name} kommun, ${lan}.`,
  kommunerIn: (name: string) => `Kommuner i ${name}`,
  directoryTitle: "Alla kommuner A–Ö",
  directoryLead: "Välj en kommun för att se händelser och statistik.",
  statsTitle: (name: string) => `Räddningstjänstens insatser i ${name}`,
  statsLead: "Årlig statistik över räddningstjänstens utryckningar i kommunen.",
  statsEvents: "Alla insatser",
  statsPer1000: "per 1 000 invånare",
  statsBuildingFires: "Bränder i byggnad",
  statsTrafficAccidents: "Trafikolyckor",
  statsSource: "Källa: Myndigheten för civilt försvar (MCF) och SCB",
  population: "Invånare",
  aboutTitle: "Om Varningslista",
  sourcesTitle: "Källor och täckning",
  sourceStatusTitle: "Status för källorna",
  lastSuccess: "Senast hämtat",
  statusOk: "Fungerar",
  statusDelayed: "Försenad",
  statusDown: "Fel",
  notFoundTitle: "Sidan hittades inte",
  notFoundLead: "Sidan finns inte, eller har flyttats.",
  backHome: "Till startsidan",
  language: "Språk",
  dataInSwedish: "",
};

type Dict = typeof sv;

const en: Dict = {
  siteName: "Varningslista",
  tagline: "Accidents, fires and disruptions across Sweden – compiled from open data",
  nav: { events: "Incidents", directory: "Municipalities", about: "About" },
  skip: "Skip to content",
  emergency: "In an emergency – call 112",
  notOfficial: "Varningslista is an independent compilation of open data and not a government service.",
  live: "Live",
  updated: "Updated",
  loading: "Loading incidents…",
  loadError: "Couldn't load incidents right now. Retrying automatically.",
  retry: "Retry",
  range: { "24h": "24 hours", "7d": "7 days", "30d": "30 days" },
  rangeShort: { "24h": "24 h", "7d": "7 d", "30d": "30 d" },
  allCategories: "All",
  allSweden: "All of Sweden",
  county: "County",
  searchPlaceholder: "Search type, place, road (e.g. E4)…",
  nearMe: "Near me",
  nearMeActive: (km: number) => `Within ${km} km`,
  nearMeOff: "Turn off",
  locating: "Locating…",
  geoDenied: "Location access was denied. You can still filter by county.",
  geoUnsupported: "Your browser doesn't support location access.",
  geoNote: "Your location stays in your browser and is never stored.",
  results: (n: number) => (n === 1 ? "1 incident" : `${n} incidents`),
  noResults: "No incidents match the filters.",
  clearFilters: "Clear filters",
  showMore: "Show more",
  today: "Today",
  yesterday: "Yesterday",
  ongoing: "Ongoing",
  ended: "Ended",
  approxLocation: "Approximate location (centre of the municipality)",
  source: "Source",
  readMore: "Read more",
  warningsTitle: "Current weather warnings",
  warningsCount: (n: number) => (n === 1 ? "1 active warning" : `${n} active warnings`),
  showAll: "Show all",
  hide: "Hide",
  stats: { title: "Last 7 days", topTypes: "Most common incidents", topPlaces: "Most active areas" },
  map: { show: "Show map", hide: "Hide map", title: "Map", approx: "Approximate locations are drawn as rings." },
  ago: { now: "just now", min: (n: number) => `${n} min ago`, h: (n: number) => `${n} h ago` },
  categories: {
    trafikolycka: "Traffic accidents",
    brand: "Fires",
    raddning: "Rescue",
    trafikstorning: "Traffic disruptions",
    varning: "Warnings",
  },
  category1: {
    trafikolycka: "Traffic accident",
    brand: "Fire",
    raddning: "Rescue",
    trafikstorning: "Traffic disruption",
    varning: "Warning",
  },
  sources: { polisen: "Swedish Police", trafikverket: "Swedish Transport Administration", smhi: "SMHI" },
  severity: (s: string) => SEVERITY_EN[s] ?? s,
  homeTitle: "Varningslista – live accidents, fires and disruptions in Sweden",
  homeLead: "Latest incidents in Sweden",
  countiesTitle: "Counties",
  lanTitle: (name: string) => `Incidents in ${name}`,
  lanLead: (name: string) => `Accidents, fires, rescue operations and traffic disruptions in ${name}.`,
  kommunTitle: (name: string) => `Incidents in ${name}`,
  kommunLead: (name: string, lan: string) => `Latest accidents, fires and disruptions in ${name} municipality, ${lan}.`,
  kommunerIn: (name: string) => `Municipalities in ${name}`,
  directoryTitle: "All municipalities A–Ö",
  directoryLead: "Pick a municipality to see incidents and statistics.",
  statsTitle: (name: string) => `Rescue service call-outs in ${name}`,
  statsLead: "Yearly statistics for the municipal rescue service.",
  statsEvents: "All call-outs",
  statsPer1000: "per 1,000 residents",
  statsBuildingFires: "Building fires",
  statsTrafficAccidents: "Traffic accidents",
  statsSource: "Source: Swedish Civil Defence and Resilience Agency (MCF) and Statistics Sweden",
  population: "Residents",
  aboutTitle: "About Varningslista",
  sourcesTitle: "Sources and coverage",
  sourceStatusTitle: "Source status",
  lastSuccess: "Last fetched",
  statusOk: "Working",
  statusDelayed: "Delayed",
  statusDown: "Error",
  notFoundTitle: "Page not found",
  notFoundLead: "This page doesn't exist or has moved.",
  backHome: "Back to the start page",
  language: "Language",
  dataInSwedish: "Incident texts are shown in Swedish, as published by the source.",
};

const SEVERITY_EN: Record<string, string> = {
  "Ingen påverkan": "No impact",
  "Liten påverkan": "Minor impact",
  "Stor påverkan": "Major impact",
  "Mycket stor påverkan": "Severe impact",
};

export const ui: Record<Lang, Dict> = { sv, en };
export const t = (lang: Lang) => ui[lang];

// ---------------------------------------------------------------- incident type labels

const TYPE_EN: Record<string, string> = {
  trafikolycka: "Traffic accident",
  "trafikolycka, personskada": "Traffic accident, injuries",
  "trafikolycka, singel": "Single-vehicle accident",
  "trafikolycka, vilt": "Collision with wildlife",
  "trafikolycka, smitning från": "Hit-and-run accident",
  brand: "Fire",
  "brand automatlarm": "Automatic fire alarm",
  "brand i fordon": "Vehicle fire",
  "omfattande brand": "Major fire",
  räddningsinsats: "Rescue operation",
  arbetsplatsolycka: "Workplace accident",
  "försvunnen person": "Missing person",
  drunkning: "Drowning",
  "drunkning, tillbud": "Near-drowning",
  fjällräddning: "Mountain rescue",
  sjöräddning: "Sea rescue",
  olycka: "Accident",
  "olycka, annan": "Other accident",
  "olycka med tungt fordon": "Heavy vehicle accident",
  explosion: "Explosion",
  ras: "Collapse",
  gasläcka: "Gas leak",
  luftfartsolycka: "Aviation accident",
  "sjukdom/olycksfall": "Illness / accident",
  naturkatastrof: "Natural disaster",
  trafikhinder: "Traffic obstruction",
  fordonshaveri: "Vehicle breakdown",
  "djur på vägen": "Animals on the road",
  "föremål på vägen": "Object on the road",
  "faror på vägen": "Hazard on the road",
  "hinder på vägbanan": "Obstruction on the road",
  bärgning: "Vehicle recovery",
  "nedfallet träd": "Fallen tree",
  "människor på vägen": "People on the road",
  "olja på vägen": "Oil on the road",
  översvämning: "Flooding",
  "fordon på fel vägbana": "Wrong-way driver",
  "viktig trafikinformation": "Important traffic information",
  vägskada: "Road damage",
  "långsam kö": "Slow-moving traffic",
  "vägen avstängd": "Road closed",
};

const SMHI_LEVEL: Record<Lang, Record<string, string>> = {
  sv: { YELLOW: "Gul varning", ORANGE: "Orange varning", RED: "Röd varning", MESSAGE: "Meddelande" },
  en: { YELLOW: "Yellow warning", ORANGE: "Orange warning", RED: "Red warning", MESSAGE: "Message" },
};

export function smhiLevel(lang: Lang, code: string | null): string | null {
  return code ? (SMHI_LEVEL[lang][code] ?? code) : null;
}

export function typeLabel(lang: Lang, ev: FeedEvent): string {
  if (ev.s === "smhi") return lang === "en" && ev.e ? stripLevel(ev.e.ti) : stripLevel(ev.ti);
  if (lang === "sv") return ev.t;
  return TYPE_EN[ev.t.toLowerCase()] ?? ui.en.category1[ev.c];
}

/** SMHI titles start with the level ("Gul varning – …"); the level is shown as a badge instead. */
function stripLevel(title: string): string {
  const parts = title.split(" – ");
  return parts.length > 1 ? parts.slice(1).join(" – ") : title;
}

/** Secondary line: what the source says about where/what, without repeating the type. */
export function detailText(lang: Lang, ev: FeedEvent): string | null {
  if (ev.s === "smhi") return lang === "en" && ev.e ? ev.e.su : ev.su;
  if (ev.s === "trafikverket") {
    // Title is "<type>, <road>, <location> – <header>"; drop the parts we already show.
    let rest = ev.ti;
    for (const prefix of [ev.t, ev.r]) if (prefix && rest.startsWith(`${prefix}, `)) rest = rest.slice(prefix.length + 2);
    return [rest, ev.su].filter(Boolean).join(". ").replace(/\.\.+/gu, ".");
  }
  return ev.su;
}
