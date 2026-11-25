import { desc, eq } from "drizzle-orm";
import type { SiteDb } from "@/db/client";
import { prospect, PROSPECT_STATUSES } from "@/db/schema";
import { audit } from "./audit";

type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export async function listProspects(db: SiteDb, status?: ProspectStatus) {
  const q = db.select().from(prospect).orderBy(desc(prospect.updatedAt));
  return status ? q.where(eq(prospect.status, status)) : q;
}

/** Change le statut (CONVERTI est réservé à la création du client à partir du prospect). */
export async function setProspectStatus(id: string, status: ProspectStatus, db: SiteDb): Promise<void> {
  if (status === "CONVERTI") throw new Error("Le statut « Converti » s’obtient par la conversion en client.");
  const [p] = await db.select().from(prospect).where(eq(prospect.id, id));
  if (!p) throw new Error("Prospect introuvable.");
  if (p.status === "CONVERTI") throw new Error("Ce prospect est déjà converti en client.");
  await db.update(prospect).set({ status, updatedAt: new Date() }).where(eq(prospect.id, id));
  await audit("PROSPECT_STATUS", `${id}:${status}`, db);
}

export interface ClientDraft {
  prospectId: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
}

/** Préremplissage de la fiche client : coordonnées seulement (le message du prospect n'est pas repris). */
export async function prospectToClientDraft(id: string, db: SiteDb): Promise<ClientDraft> {
  const [p] = await db.select().from(prospect).where(eq(prospect.id, id));
  if (!p) throw new Error("Prospect introuvable.");
  if (p.status === "CONVERTI") throw new Error("Ce prospect est déjà converti en client.");
  return { prospectId: p.id, name: p.name, contactName: p.name, contactEmail: p.email, contactPhone: p.phone };
}
