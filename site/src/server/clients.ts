import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { SiteDb } from "@/db/client";
import { BILLING_PERIODS, CLIENT_STATUSES, client, payment, plan, prospect, type Client } from "@/db/schema";
import { fromDay, nextDueDate, toDay } from "@/lib/billing";
import { encryptSecret, generateInstanceKey } from "@/lib/secret-box";
import { audit } from "./audit";

export interface ClientDeps {
  db: SiteDb;
  masterKey: Buffer;
  now?: Date;
}

/** Sous-domaine d'instance : une étiquette DNS en minuscules (acme → acme.<INSTANCE_DOMAIN>). */
export const instanceLabel = z.string().regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/, "Sous-domaine invalide (lettres minuscules, chiffres et tirets).");

export const zClientInput = z.object({
  name: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(120).default(""),
  contactEmail: z.string().trim().max(200).default(""),
  contactPhone: z.string().trim().max(40).nullish().transform((v) => v || null),
  instanceHost: instanceLabel,
  planId: z.string().uuid().nullish().transform((v) => v ?? null),
  billingPeriod: z.enum(BILLING_PERIODS).default("MONTHLY"),
  notes: z.string().max(5000).default(""),
  prospectId: z.string().uuid().optional(),
});

const zPayment = z.object({
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)."),
  amount: z.coerce.number().int().positive("Le montant doit être positif."),
  method: z.string().trim().max(60).default(""),
  note: z.string().trim().max(500).default(""),
});

/** Crée le client et sa clé d'instance (renvoyée une seule fois, stockée chiffrée). */
export async function createClient(input: unknown, deps: ClientDeps): Promise<{ client: Client; instanceKey: string }> {
  const { prospectId, ...data } = zClientInput.parse(input);
  const now = deps.now ?? new Date();
  const instanceKey = generateInstanceKey();
  const created = await deps.db.transaction(async (tx) => {
    if (prospectId) {
      const [p] = await tx.select().from(prospect).where(eq(prospect.id, prospectId));
      if (!p) throw new Error("Prospect introuvable.");
      if (p.status === "CONVERTI") throw new Error("Ce prospect est déjà converti en client.");
    }
    let trialEndsOn: string | null = null;
    if (data.planId) {
      const [p] = await tx.select().from(plan).where(eq(plan.id, data.planId));
      if (!p) throw new Error("Formule introuvable.");
      trialEndsOn = toDay(new Date(now.getTime() + p.trialDays * 86_400_000));
    }
    const [row] = await tx
      .insert(client)
      .values({ ...data, status: "ESSAI", trialEndsOn, keyEncrypted: encryptSecret(instanceKey, deps.masterKey) })
      .returning();
    if (prospectId) await tx.update(prospect).set({ status: "CONVERTI", clientId: row!.id, updatedAt: new Date() }).where(eq(prospect.id, prospectId));
    return row!;
  });
  await audit("CLIENT_CREATED", created.instanceHost ?? created.id, deps.db);
  return { client: created, instanceKey };
}

/** Fiche client sans secret : seule la présence d'une clé est indiquée. */
export async function getClientView(id: string, db: SiteDb) {
  const [row] = await db.select().from(client).where(eq(client.id, id));
  if (!row) return null;
  const { keyEncrypted, ...rest } = row;
  return { ...rest, hasKey: !!keyEncrypted };
}

export async function listClients(db: SiteDb) {
  const rows = await db.select().from(client).orderBy(desc(client.createdAt));
  return rows.map(({ keyEncrypted, ...rest }) => ({ ...rest, hasKey: !!keyEncrypted }));
}

export async function recordPayment(clientId: string, input: unknown, db: SiteDb): Promise<Client> {
  const p = zPayment.parse(input);
  const [c] = await db.select().from(client).where(eq(client.id, clientId));
  if (!c) throw new Error("Client introuvable.");
  const period = c.billingPeriod;
  const due = nextDueDate(c.nextDueOn ? fromDay(c.nextDueOn) : null, fromDay(p.paidOn), period);
  const periodStart = c.nextDueOn && c.nextDueOn > p.paidOn ? c.nextDueOn : p.paidOn;
  await db.insert(payment).values({ clientId, paidOn: p.paidOn, amount: p.amount, method: p.method, note: p.note, periodStart, periodEnd: toDay(due) });
  const [updated] = await db.update(client).set({ nextDueOn: toDay(due), updatedAt: new Date() }).where(eq(client.id, clientId)).returning();
  await audit("PAYMENT_RECORDED", c.instanceHost ?? clientId, db);
  return updated!;
}

export async function setClientStatus(id: string, status: (typeof CLIENT_STATUSES)[number], db: SiteDb): Promise<void> {
  if (!CLIENT_STATUSES.includes(status)) throw new Error("Statut invalide.");
  const [row] = await db.update(client).set({ status, updatedAt: new Date() }).where(eq(client.id, id)).returning();
  if (!row) throw new Error("Client introuvable.");
  await audit("CLIENT_STATUS", `${row.instanceHost ?? id}:${status}`, db);
}

export async function changePlan(id: string, planId: string, period: (typeof BILLING_PERIODS)[number], db: SiteDb): Promise<void> {
  const [row] = await db.update(client).set({ planId, billingPeriod: period, updatedAt: new Date() }).where(eq(client.id, id)).returning();
  if (!row) throw new Error("Client introuvable.");
  await audit("CLIENT_PLAN", `${row.instanceHost ?? id}`, db);
}

export async function updateNotes(id: string, notes: string, db: SiteDb): Promise<void> {
  await db.update(client).set({ notes: notes.slice(0, 5000), updatedAt: new Date() }).where(eq(client.id, id));
}

/** Nouvelle clé d'instance (l'ancienne cesse de fonctionner une fois `OPS_API_KEY` mise à jour côté instance). */
export async function rotateInstanceKey(id: string, deps: ClientDeps): Promise<string> {
  const key = generateInstanceKey();
  const [row] = await deps.db.update(client).set({ keyEncrypted: encryptSecret(key, deps.masterKey), updatedAt: new Date() }).where(eq(client.id, id)).returning();
  if (!row) throw new Error("Client introuvable.");
  await audit("CLIENT_KEY_ROTATED", row.instanceHost ?? id, deps.db);
  return key;
}

