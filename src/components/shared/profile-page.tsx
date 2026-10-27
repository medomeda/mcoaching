"use client";
import { KeyRound, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@/components/ui/display";
import { Field, FormError, Input } from "@/components/ui/form";
import { useSession } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";

export function ProfilePage({ extra }: { extra?: React.ReactNode }) {
  const { user, setUser } = useSession();
  const [name, setName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [pErr, setPErr] = useState<Record<string, string>>({});
  const [pBusy, setPBusy] = useState(false);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [wErr, setWErr] = useState<Record<string, string>>({});
  const [wMsg, setWMsg] = useState<string | null>(null);
  const [wBusy, setWBusy] = useState(false);

  useEffect(() => {
    setName(user?.full_name ?? "");
    setPhone(user?.phone ?? "");
  }, [user]);

  if (!user) return null;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setPBusy(true);
    setPErr({});
    try {
      setUser(await api.auth.updateMyProfile({ full_name: name, phone: phone || null }));
      toast.success("Profil enregistré.");
    } catch (err) {
      if (err instanceof ApiError) {
        setPErr(err.fieldErrors ?? {});
        toast.error(err.message);
      }
    } finally {
      setPBusy(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setWErr({});
    setWMsg(null);
    if (pwd.next !== pwd.confirm) return setWErr({ confirm: "Les mots de passe ne correspondent pas." });
    setWBusy(true);
    try {
      await api.auth.changePassword({ current: pwd.current, next: pwd.next });
      setPwd({ current: "", next: "", confirm: "" });
      toast.success("Mot de passe modifié. Vos autres sessions ont été fermées.");
    } catch (err) {
      if (err instanceof ApiError) {
        setWErr(err.fieldErrors ?? {});
        setWMsg(err.message);
      }
    } finally {
      setWBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Mon profil" />
      <Card>
        <CardHeader title="Informations personnelles" icon={<UserRound className="h-4 w-4" />} />
        <CardBody className="space-y-5">
          <DescriptionList
            items={[
              ["Adresse e-mail", user.email],
              ["Rôle", ROLE_LABELS[user.role]],
              ["Compte créé le", fmtDateTime(user.created_at)],
              ["Dernière connexion", fmtDateTime(user.last_login_at)],
            ]}
          />
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Nom complet" required error={pErr.full_name}>
              {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="Téléphone" error={pErr.phone}>
              {(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+225 …" />}
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={pBusy}>
                Enregistrer
              </Button>
            </div>
          </form>
          <p className="text-xs text-slate-500">L’adresse e-mail ne peut être modifiée que par un administrateur.</p>
        </CardBody>
      </Card>
      {extra}
      <Card>
        <CardHeader title="Mot de passe" icon={<KeyRound className="h-4 w-4" />} />
        <CardBody>
          <form onSubmit={savePassword} className="grid gap-4 sm:grid-cols-3" noValidate>
            <Field label="Mot de passe actuel" required error={wErr.current}>
              {(p) => <Input {...p} type="password" autoComplete="current-password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />}
            </Field>
            <Field label="Nouveau mot de passe" required error={wErr.next} hint="10 caractères min., lettre et chiffre.">
              {(p) => <Input {...p} type="password" autoComplete="new-password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />}
            </Field>
            <Field label="Confirmation" required error={wErr.confirm}>
              {(p) => <Input {...p} type="password" autoComplete="new-password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />}
            </Field>
            <div className="space-y-3 sm:col-span-3">
              <FormError message={wMsg && !Object.keys(wErr).length ? wMsg : null} />
              <Button type="submit" variant="secondary" loading={wBusy}>
                Modifier le mot de passe
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
