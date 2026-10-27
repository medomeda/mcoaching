"use client";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, Loading } from "@/components/ui/display";
import { Field, FormError, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";

/** Création du premier administrateur sur une base vide (PRD §19.3). */
export default function SetupPage() {
  const router = useRouter();
  const sys = useQuery({ queryKey: ["system-status"], queryFn: () => api.auth.systemStatus() });
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setError(null);
    if (form.password !== form.confirm) return setErrors({ confirm: "Les mots de passe ne correspondent pas." });
    setBusy(true);
    try {
      await api.auth.bootstrapAdmin({ full_name: form.full_name, email: form.email, password: form.password });
      router.replace("/login?reset=1");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors(err.fieldErrors ?? {});
      }
    } finally {
      setBusy(false);
    }
  };

  if (sys.isLoading) return <Loading />;
  return (
    <Card>
      <CardBody className="space-y-5 p-6 sm:p-7">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-700" />
          <h1 className="text-xl font-semibold text-slate-900">Premier administrateur</h1>
        </div>
        {sys.data?.hasUsers ? (
          <Alert tone="warning">
            La plateforme est déjà initialisée.{" "}
            <Link href="/login" className="font-medium underline">
              Se connecter
            </Link>
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <p className="text-sm text-slate-500">Ce compte pourra ensuite créer les coachs et les apprenants.</p>
            <Field label="Nom complet" required error={errors.full_name}>
              {(p) => <Input {...p} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />}
            </Field>
            <Field label="Adresse e-mail" required error={errors.email}>
              {(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
            </Field>
            <Field label="Mot de passe" required hint="10 caractères minimum, une lettre et un chiffre." error={errors.password}>
              {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
            </Field>
            <Field label="Confirmation" required error={errors.confirm}>
              {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}
            </Field>
            <FormError message={error && !Object.keys(errors).length ? error : null} />
            <Button type="submit" className="w-full" loading={busy}>
              Créer le compte administrateur
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
