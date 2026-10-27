"use client";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ROLES, type Role } from "@/modules/core/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { api, DEMO_MODE } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { ROLE_LABELS } from "@/lib/labels";

/** Activation par e-mail, ou mot de passe provisoire remis à l'administrateur (selon la configuration serveur). */
export function useActivationByEmail(): boolean {
  const sys = useQuery({ queryKey: ["system-status"], queryFn: () => api.auth.systemStatus() });
  return sys.data?.activationByEmail ?? true;
}

/** Affiche une seule fois le mot de passe provisoire d'un compte : il n'est pas conservé en clair. */
export function TemporaryPasswordDialog({ credentials, onClose }: { credentials: { name: string; email: string; password: string } | null; onClose: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credentials?.password ?? "");
      toast.success("Mot de passe copié.");
    } catch {
      toast.error("Copie impossible : sélectionnez le mot de passe manuellement.");
    }
  };
  return (
    <Dialog
      open={!!credentials}
      onOpenChange={(v) => !v && onClose()}
      title="Mot de passe provisoire"
      description={`Transmettez-le à ${credentials?.name ?? "l’utilisateur"} par un canal sûr. Il ne sera plus affiché : en cas de perte, utilisez « Réinitialiser l’accès ».`}
      size="sm"
      footer={<Button onClick={onClose}>J’ai noté le mot de passe</Button>}
    >
      <p className="text-sm text-slate-600">
        Identifiant : <strong className="break-all">{credentials?.email}</strong>
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-center font-mono text-lg tracking-wider text-slate-900">{credentials?.password}</code>
        <Button variant="outline" icon={<Copy className="h-4 w-4" />} onClick={() => void copy()} aria-label="Copier le mot de passe" />
      </div>
      <p className="text-xs text-slate-500">L’utilisateur peut le remplacer depuis son profil après sa première connexion.</p>
    </Dialog>
  );
}

/** Création d'un compte : activation par e-mail, ou compte actif avec mot de passe provisoire. */
export function CreateUserDialog({ open, onOpenChange, defaultRole, lockRole }: { open: boolean; onOpenChange: (v: boolean) => void; defaultRole: Role; lockRole?: boolean }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", role: defaultRole });
  useEffect(() => {
    if (open) setForm({ full_name: "", email: "", phone: "", role: defaultRole });
  }, [open, defaultRole]);
  const byEmail = useActivationByEmail();
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string } | null>(null);
  const act = useAction(() => api.users.createUser({ ...form, phone: form.phone || null }), {
    silentError: true,
    onSuccess: (u) => {
      onOpenChange(false);
      if (u.temporary_password) {
        toast.success(`Compte créé et activé pour ${u.full_name}.`);
        setCredentials({ name: u.full_name, email: u.email, password: u.temporary_password });
      } else {
        toast.success(`Compte créé pour ${u.full_name}. Un e-mail d’activation a été envoyé.${DEMO_MODE ? " (Démo : voir la boîte mail.)" : ""}`);
      }
    },
  });
  return (
    <>
    <TemporaryPasswordDialog credentials={credentials} onClose={() => setCredentials(null)} />
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Créer un compte ${lockRole ? ROLE_LABELS[defaultRole].toLowerCase() : ""}`.trim()}
      description={byEmail ? "L’utilisateur recevra un lien sécurisé (valable 72 h) pour définir son mot de passe." : "Le compte sera actif immédiatement. Un mot de passe provisoire vous sera remis pour le transmettre à l’utilisateur."}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => void act.run()} loading={act.pending}>
            Créer le compte
          </Button>
        </>
      }
    >
      <Field label="Nom complet" required error={act.fieldErrors.full_name}>
        {(p) => <Input {...p} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />}
      </Field>
      <Field label="Adresse e-mail" required error={act.fieldErrors.email}>
        {(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
      </Field>
      <Field label="Téléphone" error={act.fieldErrors.phone}>
        {(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
      </Field>
      {!lockRole && (
        <Field label="Rôle" required>
          {(p) => (
            <Select {...p} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <FormError message={act.error && !Object.keys(act.fieldErrors).length ? act.error.message : null} />
    </Dialog>
    </>
  );
}

export function EditUserDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (v: boolean) => void; user: { id: string; full_name: string; email: string; phone: string | null } }) {
  const [form, setForm] = useState({ full_name: user.full_name, email: user.email, phone: user.phone ?? "" });
  useEffect(() => {
    if (open) setForm({ full_name: user.full_name, email: user.email, phone: user.phone ?? "" });
  }, [open, user]);
  const act = useAction(() => api.users.updateUser(user.id, { ...form, phone: form.phone || null }), { success: "Profil mis à jour.", silentError: true, onSuccess: () => onOpenChange(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Modifier le profil"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => void act.run()} loading={act.pending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <Field label="Nom complet" required error={act.fieldErrors.full_name}>
        {(p) => <Input {...p} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />}
      </Field>
      <Field label="Adresse e-mail" required error={act.fieldErrors.email}>
        {(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
      </Field>
      <Field label="Téléphone" error={act.fieldErrors.phone}>
        {(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
      </Field>
      <FormError message={act.error && !Object.keys(act.fieldErrors).length ? act.error.message : null} />
    </Dialog>
  );
}

export function ChangeRoleDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (v: boolean) => void; user: { id: string; role: Role; full_name: string } }) {
  const [role, setRole] = useState<Role>(user.role);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) {
      setRole(user.role);
      setReason("");
    }
  }, [open, user]);
  const act = useAction(() => api.users.changeRole(user.id, { role, reason }), { success: "Rôle modifié. Les sessions de l’utilisateur ont été fermées.", silentError: true, onSuccess: () => onOpenChange(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Modifier le rôle de ${user.full_name}`}
      description="Action sensible enregistrée dans le journal d’audit. Impossible si des demandes ou affectations sont en cours."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => void act.run()} loading={act.pending} disabled={role === user.role || reason.trim().length < 3}>
            Confirmer
          </Button>
        </>
      }
    >
      <Field label="Nouveau rôle">
        {(p) => (
          <Select {...p} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Motif" required error={act.fieldErrors.reason}>
        {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
      </Field>
      <FormError message={act.error?.message} />
    </Dialog>
  );
}
