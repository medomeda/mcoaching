"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { BILLING_PERIODS, CLIENT_STATUSES } from "@/db/schema";
import { loadMasterKey } from "@/lib/secret-box";
import { applyStatus, changePlan, createClient, reactivatedStatus, recordPayment, rotateInstanceKey, setClientStatus, updateNotes } from "@/server/clients";
import { eq } from "drizzle-orm";
import { client as clientTable } from "@/db/schema";
import { decryptSecret } from "@/lib/secret-box";
import { instanceTarget } from "@/lib/instance-url";
import { fetchHealth, fetchUsage, setInstanceSuspension, type HealthResult, type InstanceUsage } from "@/server/instance-client";
import { guard } from "@/server/guard";

export type CreateState = { ok: true; clientId: string; instanceKey: string } | { ok: false; error: string } | null;

const text = (f: FormData, k: string) => (f.get(k) === null ? undefined : String(f.get(k)));

export async function createClientAction(_prev: CreateState, f: FormData): Promise<CreateState> {
  await guard();
  try {
    const r = await createClient(
      {
        name: text(f, "name"), contactName: text(f, "contactName") ?? "", contactEmail: text(f, "contactEmail") ?? "", contactPhone: text(f, "contactPhone"),
        instanceHost: text(f, "instanceHost"), planId: text(f, "planId") || null, billingPeriod: text(f, "billingPeriod") ?? "MONTHLY", prospectId: text(f, "prospectId") || undefined,
      },
      { db, masterKey: loadMasterKey() },
    );
    // La clé n'est renvoyée qu'ici, une seule fois : elle n'est ni redirigée dans l'adresse ni journalisée.
    return { ok: true, clientId: r.client.id, instanceKey: r.instanceKey };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Création impossible." };
  }
}

export async function rotateKeyAction(_prev: { key?: string; error?: string } | null, f: FormData): Promise<{ key?: string; error?: string }> {
  await guard();
  try {
    return { key: await rotateInstanceKey(String(f.get("id")), { db, masterKey: loadMasterKey() }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Échec." };
  }
}

export async function paymentAction(f: FormData) {
  await guard();
  const id = String(f.get("id"));
  try {
    await recordPayment(id, { paidOn: text(f, "paidOn"), amount: text(f, "amount"), method: text(f, "method") ?? "", note: text(f, "note") ?? "" }, db);
  } catch (e) {
    redirect(`/admin/clients/${id}?erreur=${encodeURIComponent(e instanceof Error ? e.message : "Paiement invalide.")}`);
  }
  redirect(`/admin/clients/${id}`);
}

export async function statusAction(f: FormData) {
  await guard();
  const status = String(f.get("status"));
  if (!(CLIENT_STATUSES as readonly string[]).includes(status)) throw new Error("Statut invalide.");
  const id = String(f.get("id"));
  try {
    await setClientStatus(id, status as (typeof CLIENT_STATUSES)[number], db);
  } catch (e) {
    redirect(`/admin/clients/${id}?erreur=${encodeURIComponent(e instanceof Error ? e.message : "Statut invalide.")}`);
  }
  redirect(`/admin/clients/${id}`);
}

export async function planAction(f: FormData) {
  await guard();
  const period = String(f.get("billingPeriod"));
  if (!(BILLING_PERIODS as readonly string[]).includes(period)) throw new Error("Période invalide.");
  const id = String(f.get("id"));
  await changePlan(id, String(f.get("planId")), period as (typeof BILLING_PERIODS)[number], db);
  redirect(`/admin/clients/${id}`);
}

export async function notesAction(f: FormData) {
  await guard();
  const id = String(f.get("id"));
  await updateNotes(id, String(f.get("notes") ?? ""), db);
  redirect(`/admin/clients/${id}`);
}

export type TestState = { health: HealthResult; usage: InstanceUsage | null; error?: undefined } | { error: string } | null;

/** Teste la connexion à l'instance : santé puis compteurs d'usage (la clé reste côté serveur). */
export async function testConnectionAction(_prev: TestState, f: FormData): Promise<TestState> {
  await guard();
  const [c] = await db.select().from(clientTable).where(eq(clientTable.id, String(f.get("id"))));
  if (!c) return { error: "Client introuvable." };
  const url = instanceTarget(c.instanceHost, process.env.INSTANCE_DOMAIN);
  if (!url) return { error: "Adresse d’instance invalide ou INSTANCE_DOMAIN non définie." };
  const health = await fetchHealth(url);
  let usage: InstanceUsage | null = null;
  try {
    if (c.keyEncrypted) usage = await fetchUsage(url, decryptSecret(c.keyEncrypted, loadMasterKey()));
  } catch {
    return { error: "Clé d’instance illisible (MASTER_KEY modifiée ?)." };
  }
  return { health, usage };
}

/** Suspend ou réactive l'instance du client ; le statut n'est modifié que si l'instance a répondu. */
export async function suspensionAction(f: FormData) {
  await guard();
  const id = String(f.get("id"));
  const suspended = f.get("suspended") === "true";
  const [c] = await db.select().from(clientTable).where(eq(clientTable.id, id));
  const url = c ? instanceTarget(c.instanceHost, process.env.INSTANCE_DOMAIN) : null;
  let error: string | null = null;
  if (!c || !url || !c.keyEncrypted) error = "Instance non joignable : adresse ou clé manquante.";
  else {
    try {
      const ok = await setInstanceSuspension(url, decryptSecret(c.keyEncrypted, loadMasterKey()), suspended, String(f.get("message") ?? "").trim() || null);
      if (!ok) error = "L’instance n’a pas confirmé (clé refusée, instance hors ligne ou OPS_API_KEY absente). Le statut n’a pas été modifié.";
    } catch {
      error = "Clé d’instance illisible.";
    }
  }
  if (error) redirect(`/admin/clients/${id}?erreur=${encodeURIComponent(error)}`);
  await applyStatus(id, suspended ? "SUSPENDU" : await reactivatedStatus(id, db), db);
  redirect(`/admin/clients/${id}`);
}
