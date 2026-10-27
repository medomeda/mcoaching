/**
 * Calculateur d'heures ouvrées (PRD §7.3). Service unique utilisé pour :
 * - l'échéance de première réponse (enregistrée à la soumission) ;
 * - le temps ouvré écoulé (rappels, retards, escalades, rapports).
 *
 * Règles :
 * - seules les plages des jours ouvrés non fériés sont comptées ;
 * - une soumission hors service commence à courir à la prochaine ouverture ;
 * - si le délai s'épuise exactement en fin de plage, l'échéance est cette fin de plage.
 */
import {
  addDays,
  compareDay,
  dayKey,
  fromLocal,
  isoWeekday,
  parseHHMM,
  toLocal,
  type LocalDay,
} from "./zonedTime";
import type { WorkingPeriod } from "../core/types";

export interface CalendarConfig {
  timezone: string;
  working_days: number[];
  periods: WorkingPeriod[];
  /** Dates locales "AAAA-MM-JJ" exclues (fériés, fermetures). */
  holidays: string[];
}

/** Garde-fou : aucune recherche au-delà de 3 ans (calendrier sans aucun jour ouvré, etc.). */
const MAX_DAYS = 366 * 3;
const MINUTE = 60_000;

export function validateCalendar(cal: Omit<CalendarConfig, "holidays">): string | null {
  if (cal.working_days.length === 0) return "Au moins un jour ouvré est requis.";
  if (cal.working_days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return "Jour ouvré invalide.";
  if (cal.periods.length === 0) return "Au moins une plage horaire est requise.";
  const sorted = [...cal.periods].map((p) => {
    const s = parseHHMM(p.start);
    const e = parseHHMM(p.end);
    return { s: s.hh * 60 + s.mi, e: e.hh * 60 + e.mi };
  });
  sorted.sort((a, b) => a.s - b.s);
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (p.e <= p.s) return "Chaque plage doit se terminer après son début.";
    const next = sorted[i + 1];
    if (next && next.s < p.e) return "Les plages horaires ne doivent pas se chevaucher.";
  }
  return null;
}

interface Window {
  start: Date;
  end: Date;
}

function windowsOfDay(day: LocalDay, cal: CalendarConfig, holidays: Set<string>): Window[] {
  if (!cal.working_days.includes(isoWeekday(day))) return [];
  if (holidays.has(dayKey(day))) return [];
  return cal.periods
    .map((p) => {
      const s = parseHHMM(p.start);
      const e = parseHHMM(p.end);
      return { start: fromLocal(day, s.hh, s.mi, cal.timezone), end: fromLocal(day, e.hh, e.mi, cal.timezone) };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function localDayOf(date: Date, tz: string): LocalDay {
  const l = toLocal(date, tz);
  return { y: l.y, m: l.m, d: l.d };
}

/** Ajoute `minutes` ouvrées à `start`. Avec 0 minute, renvoie la prochaine ouverture (ou `start` si ouvert). */
export function addWorkingMinutes(start: Date, minutes: number, cal: CalendarConfig): Date {
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error("Nombre de minutes invalide.");
  const holidays = new Set(cal.holidays);
  let remaining = minutes;
  let cursor = start.getTime();
  let day = localDayOf(start, cal.timezone);
  for (let i = 0; i < MAX_DAYS; i++, day = addDays(day, 1)) {
    for (const w of windowsOfDay(day, cal, holidays)) {
      const wEnd = w.end.getTime();
      if (cursor >= wEnd) continue;
      const segStart = Math.max(cursor, w.start.getTime());
      const available = (wEnd - segStart) / MINUTE;
      if (remaining <= available) return new Date(segStart + remaining * MINUTE);
      remaining -= available;
      cursor = wEnd;
    }
  }
  throw new Error("Impossible de calculer l’échéance : le calendrier ne comporte pas de jour ouvré.");
}

/** Minutes ouvrées écoulées entre `from` et `to` (0 si `to` ≤ `from`). */
export function workingMinutesBetween(from: Date, to: Date, cal: CalendarConfig): number {
  if (to.getTime() <= from.getTime()) return 0;
  const holidays = new Set(cal.holidays);
  const lastDay = localDayOf(to, cal.timezone);
  let day = localDayOf(from, cal.timezone);
  let total = 0;
  for (let i = 0; i < MAX_DAYS * 4 && compareDay(day, lastDay) <= 0; i++, day = addDays(day, 1)) {
    for (const w of windowsOfDay(day, cal, holidays)) {
      const s = Math.max(w.start.getTime(), from.getTime());
      const e = Math.min(w.end.getTime(), to.getTime());
      if (e > s) total += (e - s) / MINUTE;
    }
  }
  return Math.round(total * 1000) / 1000;
}

/** Prochaine ouverture du service à partir de `date` (incluse). */
export function nextOpening(date: Date, cal: CalendarConfig): Date {
  return addWorkingMinutes(date, 0, cal);
}

export function isWithinServiceHours(date: Date, cal: CalendarConfig): boolean {
  const holidays = new Set(cal.holidays);
  return windowsOfDay(localDayOf(date, cal.timezone), cal, holidays).some(
    (w) => date >= w.start && date < w.end,
  );
}
