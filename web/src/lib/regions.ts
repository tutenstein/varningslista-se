import { KOMMUNER, LAN } from "../../../functions/src/data/regions";

export interface Lan {
  code: string;
  name: string; // "Stockholms län"
  short: string; // "Stockholm"
  slug: string;
}

export interface Kommun {
  code: string;
  name: string;
  slug: string;
  lan: string; // län code
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export const LANS: Lan[] = Object.entries(LAN)
  .map(([code, name]) => ({ code, name, short: name.replace(/s? län$/u, ""), slug: slugify(name) }))
  .sort((a, b) => a.name.localeCompare(b.name, "sv"));

// Some names collide once diacritics are dropped (Håbo / Habo): those get the county as suffix.
const baseSlugCount = new Map<string, number>();
for (const name of Object.values(KOMMUNER)) baseSlugCount.set(slugify(name), (baseSlugCount.get(slugify(name)) ?? 0) + 1);

export const KOMMUNS: Kommun[] = Object.entries(KOMMUNER)
  .map(([code, name]) => {
    const base = slugify(name);
    const lan = code.slice(0, 2);
    const slug = (baseSlugCount.get(base) ?? 0) > 1 ? `${base}-${slugify(LAN[lan].replace(/s? län$/u, ""))}` : base;
    return { code, name, slug, lan };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "sv"));

export const lanByCode = new Map(LANS.map((l) => [l.code, l]));
export const kommunByCode = new Map(KOMMUNS.map((k) => [k.code, k]));

export function lanName(code: string | null | undefined): string | null {
  return code ? (lanByCode.get(code)?.name ?? null) : null;
}

export function kommunName(code: string | null | undefined): string | null {
  return code ? (KOMMUNER[code] ?? null) : null;
}
