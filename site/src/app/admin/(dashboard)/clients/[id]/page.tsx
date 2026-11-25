import { asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge, STATUS_LABELS } from "@/components/admin/status-badge";
import { db } from "@/db/client";
import { CLIENT_STATUSES, payment, plan } from "@/db/schema";
import { formatFcfa } from "@/lib/plans";
import { getClientView } from "@/server/clients";
import { instanceUrl } from "@/server/instance-address";
import { notesAction, paymentAction, planAction, statusAction } from "../actions";
import { RotateKey } from "./rotate-key";
import { TestConnection } from "./test-connection";

export const dynamic = "force-dynamic";
const fmt = (d: string | null) => (d ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${d}T00:00:00Z`)) : "—");
const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const card = "rounded-xl border border-slate-200 bg-white p-5";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erreur?: string }> }) {
  const { id } = await params;
  const { erreur } = await searchParams;
  const c = await getClientView(id, db);
  if (!c) notFound();
  const [plans, payments] = await Promise.all([db.select().from(plan).orderBy(asc(plan.position)), db.select().from(payment).where(eq(payment.clientId, id)).orderBy(desc(payment.paidOn))]);
  const today = new Date().toISOString().slice(0, 10);
  const url = instanceUrl(c.instanceHost);
  return (
    <>
      <PageHeader title={c.name} description={url ?? "Aucune adresse d’instance"} actions={<StatusBadge status={c.status} />} />
      {erreur ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{erreur}</p> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold text-brand-900">Informations</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div><dt className="inline text-slate-600">Contact : </dt><dd className="inline">{c.contactName || "—"} · {c.contactEmail || "—"} · {c.contactPhone ?? "—"}</dd></div>
            <div><dt className="inline text-slate-600">Fin d’essai : </dt><dd className="inline">{fmt(c.trialEndsOn)}</dd></div>
            <div><dt className="inline text-slate-600">Prochaine échéance : </dt><dd className="inline">{fmt(c.nextDueOn)}</dd></div>
            <div><dt className="inline text-slate-600">Clé d’accès : </dt><dd className="inline">{c.hasKey ? "enregistrée (chiffrée)" : "absente"}</dd></div>
          </dl>
          <div className="mt-4 space-y-3"><TestConnection id={c.id} /><RotateKey id={c.id} /></div>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-brand-900">Statut et formule</h2>
          <form action={statusAction} className="mt-3 flex items-end gap-2">
            <input type="hidden" name="id" value={c.id} />
            <label className="flex-1 text-sm font-medium">Statut<select name="status" defaultValue={c.status} className={input}>{CLIENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label>
            <button className="rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white">Enregistrer</button>
          </form>
          <form action={planAction} className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <input type="hidden" name="id" value={c.id} />
            <label className="text-sm font-medium">Formule<select name="planId" defaultValue={c.planId ?? ""} required className={input}><option value="" disabled>—</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="text-sm font-medium">Facturation<select name="billingPeriod" defaultValue={c.billingPeriod} className={input}><option value="MONTHLY">Mensuelle</option><option value="ANNUAL">Annuelle</option></select></label>
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Changer</button>
          </form>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-brand-900">Saisir un paiement</h2>
          <form action={paymentAction} className="mt-3 grid grid-cols-2 gap-3">
            <input type="hidden" name="id" value={c.id} />
            <label className="text-sm font-medium">Date<input type="date" name="paidOn" required defaultValue={today} className={input} /></label>
            <label className="text-sm font-medium">Montant (FCFA)<input type="number" name="amount" min={1} required className={input} /></label>
            <label className="text-sm font-medium">Mode<input name="method" placeholder="Mobile money, virement…" className={input} /></label>
            <label className="text-sm font-medium">Note<input name="note" className={input} /></label>
            <div className="col-span-2"><button className="rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white">Enregistrer le paiement</button></div>
          </form>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-brand-900">Notes</h2>
          <form action={notesAction} className="mt-3 space-y-2">
            <input type="hidden" name="id" value={c.id} />
            <textarea name="notes" rows={5} defaultValue={c.notes} className={input} aria-label="Notes" />
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Enregistrer</button>
          </form>
        </section>

        <section className={`${card} lg:col-span-2`}>
          <h2 className="font-semibold text-brand-900">Historique des paiements</h2>
          {payments.length === 0 ? <p className="mt-3 text-sm text-slate-600">Aucun paiement enregistré.</p> : (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-600"><tr><th scope="col" className="py-2">Date</th><th scope="col">Montant</th><th scope="col">Mode</th><th scope="col">Période couverte</th><th scope="col">Note</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{payments.map((p) => <tr key={p.id}><td className="py-2">{fmt(p.paidOn)}</td><td>{formatFcfa(p.amount)}</td><td>{p.method || "—"}</td><td>{fmt(p.periodStart)} → {fmt(p.periodEnd)}</td><td>{p.note || "—"}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
