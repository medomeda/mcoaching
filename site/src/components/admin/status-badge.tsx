const TONES: Record<string, string> = {
  ESSAI: "bg-blue-50 text-blue-800",
  ACTIF: "bg-green-50 text-green-800",
  IMPAYE: "bg-amber-50 text-amber-900",
  SUSPENDU: "bg-slate-200 text-slate-800",
  RESILIE: "bg-slate-100 text-slate-500",
  NOUVEAU: "bg-blue-50 text-blue-800",
  CONTACTE: "bg-amber-50 text-amber-900",
  CONVERTI: "bg-green-50 text-green-800",
  PERDU: "bg-slate-100 text-slate-500",
};

export const STATUS_LABELS: Record<string, string> = {
  ESSAI: "Essai", ACTIF: "Actif", IMPAYE: "Impayé", SUSPENDU: "Suspendu", RESILIE: "Résilié",
  NOUVEAU: "Nouveau", CONTACTE: "Contacté", CONVERTI: "Converti", PERDU: "Perdu",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[status] ?? "bg-slate-100 text-slate-700"}`}>{STATUS_LABELS[status] ?? status}</span>;
}
