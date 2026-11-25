"use client";

import { useActionState } from "react";
import { rotateKeyAction } from "../actions";

export function RotateKey({ id }: { id: string }) {
  const [state, action, pending] = useActionState(rotateKeyAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={(e) => { if (!confirm("Générer une nouvelle clé ? L’ancienne cessera de fonctionner dès que OPS_API_KEY sera mise à jour sur l’instance.")) e.preventDefault(); }}>Régénérer la clé</button>
      {state?.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      {state?.key ? <><p className="text-sm font-medium">Nouvelle clé (affichée une seule fois) :</p><input readOnly aria-label="Nouvelle clé" value={state.key} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" /></> : null}
    </form>
  );
}
