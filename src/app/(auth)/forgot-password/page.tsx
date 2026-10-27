"use client";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody } from "@/components/ui/display";
import { Field, FormError, Input } from "@/components/ui/form";
import { api, ApiError, DEMO_MODE } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.auth.requestPasswordReset({ email });
      setSent(r.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardBody className="space-y-5 p-6 sm:p-7">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Mot de passe oublié</h1>
          <p className="mt-1 text-sm text-slate-500">Saisissez votre adresse e-mail : si un compte actif y correspond, vous recevrez un lien de réinitialisation valable 1 heure.</p>
        </div>
        {sent ? (
          <Alert tone="success" icon={<MailCheck className="h-4 w-4" />}>
            {sent}
            {DEMO_MODE && <span className="mt-1 block text-xs">Démo : consultez la « Boîte mail » dans les outils de démonstration (bouton en bas à gauche).</span>}
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Adresse e-mail" required>
              {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <FormError message={error} />
            <Button type="submit" className="w-full" loading={busy}>
              Envoyer le lien
            </Button>
          </form>
        )}
        <p className="text-center text-sm">
          <Link href="/login" className="text-brand-700 hover:underline">
            Retour à la connexion
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
