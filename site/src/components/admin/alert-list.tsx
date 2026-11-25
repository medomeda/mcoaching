import Link from "next/link";
import type { Alert } from "@/lib/alerts";

const TONE = { critical: "border-red-200 bg-red-50 text-red-900", warning: "border-amber-200 bg-amber-50 text-amber-900", info: "border-blue-200 bg-blue-50 text-blue-900" } as const;
const LABEL = { critical: "Urgent", warning: "À surveiller", info: "Info" } as const;

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Aucune alerte : tout est en ordre.</p>;
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => (
        <li key={`${a.kind}-${a.clientId ?? i}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm ${TONE[a.severity]}`}>
          <span><strong className="mr-2">{LABEL[a.severity]}</strong>{a.message}</span>
          <Link href={a.clientId ? `/admin/clients/${a.clientId}` : "/admin/prospects"} className="underline">Ouvrir</Link>
        </li>
      ))}
    </ul>
  );
}
