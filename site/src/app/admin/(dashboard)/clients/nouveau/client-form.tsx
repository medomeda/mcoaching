"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createClientAction, type CreateState } from "../actions";

const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export interface Draft { prospectId?: string; name?: string; contactName?: string; contactEmail?: string; contactPhone?: string | null }

export function ClientForm({ draft, plans, domain }: { draft: Draft; plans: { id: string; name: string }[]; domain: string }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createClientAction, null);
  if (state?.ok) {
    return (
      <div role="status" className="space-y-3 rounded-xl border border-gold-500 bg-gold-100 p-5 text-brand-900">
        <p className="font-semibold">Client créé. Copiez maintenant la clé d’accès de l’instance : elle ne sera plus affichée.</p>
        <p className="text-sm">À renseigner dans la variable <code>OPS_API_KEY</code> de l’instance du client.</p>
        <input readOnly aria-label="Clé d’accès de l’instance" value={state.instanceKey} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm" />
        <Link href={`/admin/clients/${state.clientId}`} className="inline-flex rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white">J’ai copié la clé — ouvrir la fiche</Link>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
      {state && !state.ok ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">{state.error}</p> : null}
      {draft.prospectId ? <input type="hidden" name="prospectId" value={draft.prospectId} /> : null}
      <label className="text-sm font-medium sm:col-span-2">Nom du client<input name="name" required defaultValue={draft.name} className={input} /></label>
      <label className="text-sm font-medium">Contact<input name="contactName" defaultValue={draft.contactName} className={input} /></label>
      <label className="text-sm font-medium">E-mail<input name="contactEmail" type="email" defaultValue={draft.contactEmail} className={input} /></label>
      <label className="text-sm font-medium">Téléphone<input name="contactPhone" defaultValue={draft.contactPhone ?? ""} className={input} /></label>
      <label className="text-sm font-medium">Sous-domaine de l’instance<span className="mt-1 flex items-center gap-1"><input name="instanceHost" required pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?" className={input.replace("mt-1 ", "")} /><span className="text-slate-600">.{domain}</span></span></label>
      <label className="text-sm font-medium">Formule<select name="planId" defaultValue="" className={input}><option value="">— à définir —</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="text-sm font-medium">Facturation<select name="billingPeriod" defaultValue="MONTHLY" className={input}><option value="MONTHLY">Mensuelle</option><option value="ANNUAL">Annuelle</option></select></label>
      <div className="sm:col-span-2"><button disabled={pending} className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Créer le client</button></div>
    </form>
  );
}
