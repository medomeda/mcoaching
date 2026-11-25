import { asc } from "drizzle-orm";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { db } from "@/db/client";
import { plan, type Plan } from "@/db/schema";
import { formatFcfa, limitLabel } from "@/lib/plans";
import { moveAction, setPublishedAction } from "./actions";
import { PlanForm } from "./plan-form";

export const dynamic = "force-dynamic";

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ edit?: string; nouveau?: string; erreur?: string }> }) {
  const q = await searchParams;
  const plans = await db.select().from(plan).orderBy(asc(plan.position), asc(plan.name));
  const editing = q.edit ? plans.find((p) => p.id === q.edit) : undefined;
  const ids = plans.map((p) => p.id);
  const move = (id: string, delta: -1 | 1) => {
    const i = ids.indexOf(id);
    const next = [...ids];
    const j = i + delta;
    if (j < 0 || j >= next.length) return null;
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next.join(",");
  };

  return (
    <>
      <PageHeader title="Formules" description="Seules les formules publiées apparaissent sur la page Tarifs." actions={<Link href="/admin/formules?nouveau=1" className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white">Nouvelle formule</Link>} />
      {q.erreur ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{q.erreur}</p> : null}
      {editing || q.nouveau ? <div className="mb-6"><PlanForm plan={editing} /></div> : null}
      <DataTable<Plan>
        rows={plans}
        rowKey={(p) => p.id}
        empty="Aucune formule. Créez-en une pour l’afficher sur la page Tarifs."
        columns={[
          { header: "Nom", cell: (p) => <span className="font-semibold">{p.name}</span> },
          { header: "Mensuel", cell: (p) => (p.monthlyPrice === null ? "—" : formatFcfa(p.monthlyPrice)) },
          { header: "Limites", cell: (p) => `${limitLabel(p.maxCoaches, "coachs")} · ${limitLabel(p.maxMembers, "membres")}` },
          { header: "Essai", cell: (p) => `${p.trialDays} j` },
          {
            header: "Publication",
            cell: (p) => (
              <form action={setPublishedAction}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="published" value={String(!p.published)} />
                <button className={`rounded-full px-3 py-1 text-xs font-semibold ${p.published ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-600"}`}>{p.published ? "Publiée — dépublier" : "Brouillon — publier"}</button>
              </form>
            ),
          },
          {
            header: "Ordre",
            cell: (p) => (
              <div className="flex gap-1">
                {([[-1, "Monter"], [1, "Descendre"]] as const).map(([d, label]) => {
                  const order = move(p.id, d);
                  return (
                    <form key={label} action={moveAction}>
                      <input type="hidden" name="order" value={order ?? ""} />
                      <button disabled={!order} aria-label={`${label} ${p.name}`} className="rounded border border-slate-300 px-2 text-xs disabled:opacity-30">{d < 0 ? "↑" : "↓"}</button>
                    </form>
                  );
                })}
              </div>
            ),
          },
          { header: "", cell: (p) => <Link href={`/admin/formules?edit=${p.id}`} className="text-brand-700 underline">Modifier</Link> },
        ]}
      />
    </>
  );
}
