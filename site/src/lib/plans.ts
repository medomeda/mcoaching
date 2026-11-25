/** Formules publiques : lues en base, jamais en dur. Les montants sont en FCFA entiers. */
import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db/client";
import { plan, type Plan } from "@/db/schema";

export interface PublicPlan {
  id: string;
  slug: string;
  name: string;
  description: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  annualDiscountPercent: number;
  maxCoaches: number | null;
  maxMembers: number | null;
  trialDays: number;
  features: string[];
  highlighted: boolean;
}

export const PLANS_TAG = "plans";

const toPublic = (p: Plan): PublicPlan => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  description: p.description,
  monthlyPrice: p.monthlyPrice,
  annualPrice: p.annualPrice,
  annualDiscountPercent: p.annualDiscountPercent,
  maxCoaches: p.maxCoaches,
  maxMembers: p.maxMembers,
  trialDays: p.trialDays,
  features: p.features,
  highlighted: p.highlighted,
});

/** Requête brute (testable avec une base jetable). */
export async function queryPublishedPlans(d: Pick<typeof db, "select">): Promise<PublicPlan[]> {
  const rows = await d.select().from(plan).where(eq(plan.published, true)).orderBy(asc(plan.position), asc(plan.name));
  return rows.map(toPublic);
}

/** Version en cache, invalidée par `revalidateTag("plans")` à chaque modification d'une formule. */
export const listPublishedPlans = unstable_cache(() => queryPublishedPlans(db), ["published-plans"], { tags: [PLANS_TAG], revalidate: false });

export function formatFcfa(n: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(n).replace(/ /g, " ")} FCFA`;
}

export function limitLabel(n: number | null, noun: string): string {
  if (n === null) return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} illimités`;
  return `${n} ${noun}`;
}

/** Prix annuel : valeur saisie, sinon mensuel × 12 moins la remise, sinon null. */
export function annualPriceOf(p: Pick<PublicPlan, "monthlyPrice" | "annualPrice" | "annualDiscountPercent">): number | null {
  if (p.annualPrice !== null) return p.annualPrice;
  if (p.monthlyPrice === null) return null;
  return Math.round(p.monthlyPrice * 12 * (1 - p.annualDiscountPercent / 100));
}
