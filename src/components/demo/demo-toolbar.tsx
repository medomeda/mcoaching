"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, FlaskConical, Mail, Play, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { Dialog } from "@/components/ui/dialog";
import { api, DEMO_MODE } from "@/lib/api";
import { fmtDateTime, fmtLongDateTime } from "@/lib/format";

/**
 * Outils de DÉMONSTRATION (jamais en production) :
 * - horloge simulée pour faire « vivre » les délais, rappels et escalades ;
 * - exécution immédiate des tâches planifiées ;
 * - simulation de pannes du fournisseur e-mail ;
 * - boîte de réception simulée (liens d'activation / réinitialisation, notifications).
 */
export function DemoToolbar() {
  const [open, setOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["demo-state"], queryFn: () => api.demo.demoState(), enabled: DEMO_MODE, refetchInterval: open ? 5000 : 30000 });
  const mails = useQuery({ queryKey: ["demo-mailbox"], queryFn: () => api.demo.mailbox(), enabled: DEMO_MODE && mailOpen });
  if (!DEMO_MODE) return null;

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      await qc.invalidateQueries();
      toast.success(msg);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const offsetH = (state.data?.clock_offset_ms ?? 0) / 3600_000;
  const rate = state.data?.email_failure_rate ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 left-4 z-40 flex lg:left-[17rem] items-center gap-2 rounded-full bg-gold-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg hover:bg-gold-700"
        aria-expanded={open}
      >
        <FlaskConical className="h-4 w-4" /> Démo
        {offsetH !== 0 && <span className="rounded-full bg-white/25 px-1.5">+{offsetH.toFixed(0)} h</span>}
      </button>
      {open && (
        <div className="fixed bottom-16 left-4 z-40 lg:left-[17rem] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-gold-500/40 bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-gold-700" />
              <span className="text-sm font-semibold">Outils de démonstration</span>
            </div>
            <button onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Fermer">
              <X className="h-4 w-4" />
            </button>
          </div>

          <section className="space-y-2 rounded-xl bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Clock className="h-3.5 w-3.5" /> Horloge simulée (Africa/Abidjan)
            </div>
            <p className="text-sm font-semibold capitalize text-slate-900">{fmtLongDateTime(state.data?.now)}</p>
            {offsetH !== 0 && <p className="text-xs text-slate-500">Heure réelle : {fmtDateTime(state.data?.real_now)}</p>}
            <div className="flex flex-wrap gap-1.5">
              {[
                [60, "+1 h"],
                [240, "+4 h"],
                [1440, "+1 jour"],
                [4320, "+3 jours"],
              ].map(([m, l]) => (
                <Button key={l} size="sm" variant="outline" onClick={() => act(() => api.demo.advanceClock({ minutes: m }), `Horloge avancée (${l}). Tâches planifiées exécutées.`)}>
                  {l}
                </Button>
              ))}
              {offsetH !== 0 && (
                <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => act(() => api.demo.resetClock(), "Horloge réelle rétablie.")}>
                  Réel
                </Button>
              )}
            </div>
            <p className="text-[11px] leading-snug text-slate-500">Avancer l’horloge fait progresser les délais : rappels à 50 % / 75 %, retards et escalades sont produits par les tâches planifiées.</p>
          </section>

          <div className="mt-3 grid gap-2">
            <Button variant="secondary" size="sm" icon={<Play className="h-4 w-4" />} onClick={() => act(() => api.demo.runJobs(), "Tâches planifiées exécutées.")}>
              Exécuter les tâches planifiées
            </Button>
            <Button variant="secondary" size="sm" icon={<Mail className="h-4 w-4" />} onClick={() => setMailOpen(true)}>
              Boîte mail de démo ({state.data?.mailbox_count ?? 0})
            </Button>
          </div>

          <section className="mt-3 space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Fournisseur e-mail simulé</p>
            <div className="flex gap-1.5">
              {[
                [0, "Fiable"],
                [0.5, "50 % d’échecs"],
                [1, "En panne"],
              ].map(([r, l]) => (
                <Button key={l} size="sm" variant={rate === r ? "primary" : "outline"} onClick={() => act(() => api.demo.setEmailFailureRate({ rate: r }), `Fournisseur : ${l}.`)}>
                  {l}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">Les adresses en @echec.test échouent toujours.</p>
          </section>
        </div>
      )}

      <Dialog open={mailOpen} onOpenChange={setMailOpen} title="Boîte mail de démonstration" description="E-mails effectivement « envoyés » par la plateforme. Ils ne contiennent jamais le contenu des échanges privés." size="lg">
        {mails.data && mails.data.length === 0 && <EmptyState title="Aucun e-mail envoyé" description="Les e-mails partent lors de l’exécution des tâches planifiées." />}
        <ul className="space-y-3">
          {mails.data?.map((m) => (
            <li key={m.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{m.subject}</p>
                <span className="text-xs text-slate-500">{fmtDateTime(m.received_at)}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                À : {m.to} {m.to.endsWith("@echec.test") && <Badge tone="danger">adresse en échec</Badge>}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{m.body}</p>
              {m.link && (
                <Link href={m.link} onClick={() => setMailOpen(false)} className="mt-2 inline-block text-sm font-medium text-brand-700 underline">
                  {m.link.startsWith("/activate") ? "Activer le compte" : m.link.startsWith("/reset-password") ? "Réinitialiser le mot de passe" : "Ouvrir sur la plateforme"}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
