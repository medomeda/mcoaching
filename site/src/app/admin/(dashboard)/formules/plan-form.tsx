import { savePlanAction } from "./actions";
import type { Plan } from "@/db/schema";

const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export function PlanForm({ plan }: { plan?: Plan }) {
  return (
    <form action={savePlanAction} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <label className="text-sm font-medium sm:col-span-2">Nom<input name="name" required defaultValue={plan?.name} className={input} /></label>
      <label className="text-sm font-medium sm:col-span-2">Description courte<input name="description" defaultValue={plan?.description} className={input} /></label>
      <label className="text-sm font-medium">Prix mensuel (FCFA)<input name="monthlyPrice" type="number" min={0} defaultValue={plan?.monthlyPrice ?? ""} className={input} /></label>
      <label className="text-sm font-medium">Prix annuel (FCFA, facultatif)<input name="annualPrice" type="number" min={0} defaultValue={plan?.annualPrice ?? ""} className={input} /></label>
      <label className="text-sm font-medium">Remise annuelle (%)<input name="annualDiscountPercent" type="number" min={0} max={100} defaultValue={plan?.annualDiscountPercent ?? 0} className={input} /></label>
      <label className="text-sm font-medium">Durée de l’essai (jours)<input name="trialDays" type="number" min={0} max={365} defaultValue={plan?.trialDays ?? 30} className={input} /></label>
      <label className="text-sm font-medium">Coachs maximum (vide = illimité)<input name="maxCoaches" type="number" min={1} defaultValue={plan?.maxCoaches ?? ""} className={input} /></label>
      <label className="text-sm font-medium">Membres actifs maximum (vide = illimité)<input name="maxMembers" type="number" min={1} defaultValue={plan?.maxMembers ?? ""} className={input} /></label>
      <label className="text-sm font-medium sm:col-span-2">Avantages (un par ligne)<textarea name="features" rows={4} defaultValue={plan?.features.join("\n")} className={input} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="highlighted" defaultChecked={plan?.highlighted} />Mettre en avant (« Recommandée »)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={plan?.published} />Publiée sur la page Tarifs</label>
      <div className="sm:col-span-2"><button className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">Enregistrer</button></div>
    </form>
  );
}
