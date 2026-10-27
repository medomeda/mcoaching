"use client";
import { ArrowRightLeft, ClipboardList, Eye, FileText, History, Lock, MessagesSquare, NotebookPen, Pencil, Send, Star, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { RequestDetail } from "@/server/api/requests";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, DescriptionList, ErrorState, Loading, PageHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/form";
import { useSession } from "@/components/providers";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/labels";
import { AttachmentChips } from "./attachments";
import { PriorityBadge, SlaBadge, SlaBar, StatusBadge } from "./badges";
import { Composer, MessageThread } from "./message-thread";
import { RequestActions } from "./request-actions";

export function RequestDetailPage({ role, listHref }: { role: "ADMIN" | "COACH" | "LEARNER"; listHref: string }) {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const q = useApi(["request", id], () => api.requests.getRequestDetail(id));

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;

  return (
    <div>
      <PageHeader
        back={{ href: listHref, label: "Retour aux demandes" }}
        title={d.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{d.reference ?? "Brouillon"}</span>
            <StatusBadge status={d.status} />
            <PriorityBadge priority={d.priority} />
            <SlaBadge sla={d.sla} />
            {d.cycle_number > 1 && <Badge tone="brand">Cycle {d.cycle_number}</Badge>}
          </span>
        }
        actions={<RequestActions detail={d} />}
      />

      {role === "ADMIN" && (
        <div className="mb-4">
          <Alert tone="neutral" icon={<Eye className="h-4 w-4" />}>
            Consultation à des fins de supervision et de continuité du service. Votre accès à cette demande est enregistré dans le journal d’audit.
          </Alert>
        </div>
      )}
      {d.status === "DRAFT" && role === "LEARNER" && <DraftPanel detail={d} />}
      {d.status === "WAITING_FOR_LEARNER" && role === "LEARNER" && (
        <div className="mb-4">
          <Alert tone="warning" title="Votre coach attend votre réponse">
            Répondez à la demande de précisions ci-dessous pour poursuivre l’accompagnement.
          </Alert>
        </div>
      )}
      {d.status === "RESPONSE_PROVIDED" && role === "LEARNER" && (
        <div className="mb-4">
          <Alert tone="success" title="Une réponse a été apportée à votre demande">
            {d.allowed_actions.includes("CLOSE") ? "Vous pouvez clôturer la demande si elle est résolue." : "Votre coach clôturera la demande. Vous pouvez encore lui écrire si une question subsiste."}
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {d.status !== "DRAFT" && (
            <Card>
              <CardHeader title="Échanges" icon={<MessagesSquare className="h-4 w-4" />} description={`${d.messages.filter((m) => m.kind === "USER").length} message(s)`} />
              <CardBody className="pb-0">
                <MessageThread detail={d} viewerId={user?.id ?? ""} />
                {role !== "ADMIN" ? (
                  <Composer detail={d} role={role} />
                ) : (
                  <p className="py-4 text-center text-xs text-slate-400">L’administrateur supervise les échanges sans y participer. Utilisez « Relancer le coach » si nécessaire.</p>
                )}
                {role !== "ADMIN" && !d.allowed_actions.includes("MESSAGE") && (
                  <p className="flex items-center justify-center gap-1.5 py-4 text-center text-xs text-slate-400">
                    <Lock className="h-3.5 w-3.5" /> {d.status === "CLOSED" || d.status === "CANCELLED" ? `Demande ${STATUS_LABELS[d.status].toLowerCase()} : la discussion est fermée.` : "Vous ne pouvez pas écrire dans cette demande."}
                  </p>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Informations" icon={<ClipboardList className="h-4 w-4" />} />
            <CardBody className="space-y-4">
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  ["Apprenant", d.learner.full_name],
                  ["Coach responsable", d.coach ? `${d.coach.full_name}${d.coach.status !== "ACTIVE" ? " (suspendu)" : ""}` : "—"],
                  ["Catégorie", d.category_name],
                  ["Soumise le", fmtDateTime(d.submitted_at)],
                  ["Échéance de première réponse", fmtDateTime(d.due_at)],
                  ["Première réponse", d.first_response_at ? fmtDateTime(d.first_response_at) : "En attente"],
                  ...(d.closed_at ? ([["Clôturée le", fmtDateTime(d.closed_at)]] as Array<[string, string]>) : []),
                ]}
              />
              <SlaBar sla={d.sla} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Description initiale" icon={<FileText className="h-4 w-4" />} />
            <CardBody className="space-y-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{d.description}</p>
              <AttachmentChips items={d.attachments} />
            </CardBody>
          </Card>

          {d.notes !== null && <NotesCard detail={d} />}
          {d.cycles.some((c) => c.rating) && <RatingsCard detail={d} />}
          <HistoryCard detail={d} />
        </div>
      </div>
    </div>
  );
}

function DraftPanel({ detail }: { detail: RequestDetail }) {
  const router = useRouter();
  const key = useRef(`submit-${detail.id}-${Math.random().toString(36).slice(2, 10)}`);
  const [confirm, setConfirm] = useState(false);
  const [abandon, setAbandon] = useState(false);
  return (
    <div className="mb-4">
      <Alert
        tone="info"
        title="Brouillon non soumis"
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/learner/requests/${detail.id}/edit`} size="sm" variant="outline" icon={<Pencil className="h-4 w-4" />}>
              Modifier
            </LinkButton>
            <Button size="sm" icon={<Send className="h-4 w-4" />} onClick={() => setConfirm(true)}>
              Soumettre
            </Button>
            <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => setAbandon(true)}>
              Abandonner
            </Button>
          </div>
        }
      >
        Un brouillon ne consomme aucun quota et ne déclenche aucun délai de réponse.
      </Alert>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Soumettre la demande ?"
        description="Vos droits et votre quota sont vérifiés à la soumission. Si un quota est activé, une unité sera consommée."
        confirmLabel="Soumettre"
        onConfirm={async () => {
          // Clé d'idempotence stable : un double clic ne consomme jamais deux unités.
          const r = await api.requests.submitRequest(detail.id, { idempotencyKey: key.current });
          toast.success(`Demande ${r.reference} soumise. Échéance de première réponse : ${fmtDateTime(r.due_at)}.`);
          router.refresh();
        }}
      >
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{detail.subject}</p>
          <p className="mt-1 text-xs text-slate-500">{detail.category_name}</p>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={abandon}
        onOpenChange={setAbandon}
        title="Abandonner ce brouillon ?"
        description="Le brouillon sera marqué comme annulé et ne pourra plus être soumis."
        confirmLabel="Abandonner"
        tone="danger"
        onConfirm={async () => {
          await api.requests.abandonDraft(detail.id);
          toast.success("Brouillon abandonné.");
          router.push("/learner/requests");
        }}
      />
    </div>
  );
}

function NotesCard({ detail }: { detail: RequestDetail }) {
  const [body, setBody] = useState("");
  const add = useAction(() => api.requests.addNote(detail.id, { body }), { success: "Note enregistrée.", onSuccess: () => setBody("") });
  const canWrite = detail.allowed_actions.includes("NOTE");
  return (
    <Card className="border-amber-200">
      <CardHeader title="Notes internes" icon={<NotebookPen className="h-4 w-4" />} description="Jamais visibles par l’apprenant ni envoyées par e-mail." />
      <CardBody className="space-y-3">
        {canWrite && (
          <div className="space-y-2">
            <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ajouter une note privée…" aria-label="Nouvelle note interne" maxLength={5000} />
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" disabled={!body.trim()} loading={add.pending} onClick={() => void add.run()}>
                Ajouter la note
              </Button>
            </div>
          </div>
        )}
        {detail.notes!.length === 0 ? (
          <p className="text-xs text-slate-400">Aucune note.</p>
        ) : (
          <ul className="space-y-2">
            {detail.notes!.map((n) => (
              <li key={n.id} className="rounded-lg bg-amber-50/60 p-2.5">
                <p className="whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {n.author} · {fmtDateTime(n.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function RatingsCard({ detail }: { detail: RequestDetail }) {
  return (
    <Card>
      <CardHeader title="Évaluations" icon={<Star className="h-4 w-4" />} description="Non publiques." />
      <CardBody>
        <ul className="space-y-2">
          {detail.cycles
            .filter((c) => c.rating)
            .map((c) => (
              <li key={c.cycle_number} className="rounded-lg bg-slate-50 p-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Cycle {c.cycle_number}</span>
                  <span className="flex items-center gap-0.5" aria-label={`${c.rating!.score} sur 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-3.5 w-3.5 ${n <= c.rating!.score ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                    ))}
                  </span>
                </div>
                {c.rating!.comment && <p className="mt-1 text-slate-700">« {c.rating!.comment} »</p>}
              </li>
            ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function HistoryCard({ detail }: { detail: RequestDetail }) {
  type Ev = { at: string; key: string; node: React.ReactNode };
  const events: Ev[] = [
    ...detail.status_history.map((h) => ({
      at: h.created_at,
      key: h.id,
      node: (
        <>
          <span className="font-medium text-slate-800">{h.old_status ? `${STATUS_LABELS[h.old_status]} → ${STATUS_LABELS[h.new_status]}` : `Création (${STATUS_LABELS[h.new_status]})`}</span>
          <span className="block text-slate-500">
            {h.changed_by_name}
            {h.cycle_number ? ` · cycle ${h.cycle_number}` : ""}
            {h.reason ? ` · « ${h.reason} »` : ""}
          </span>
        </>
      ),
    })),
    ...detail.assignment_history.map((h) => ({
      at: h.created_at,
      key: h.id,
      node: (
        <>
          <span className="flex items-center gap-1 font-medium text-slate-800">
            <ArrowRightLeft className="h-3 w-3" /> Réaffectation : {h.old_coach_name ?? "—"} → {h.new_coach_name}
          </span>
          <span className="block text-slate-500">
            {h.changed_by_name} · « {h.reason} »
          </span>
        </>
      ),
    })),
    ...detail.cycles
      .filter((c) => c.cycle_number > 1)
      .map((c) => ({
        at: c.started_at,
        key: `cycle-${c.cycle_number}`,
        node: (
          <>
            <span className="font-medium text-brand-800">Nouveau cycle {c.cycle_number} (réouverture)</span>
            <span className="block text-slate-500">
              {c.reopened_by_name} · « {c.reopen_reason} » · échéance {fmtDateTime(c.due_at)}
            </span>
          </>
        ),
      })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <Card>
      <CardHeader title="Historique" icon={<History className="h-4 w-4" />} description="Statuts, affectations et cycles — non modifiable." />
      <CardBody>
        <ol className="relative space-y-3 border-l border-slate-200 pl-4">
          {events.map((e) => (
            <li key={e.key} className="text-xs">
              <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-400" aria-hidden />
              <span className="block text-[11px] text-slate-400">{fmtDateTime(e.at)}</span>
              {e.node}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
