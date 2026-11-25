import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import type { SiteDb } from "@/db/client";
import { plan, type Plan } from "@/db/schema";
import { PLANS_TAG } from "@/lib/plans";
import { audit } from "./audit";

export interface PlanDeps {
  db: SiteDb;
  /** Invalide la page Tarifs ; remplaçable dans les tests. */
  revalidate: () => void;
}

export const defaultDeps = (db: SiteDb): PlanDeps => ({ db, revalidate: () => revalidateTag(PLANS_TAG) });

/** Champ numérique facultatif : vide → null, sinon entier positif. */
const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int().min(min).max(max).nullable());

export const zPlanInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).default(""),
  monthlyPrice: optionalInt(0, 100_000_000),
  annualPrice: optionalInt(0, 1_000_000_000),
  annualDiscountPercent: z.coerce.number().int().min(0).max(100).default(0),
  maxCoaches: optionalInt(1, 100_000),
  maxMembers: optionalInt(1, 1_000_000),
  trialDays: z.coerce.number().int().min(0).max(365).default(30),
  features: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  highlighted: z.boolean().default(false),
  published: z.boolean().default(false),
});

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "formule";

async function uniqueSlug(db: SiteDb, name: string, exceptId?: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await db.select({ id: plan.id }).from(plan).where(exceptId ? and(eq(plan.slug, candidate), ne(plan.id, exceptId)) : eq(plan.slug, candidate));
    if (clash.length === 0) return candidate;
  }
}

/** Crée ou met à jour une formule ; invalide la page Tarifs et journalise. */
export async function savePlan(input: unknown, deps: PlanDeps): Promise<Plan> {
  const { id, ...data } = zPlanInput.parse(input);
  let saved: Plan;
  if (id) {
    const [row] = await deps.db.update(plan).set({ ...data, updatedAt: new Date() }).where(eq(plan.id, id)).returning();
    if (!row) throw new Error("Formule introuvable.");
    saved = row;
  } else {
    const all = await deps.db.select({ position: plan.position }).from(plan);
    const position = all.reduce((m, r) => Math.max(m, r.position), 0) + 1;
    const [row] = await deps.db.insert(plan).values({ ...data, slug: await uniqueSlug(deps.db, data.name), position }).returning();
    saved = row!;
  }
  await audit("PLAN_SAVED", saved.slug, deps.db);
  deps.revalidate();
  return saved;
}

export async function setPublished(id: string, published: boolean, deps: PlanDeps): Promise<void> {
  const [row] = await deps.db.update(plan).set({ published, updatedAt: new Date() }).where(eq(plan.id, id)).returning();
  if (!row) throw new Error("Formule introuvable.");
  await audit("PLAN_PUBLISHED", `${row.slug}:${published ? "publiée" : "dépubliée"}`, deps.db);
  deps.revalidate();
}

export async function reorderPlans(ids: string[], deps: PlanDeps): Promise<void> {
  for (const [i, id] of ids.entries()) await deps.db.update(plan).set({ position: i + 1 }).where(eq(plan.id, id));
  await audit("PLAN_REORDERED", undefined, deps.db);
  deps.revalidate();
}

/** Convertit un formulaire HTML en entrée de `savePlan` (cases à cocher, avantages = une ligne chacun). */
export function planFromForm(f: FormData): Record<string, unknown> {
  const get = (k: string) => (f.get(k) === null ? undefined : String(f.get(k)));
  return {
    id: get("id") || undefined,
    name: get("name"),
    description: get("description") ?? "",
    monthlyPrice: get("monthlyPrice") ?? "",
    annualPrice: get("annualPrice") ?? "",
    annualDiscountPercent: get("annualDiscountPercent") || 0,
    maxCoaches: get("maxCoaches") ?? "",
    maxMembers: get("maxMembers") ?? "",
    trialDays: get("trialDays") || 30,
    features: (get("features") ?? "").split("\n").map((l) => l.trim()).filter(Boolean),
    highlighted: f.get("highlighted") === "on",
    published: f.get("published") === "on",
  };
}
