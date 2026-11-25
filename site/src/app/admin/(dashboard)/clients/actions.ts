"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { BILLING_PERIODS, CLIENT_STATUSES } from "@/db/schema";
import { loadMasterKey } from "@/lib/secret-box";
import { changePlan, createClient, recordPayment, rotateInstanceKey, setClientStatus, updateNotes } from "@/server/clients";
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
  await setClientStatus(id, status as (typeof CLIENT_STATUSES)[number], db);
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
