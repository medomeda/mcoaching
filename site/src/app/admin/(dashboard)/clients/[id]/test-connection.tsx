"use client";

import { useActionState } from "react";
import { testConnectionAction, type TestState } from "../actions";

export function TestConnection({ id }: { id: string }) {
  const [state, action, pending] = useActionState<TestState, FormData>(testConnectionAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">{pending ? "Test…" : "Tester la connexion"}</button>
      {state && "error" in state && state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      {state && "health" in state ? (
        <ul className="text-sm" role="status">
          <li>Santé : {state.health.ok ? "en ligne" : `hors ligne${state.health.status ? ` (HTTP ${state.health.status})` : ""}`} · {state.health.latencyMs} ms</li>
          <li>{state.usage ? `Version ${state.usage.version} · ${state.usage.coaches_active} coachs · ${state.usage.members_active} membres actifs · ${state.usage.requests_this_month} demandes ce mois · ${state.usage.requests_overdue} en retard${state.usage.suspended ? " · SUSPENDUE" : ""}` : "Compteurs indisponibles (clé refusée ou instance sans OPS_API_KEY)."}</li>
        </ul>
      ) : null}
    </form>
  );
}
