/** Nom de la plateforme pour les contextes sans session (titre de page, e-mails), avec un court cache. */
import { eq } from "drizzle-orm";
import { DEFAULT_BRAND_NAME } from "@/modules/core/branding";
import { db } from "../pg/client";
import { appSettings } from "../pg/schema";

const TTL_MS = 30_000;
const g = globalThis as unknown as { mentoraBrand?: { name: string; at: number } };

export async function getBrandName(): Promise<string> {
  const cached = g.mentoraBrand;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.name;
  try {
    const [s] = await db.select({ name: appSettings.brandName }).from(appSettings).where(eq(appSettings.id, "app"));
    const name = s?.name || DEFAULT_BRAND_NAME;
    g.mentoraBrand = { name, at: Date.now() };
    return name;
  } catch {
    return cached?.name ?? DEFAULT_BRAND_NAME;
  }
}

export function resetBrandCache() {
  g.mentoraBrand = undefined;
}
