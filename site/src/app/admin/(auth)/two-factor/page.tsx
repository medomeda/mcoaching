"use client";

import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2";

/** Inscription obligatoire du code temporaire (premier accès) : QR code puis 10 codes de secours affichés une seule fois. */
export default function EnrollTwoFactor() {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password"));
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (err || !data || !("totpURI" in data)) return setError(err?.message ?? "Activation impossible.");
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }));
    setCodes(data.backupCodes);
  }

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get("code")).trim();
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (err) return setError(err.message ?? "Code invalide.");
    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-bold text-brand-900">Activer la double authentification</h1>
      <p className="mt-2 text-sm text-slate-600">Elle est obligatoire pour accéder au tableau de bord.</p>
      {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {!qr ? (
        <form onSubmit={start} className="mt-4 space-y-4">
          <label className="block text-sm font-medium">Confirmez votre mot de passe<input name="password" type="password" required autoComplete="current-password" className={field} /></label>
          <button disabled={busy} className="w-full rounded-lg bg-brand-900 px-4 py-2 font-semibold text-white disabled:opacity-60">Générer le QR code</button>
        </form>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm">1. Scannez ce QR code avec votre application d’authentification.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code à scanner avec l’application d’authentification" width={220} height={220} />
          <div>
            <p className="text-sm font-medium">2. Notez ces 10 codes de secours (affichés une seule fois) :</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">{codes?.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          <form onSubmit={confirm} className="space-y-3">
            <label className="block text-sm font-medium">3. Saisissez le code à 6 chiffres affiché<input name="code" required inputMode="numeric" autoComplete="one-time-code" className={field} /></label>
            <button disabled={busy} className="w-full rounded-lg bg-brand-900 px-4 py-2 font-semibold text-white disabled:opacity-60">Activer</button>
          </form>
        </div>
      )}
    </div>
  );
}
