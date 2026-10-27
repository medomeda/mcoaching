"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, Loading } from "@/components/ui/display";
import { Field, FormError, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";

/** Définition (activation) ou réinitialisation du mot de passe par jeton à usage unique. */
export function SetPasswordForm({ purpose }: { purpose: "ACTIVATION" | "PASSWORD_RESET" }) {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const info = useQuery({ queryKey: ["token", purpose, token], queryFn: () => api.auth.inspectToken({ token, purpose }), enabled: token.length > 10, retry: false });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (password !== confirm) {
      setFieldErrors({ confirm: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    setBusy(true);
    try {
      await api.auth.completeToken({ token, purpose, password });
      router.replace("/login?reset=1");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors ?? {});
      }
    } finally {
      setBusy(false);
    }
  };

  const title = purpose === "ACTIVATION" ? "Activer mon compte" : "Nouveau mot de passe";
  return (
    <Card>
      <CardBody className="space-y-5 p-6 sm:p-7">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {!token || token.length <= 10 ? (
          <Alert tone="danger">Lien incomplet. Utilisez le lien reçu par e-mail.</Alert>
        ) : info.isLoading ? (
          <Loading />
        ) : info.error ? (
          <Alert tone="danger" title="Lien invalide">
            {(info.error as Error).message}{" "}
            <Link href="/forgot-password" className="font-medium underline">
              Demander un nouveau lien
            </Link>
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <p className="text-sm text-slate-600">
              Compte : <strong>{info.data?.full_name}</strong> ({info.data?.email})
            </p>
            <Field label="Mot de passe" required hint="10 caractères minimum, avec au moins une lettre et un chiffre." error={fieldErrors.password}>
              {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            <Field label="Confirmation" required error={fieldErrors.confirm}>
              {(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
            </Field>
            <FormError message={error && !Object.keys(fieldErrors).length ? error : null} />
            <Button type="submit" className="w-full" loading={busy}>
              {purpose === "ACTIVATION" ? "Activer mon compte" : "Enregistrer le mot de passe"}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
