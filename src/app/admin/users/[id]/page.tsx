"use client";
import { KeyRound, Pencil, ShieldAlert, ShieldCheck, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, DescriptionList, EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ChangeRoleDialog, EditUserDialog, TemporaryPasswordDialog, useActivationByEmail } from "@/components/admin/user-dialogs";
import { UserStatusBadge } from "@/components/admin/users-table";
import { RequestList } from "@/components/requests/request-list";
import { useSession } from "@/components/providers";
import { api, DEMO_MODE } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/format";
import { AUDIT_ACTION_LABELS, ENTITLEMENT_STATUS_LABELS, ROLE_LABELS } from "@/lib/labels";

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useSession();
  const q = useApi(["user", id], () => api.users.getUserDetail(id));
  const [dialog, setDialog] = useState<"edit" | "role" | "suspend" | "reactivate" | "resend" | null>(null);
  const byEmail = useActivationByEmail();
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string } | null>(null);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { user: u, assignments, stats, audit } = q.data!;
  const self = me?.id === u.id;

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: u.role === "LEARNER" ? "/admin/learners" : u.role === "COACH" ? "/admin/coaches" : "/admin/users", label: "Retour" }}
        title={u.full_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {ROLE_LABELS[u.role]} · {u.email} <UserStatusBadge status={u.status} />
            {u.is_demo && <Badge tone="warning">Compte de démonstration</Badge>}
          </span>
        }
        actions={
          <>
            <Button size="sm" variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setDialog("edit")}>
              Modifier
            </Button>
            {!self && (
              <Button size="sm" variant="outline" icon={<ShieldAlert className="h-4 w-4" />} onClick={() => setDialog("role")}>
                Rôle
              </Button>
            )}
            {u.status !== "SUSPENDED" && (
              <Button size="sm" variant="outline" icon={<KeyRound className="h-4 w-4" />} onClick={() => setDialog("resend")}>
                {u.status === "PENDING_ACTIVATION" ? "Renvoyer l’activation" : "Réinitialiser l’accès"}
              </Button>
            )}
            {!self && u.status !== "SUSPENDED" && (
              <Button size="sm" variant="danger" icon={<UserX className="h-4 w-4" />} onClick={() => setDialog("suspend")}>
                Suspendre
              </Button>
            )}
            {u.status === "SUSPENDED" && (
              <Button size="sm" icon={<UserCheck className="h-4 w-4" />} onClick={() => setDialog("reactivate")}>
                Réactiver
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Informations" />
          <CardBody>
            <DescriptionList
              items={[
                ["Téléphone", u.phone ?? "—"],
                ["Créé le", fmtDateTime(u.created_at)],
                ["Dernière connexion", u.last_login_at ? fmtDateTime(u.last_login_at) : "Jamais"],
                ["Demandes (total / ouvertes)", `${stats.requests_total} / ${stats.requests_open}`],
                ...(u.role === "LEARNER"
                  ? ([
                      ["Coach affecté", u.coach ? <Link key="c" href={`/admin/coaches/${u.coach.id}`} className="text-brand-700 hover:underline">{u.coach.full_name}</Link> : <Badge key="n" tone="warning">Aucun</Badge>],
                      [
                        "Droit au coaching",
                        <span key="e" className="flex items-center gap-2">
                          <Badge tone={u.entitlement_status === "ACTIVE" ? "success" : "warning"}>{ENTITLEMENT_STATUS_LABELS[u.entitlement_status ?? "NONE"]}</Badge>
                          <Link href={`/admin/entitlements/${u.id}`} className="text-xs text-brand-700 hover:underline">Gérer</Link>
                        </span>,
                      ],
                    ] as Array<[string, React.ReactNode]>)
                  : []),
                ...(u.role === "COACH" ? ([["Apprenants affectés", u.assigned_learners ?? 0]] as Array<[string, React.ReactNode]>) : []),
              ]}
            />
            {u.role === "LEARNER" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <LinkButton href={`/admin/assignments?learner=${u.id}`} size="sm" variant="secondary">
                  Gérer l’affectation
                </LinkButton>
                <LinkButton href={`/admin/entitlements/${u.id}`} size="sm" variant="secondary" icon={<ShieldCheck className="h-4 w-4" />}>
                  Droit et quota
                </LinkButton>
              </div>
            )}
            {u.role === "COACH" && (
              <div className="mt-4">
                <LinkButton href={`/admin/coaches/${u.id}`} size="sm" variant="secondary">
                  Fiche coach (charge, disponibilités)
                </LinkButton>
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Historique des affectations" />
          {assignments.length === 0 ? (
            <EmptyState title="Aucune affectation" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {assignments.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-xs sm:px-5">
                  <p className="text-sm font-medium text-slate-800">
                    {a.learner_name} → {a.coach_name} {a.status === "ACTIVE" && <Badge tone="success">Active</Badge>}
                  </p>
                  <p className="text-slate-500">
                    Du {fmtDateTime(a.started_at)} {a.ended_at ? `au ${fmtDateTime(a.ended_at)}` : ""} · par {a.assigned_by_name}
                  </p>
                  {a.reason && <p className="text-slate-500">Motif : {a.reason}</p>}
                  {a.end_reason && <p className="text-slate-500">Fin : {a.end_reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {u.role === "LEARNER" && (
        <>
          <h2 className="text-sm font-semibold text-slate-700">Demandes de l’apprenant</h2>
          <Suspense>
            <RequestList role="ADMIN" base="/admin/requests" learnerId={u.id} />
          </Suspense>
        </>
      )}

      <Card>
        <CardHeader title="Journal administratif du compte" description="50 derniers événements." />
        {audit.length === 0 ? (
          <EmptyState title="Aucun événement" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {audit.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                <span>
                  <span className="font-medium text-slate-800">{AUDIT_ACTION_LABELS[l.action] ?? l.action}</span>
                  <span className="text-slate-500"> · {l.actor_name}</span>
                  {l.reason && <span className="block text-xs text-slate-500">Motif : {l.reason}</span>}
                </span>
                <span className="text-xs text-slate-400">{fmtDateTime(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <EditUserDialog open={dialog === "edit"} onOpenChange={(v) => setDialog(v ? "edit" : null)} user={u} />
      <ChangeRoleDialog open={dialog === "role"} onOpenChange={(v) => setDialog(v ? "role" : null)} user={u} />
      <ConfirmDialog
        open={dialog === "suspend"}
        onOpenChange={(v) => setDialog(v ? "suspend" : null)}
        title={`Suspendre ${u.full_name} ?`}
        description="L’utilisateur sera déconnecté et ne pourra plus se connecter. Son historique reste consultable. Pour un coach, l’administration est alertée des demandes ouvertes à réaffecter."
        confirmLabel="Suspendre"
        tone="danger"
        reason={{ label: "Motif", required: true }}
        onConfirm={async (reason) => {
          await api.users.setUserStatus(u.id, { action: "SUSPEND", reason });
          toast.success("Compte suspendu.");
        }}
      />
      <ConfirmDialog
        open={dialog === "reactivate"}
        onOpenChange={(v) => setDialog(v ? "reactivate" : null)}
        title={`Réactiver ${u.full_name} ?`}
        confirmLabel="Réactiver"
        reason={{ label: "Motif", required: true }}
        onConfirm={async (reason) => {
          await api.users.setUserStatus(u.id, { action: "REACTIVATE", reason });
          toast.success("Compte réactivé.");
        }}
      />
      <ConfirmDialog
        open={dialog === "resend"}
        onOpenChange={(v) => setDialog(v ? "resend" : null)}
        title={byEmail ? (u.status === "PENDING_ACTIVATION" ? "Renvoyer le lien d’activation ?" : "Réinitialiser l’accès ?") : "Générer un nouveau mot de passe provisoire ?"}
        description={
          byEmail
            ? "Un nouveau lien sécurisé à usage unique sera envoyé par e-mail. Les liens précédents sont invalidés."
            : "Le mot de passe actuel est remplacé, les sessions ouvertes sont fermées et le compte est activé s’il était en attente. Le nouveau mot de passe vous sera affiché une seule fois."
        }
        confirmLabel={byEmail ? "Envoyer" : "Générer"}
        onConfirm={async () => {
          const r = await api.users.resendAccess(u.id);
          if (r.temporary_password) {
            setCredentials({ name: u.full_name, email: u.email, password: r.temporary_password });
            return;
          }
          toast.success(`Lien envoyé à ${u.email}.${DEMO_MODE ? " (Démo : voir la boîte mail.)" : ""}`);
        }}
      />
      <TemporaryPasswordDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  );
}
