"use client";

import { useActionState } from "react";
import { submitTrial } from "./actions";
import type { TrialResult } from "@/lib/trial";

const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-brand-500";

function Field({ name, label, error, children }: { name: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium text-slate-800">{label}</label>
      {children}
      {error ? <p id={`${name}-error`} role="alert" className="mt-1 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

export function TrialForm() {
  const [state, action, pending] = useActionState<TrialResult | null, FormData>(submitTrial, null);

  if (state?.ok) {
    return (
      <div role="status" className="rounded-xl border border-gold-500 bg-gold-100 p-6 text-brand-900">
        <p className="text-lg font-semibold">Merci, votre demande est bien reçue.</p>
        <p className="mt-2">Nous vous contactons très vite pour mettre en place votre essai gratuit.</p>
      </div>
    );
  }
  const e = state && !state.ok ? state.fieldErrors : {};
  const v = (state && !state.ok ? state.values : undefined) ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {e._form ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{e._form}</p> : null}
      <Field name="name" label="Nom et prénom" error={e.name}><input id="name" name="name" defaultValue={v.name} required autoComplete="name" aria-describedby={e.name ? "name-error" : undefined} className={input} /></Field>
      <Field name="email" label="Adresse e-mail" error={e.email}><input id="email" name="email" defaultValue={v.email} type="email" required autoComplete="email" aria-describedby={e.email ? "email-error" : undefined} className={input} /></Field>
      <Field name="phone" label="Téléphone (facultatif)" error={e.phone}><input id="phone" name="phone" defaultValue={v.phone} type="tel" autoComplete="tel" className={input} /></Field>
      <Field name="activity" label="Votre activité ou domaine" error={e.activity}><input id="activity" name="activity" defaultValue={v.activity} placeholder="Ex. : coaching de carrière, formation en gestion…" className={input} /></Field>
      <Field name="message" label="Message (facultatif)" error={e.message}><textarea id="message" name="message" defaultValue={v.message} rows={4} className={input} /></Field>
      {/* Champ piège : invisible pour les personnes, rempli par les robots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Ne pas remplir</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="consent" className="mt-1" aria-describedby={e.consent ? "consent-error" : undefined} />
          <span>J’accepte que mes informations soient utilisées pour répondre à ma demande (voir la politique de confidentialité).</span>
        </label>
        {e.consent ? <p id="consent-error" role="alert" className="mt-1 text-sm text-red-700">{e.consent}</p> : null}
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-900 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
        {pending ? "Envoi…" : "Demander mon essai gratuit"}
      </button>
    </form>
  );
}
