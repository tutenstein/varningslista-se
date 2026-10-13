import { KOMMUNER, LAN } from "../data/regions";

export interface Kommun {
  kod: string;
  namn: string;
  lanKod: string;
  lanNamn: string;
}

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+(kommun|stad)$/u, "")
    .replace(/\s+/gu, " ");
}

const kommunByName = new Map<string, Kommun>();
for (const [kod, namn] of Object.entries(KOMMUNER)) {
  const lanKod = kod.slice(0, 2);
  kommunByName.set(norm(namn), { kod, namn, lanKod, lanNamn: LAN[lanKod] ?? "" });
}

// Names used by sources that differ from SCB's official spelling.
const KOMMUN_ALIASES: Record<string, string> = {
  "upplands bro": "upplands-bro",
  "malung": "malung-sälen",
  "dals ed": "dals-ed",
};

const lanByName = new Map<string, string>();
for (const [kod, namn] of Object.entries(LAN)) {
  lanByName.set(norm(namn), kod);
  lanByName.set(norm(namn.replace(/s? län$/u, "")), kod); // "Skåne", "Stockholm(s)"
}

export function findKommun(name: string | null | undefined): Kommun | null {
  if (!name) return null;
  const n = norm(name);
  return kommunByName.get(n) ?? kommunByName.get(KOMMUN_ALIASES[n] ?? "") ?? null;
}

/** Accepts "Skåne län", "Skåne", or a numeric code like 12 / "12" / "1". */
export function findLan(nameOrCode: string | number | null | undefined): { kod: string; namn: string } | null {
  if (nameOrCode === null || nameOrCode === undefined || nameOrCode === "") return null;
  const asString = String(nameOrCode);
  if (/^\d{1,2}$/u.test(asString)) {
    const kod = asString.padStart(2, "0");
    return LAN[kod] ? { kod, namn: LAN[kod] } : null;
  }
  const kod = lanByName.get(norm(asString));
  return kod ? { kod, namn: LAN[kod] } : null;
}
