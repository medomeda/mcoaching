/** Formatage FR. Les dates sont affichées dans le fuseau de service (Africa/Abidjan, UTC+0). */
export const DISPLAY_TZ = "Africa/Abidjan";

const dateTime = new Intl.DateTimeFormat("fr-FR", { timeZone: DISPLAY_TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("fr-FR", { timeZone: DISPLAY_TZ, day: "2-digit", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { timeZone: DISPLAY_TZ, day: "2-digit", month: "short" });
const timeOnly = new Intl.DateTimeFormat("fr-FR", { timeZone: DISPLAY_TZ, hour: "2-digit", minute: "2-digit" });
const weekdayDateTime = new Intl.DateTimeFormat("fr-FR", { timeZone: DISPLAY_TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : "—");
export const fmtDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : "—");
export const fmtShortDate = (iso: string | null | undefined) => (iso ? shortDate.format(new Date(iso)) : "—");
export const fmtTime = (iso: string | null | undefined) => (iso ? timeOnly.format(new Date(iso)) : "—");
export const fmtLongDateTime = (iso: string | null | undefined) => (iso ? weekdayDateTime.format(new Date(iso)) : "—");

/** Durée en minutes ouvrées → « 3 h 20 ouvrées ». */
export function fmtWorkingMinutes(min: number | null | undefined, suffix = " ouvrées"): string {
  if (min === null || min === undefined || Number.isNaN(min)) return "—";
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min${suffix}`;
  return `${h} h${r ? ` ${String(r).padStart(2, "0")}` : ""}${suffix}`;
}

export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—";
  return h >= 48 ? `${(h / 24).toFixed(1).replace(".", ",")} j` : `${h.toFixed(1).replace(".", ",")} h`;
}

export const fmtPercent = (r: number | null | undefined) => (r === null || r === undefined ? "—" : `${Math.round(r * 100)} %`);
export const fmtScore = (s: number | null | undefined) => (s === null || s === undefined ? "—" : `${s.toFixed(1).replace(".", ",")} / 5`);

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (abs < 60_000) return "à l’instant";
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

/** Valeur pour <input type="datetime-local"> dans le fuseau d'affichage (UTC+0). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
