"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2";

export default function OperatorLogin() {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "code">("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState(false);

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const { data, error: err } = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
    setBusy(false);
    if (err) return setError(err.message ?? "Identifiants invalides.");
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return setStep("code");
    router.replace("/admin");
    router.refresh();
  }

  async function onCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get("code")).trim();
    const { error: err } = backup ? await authClient.twoFactor.verifyBackupCode({ code }) : await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (err) return setError(err.message ?? "Code invalide.");
    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-bold text-brand-900">Espace opérateur Mentora</h1>
      {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {step === "password" ? (
        <form onSubmit={onPassword} className="mt-4 space-y-4">
          <label className="block text-sm font-medium">Adresse e-mail<input name="email" type="email" required autoComplete="username" className={field} /></label>
          <label className="block text-sm font-medium">Mot de passe<input name="password" type="password" required autoComplete="current-password" className={field} /></label>
          <button disabled={busy} className="w-full rounded-lg bg-brand-900 px-4 py-2 font-semibold text-white disabled:opacity-60">Continuer</button>
        </form>
      ) : (
        <form onSubmit={onCode} className="mt-4 space-y-4">
          <label className="block text-sm font-medium">{backup ? "Code de secours" : "Code à 6 chiffres de votre application"}<input name="code" required inputMode={backup ? "text" : "numeric"} autoComplete="one-time-code" className={field} /></label>
          <button disabled={busy} className="w-full rounded-lg bg-brand-900 px-4 py-2 font-semibold text-white disabled:opacity-60">Se connecter</button>
          <button type="button" onClick={() => setBackup(!backup)} className="text-sm text-brand-700 underline">{backup ? "Utiliser le code de mon application" : "Utiliser un code de secours"}</button>
        </form>
      )}
    </div>
  );
}
