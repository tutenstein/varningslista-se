import type { Category } from "./feed";

/** Display order; `varning` is shown in the warnings band rather than the list by default. */
export const CATEGORIES: Category[] = ["trafikolycka", "brand", "raddning", "trafikstorning", "varning"];
export const LIST_CATEGORIES: Category[] = ["trafikolycka", "brand", "raddning", "trafikstorning"];

/** Colours live in CSS (`--cat-*`, light and dark); the map needs concrete values. */
export const CATEGORY_HEX: Record<Category, { light: string; dark: string }> = {
  trafikolycka: { light: "#c2410c", dark: "#fb923c" },
  brand: { light: "#dc2626", dark: "#f87171" },
  raddning: { light: "#0e7490", dark: "#22d3ee" },
  trafikstorning: { light: "#6d28d9", dark: "#a78bfa" },
  varning: { light: "#a16207", dark: "#facc15" },
};

export const LEVEL_ORDER: Record<string, number> = { RED: 0, ORANGE: 1, YELLOW: 2, MESSAGE: 3 };
