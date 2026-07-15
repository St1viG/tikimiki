/* Shared presentation helpers: relative time, number formatting, initials. */

export type Locale = "en" | "sr";

/* Group thousands with a comma, e.g. "1,240". */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/* XP/points figure with thousands grouping, e.g. "1,240". */
export function formatXp(points: number): string {
  return formatNumber(points);
}

/* Short, locale-aware relative time: "5m ago" (en) / "pre 5 min" (sr). */
export function relTime(iso: string, locale: Locale): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(s)) return "";
  if (s < 60) return locale === "sr" ? "upravo sada" : "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return locale === "sr" ? `pre ${m} min` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return locale === "sr" ? `pre ${h} h` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return locale === "sr" ? `pre ${d} d` : `${d}d ago`;
}

/* Month names by locale (genitive in Serbian). */
const MONTHS: Record<Locale, readonly string[]> = {
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  sr: [
    "januara",
    "februara",
    "marta",
    "aprila",
    "maja",
    "juna",
    "jula",
    "avgusta",
    "septembra",
    "oktobra",
    "novembra",
    "decembra",
  ],
};

/* "June 2026" / "juna 2026." */
export function monthYear(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const month = MONTHS[locale][d.getMonth()];
  return locale === "sr" ? `${month} ${d.getFullYear()}.` : `${month} ${d.getFullYear()}`;
}

/* Up to two uppercase initials from a name ("ETF HackWeek" → "EH"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* Stable 32-bit hash of a string (deterministic palette/variant pickers). */
// Bitwise OR 0 keeps the accumulator in the 32-bit signed range; Math.abs turns the sign bit into a usable positive index.
export function hashString(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

/* Locale-aware relative time, e.g. "2 hours ago" (en) / "pre 2 sata" (sr).
   Accepts an ISO string or Date. */
export function formatRelativeTime(
  input: string | Date,
  locale: Locale = "sr",
  now: Date = new Date(),
): string {
  const then = typeof input === "string" ? new Date(input) : input;
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  if (Number.isNaN(seconds)) return "";
  // Plain "sr" formats in Cyrillic; the app's Serbian copy is Latin script.
  const rtf = new Intl.RelativeTimeFormat(locale === "sr" ? "sr-Latn" : locale, {
    numeric: "auto",
  });
  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= secondsInUnit || unit === "second") {
      return rtf.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return "";
}
