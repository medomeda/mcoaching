/**
 * Conversions instant UTC ⇄ heure locale d'un fuseau IANA, sans dépendance externe.
 * Africa/Abidjan est en UTC+0 sans heure d'été, mais le calendrier est configurable :
 * le calcul reste correct pour tout fuseau (y compris avec changement d'heure).
 */

export interface LocalDay {
  y: number;
  m: number; // 1..12
  d: number;
}

export interface LocalDateTime extends LocalDay {
  hh: number;
  mi: number;
  ss: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function toLocal(date: Date, tz: string): LocalDateTime {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    y: out.year!,
    m: out.month!,
    d: out.day!,
    hh: out.hour! % 24,
    mi: out.minute!,
    ss: out.second!,
  };
}

function offsetMs(date: Date, tz: string): number {
  const l = toLocal(date, tz);
  const asUtc = Date.UTC(l.y, l.m - 1, l.d, l.hh, l.mi, l.ss);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instant UTC correspondant à une heure locale donnée dans le fuseau `tz`. */
export function fromLocal(day: LocalDay, hh: number, mi: number, tz: string): Date {
  const guess = Date.UTC(day.y, day.m - 1, day.d, hh, mi, 0);
  const off1 = offsetMs(new Date(guess), tz);
  let t = guess - off1;
  const off2 = offsetMs(new Date(t), tz);
  if (off2 !== off1) t = guess - off2;
  return new Date(t);
}

export function addDays(day: LocalDay, n: number): LocalDay {
  const t = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Jour ISO : 1 = lundi … 7 = dimanche. */
export function isoWeekday(day: LocalDay): number {
  const w = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export function dayKey(day: LocalDay): string {
  return `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
}

export function compareDay(a: LocalDay, b: LocalDay): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

export function parseHHMM(value: string): { hh: number; mi: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) throw new Error(`Heure invalide : ${value}`);
  return { hh: Number(m[1]), mi: Number(m[2]) };
}
