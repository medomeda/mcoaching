"use client";
import { ShieldCheck } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, DescriptionList, EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/display";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ENTITLEMENT_STATUS_LABELS, LEDGER_LABELS } from "@/lib/labels";

export default function MyEntitlementPage() {
  const q = useApi(["my-entitlement"], () => api.entitlements.myEntitlement());
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const e = q.data!.entitlement;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Mon droit au coaching" description="Statut, période de validité et consommation de votre quota." />
      {!e ? (
        <Card>
          <EmptyState title="Aucun droit attribué" description="Contactez l’administrateur pour bénéficier du coaching individuel." />
        </Card>
      ) : (
        <>
          {e.effective_status !== "ACTIVE" && (
            <Alert tone="warning">Votre droit n’est pas actif : vous ne pouvez pas soumettre de nouvelle demande. Vos demandes déjà ouvertes restent accessibles et continuent d’être traitées.</Alert>
          )}
          <Card>
            <CardHeader title="Droit en vigueur" icon={<ShieldCheck className="h-4 w-4" />} actions={<Badge tone={e.effective_status === "ACTIVE" ? "success" : "warning"}>{ENTITLEMENT_STATUS_LABELS[e.effective_status]}</Badge>} />
            <CardBody className="space-y-5">
              <DescriptionList
                items={[
                  ["Début", fmtDate(e.starts_at)],
                  ["Expiration", e.expires_at ? fmtDate(e.expires_at) : "Sans date de fin"],
                  ["Quota", e.quota_enabled ? `${(e.balance.limit ?? 0) + e.balance.corrections} demande(s)` : "Aucune limite"],
                  ["Demandes consommées", e.quota_enabled ? e.balance.used : "—"],
                ]}
              />
              {e.quota_enabled && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Consommation</span>
                    <span className="font-medium text-slate-800">{e.balance.remaining} restante(s)</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={e.balance.used} aria-valuemax={(e.balance.limit ?? 0) + e.balance.corrections}>
                    <div className="h-full bg-brand-600" style={{ width: `${Math.min(100, (e.balance.used / Math.max(1, (e.balance.limit ?? 0) + e.balance.corrections)) * 100)}%` }} />
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
          {e.quota_enabled && (
            <Card>
              <CardHeader title="Mouvements du quota" description="Une demande consomme une unité au moment de sa soumission. Un brouillon n’en consomme aucune." />
              {q.data!.ledger.length === 0 ? (
                <EmptyState title="Aucun mouvement" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {q.data!.ledger.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                      <span className="min-w-0">
                        <span className="font-medium text-slate-800">{LEDGER_LABELS[l.entry_type]}</span>
                        {l.request_reference && <span className="ml-2 font-mono text-xs text-slate-500">{l.request_reference}</span>}
                        {l.reason && <span className="block text-xs text-slate-500">{l.reason}</span>}
                        <span className="block text-xs text-slate-400">{fmtDateTime(l.created_at)}</span>
                      </span>
                      <span className={`font-semibold tabular-nums ${l.quantity < 0 ? "text-slate-700" : "text-emerald-700"}`}>{l.quantity > 0 ? `+${l.quantity}` : l.quantity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
