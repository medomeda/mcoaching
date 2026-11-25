/** Échéances : dates calendaires en UTC, périodes en mois (la fin de mois est ramenée au dernier jour). */

export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay)));
}

/** Nouvelle échéance : part de la plus tardive entre l'échéance en cours et la date de paiement, ajoute une période. */
export function nextDueDate(current: Date | null, paidOn: Date, period: "MONTHLY" | "ANNUAL"): Date {
  const start = current && current.getTime() > paidOn.getTime() ? current : paidOn;
  return addMonths(start, period === "ANNUAL" ? 12 : 1);
}

export const toDay = (d: Date): string => d.toISOString().slice(0, 10);
export const fromDay = (s: string): Date => new Date(`${s}T00:00:00Z`);
