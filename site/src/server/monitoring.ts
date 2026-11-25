/** Supervision : santé toutes les 5 min (purge à 30 j), usage une fois par jour (400 j), seulement vers des adresses validées. */
import { and, eq, inArray, lt, ne } from "drizzle-orm";
import type { SiteDb } from "@/db/client";
import { client, healthCheck, usageSnapshot } from "@/db/schema";
import { toDay } from "@/lib/billing";
import { instanceTarget } from "@/lib/instance-url";
import { decryptSecret, loadMasterKey } from "@/lib/secret-box";
import { fetchHealth, fetchUsage, type HealthResult, type InstanceUsage } from "./instance-client";

export interface Fetchers {
  health: (url: URL) => Promise<HealthResult>;
  usage: (url: URL, key: string) => Promise<InstanceUsage | null>;
}

export interface MonitoringDeps {
  db: SiteDb;
  masterKey: Buffer;
  instanceDomain: string;
  fetchers?: Fetchers;
}

const real: Fetchers = { health: (u) => fetchHealth(u), usage: (u, k) => fetchUsage(u, k) };
const DAY = 86_400_000;
export const HEALTH_RETENTION_DAYS = 30;
export const USAGE_RETENTION_DAYS = 400;

export async function runHealthChecks(now: Date, deps: MonitoringDeps): Promise<void> {
  const f = deps.fetchers ?? real;
  const clients = await deps.db.select().from(client).where(ne(client.status, "RESILIE"));
  await Promise.all(
    clients.map(async (c) => {
      const url = instanceTarget(c.instanceHost, deps.instanceDomain);
      if (!url) return;
      const r = await f.health(url);
      await deps.db.insert(healthCheck).values({ clientId: c.id, checkedAt: now, ok: r.ok, latencyMs: r.latencyMs, httpStatus: r.status });
    }),
  );
  await deps.db.delete(healthCheck).where(lt(healthCheck.checkedAt, new Date(now.getTime() - HEALTH_RETENTION_DAYS * DAY)));
}

export async function runUsageSnapshots(now: Date, deps: MonitoringDeps): Promise<void> {
  const f = deps.fetchers ?? real;
  const day = toDay(now);
  const clients = await deps.db.select().from(client).where(ne(client.status, "RESILIE"));
  const done = new Set(
    (await deps.db.select({ id: usageSnapshot.clientId }).from(usageSnapshot).where(and(eq(usageSnapshot.day, day), inArray(usageSnapshot.clientId, clients.map((c) => c.id).concat("00000000-0000-0000-0000-000000000000"))))).map((r) => r.id),
  );
  for (const c of clients) {
    if (done.has(c.id) || !c.keyEncrypted) continue;
    const url = instanceTarget(c.instanceHost, deps.instanceDomain);
    if (!url) continue;
    try {
      const usage = await f.usage(url, decryptSecret(c.keyEncrypted, deps.masterKey));
      if (usage) await deps.db.insert(usageSnapshot).values({ clientId: c.id, day, counters: { ...usage } }).onConflictDoNothing();
    } catch {
      // Clé illisible : on passe au client suivant (le message d'erreur pourrait contenir un secret : rien n'est journalisé).
    }
  }
  await deps.db.delete(usageSnapshot).where(lt(usageSnapshot.day, toDay(new Date(now.getTime() - USAGE_RETENTION_DAYS * DAY))));
}

const g = globalThis as unknown as { siteMonitoring?: ReturnType<typeof setInterval> };
const INTERVAL_MS = 5 * 60_000;

/** Lance la supervision (une seule instance de `site/`). Sans effet si MONITORING=off. */
export async function startMonitoring(): Promise<void> {
  if (g.siteMonitoring || process.env.MONITORING === "off") return;
  const { db } = await import("@/db/client");
  const domain = process.env.INSTANCE_DOMAIN;
  if (!domain) {
    console.warn("[monitoring] INSTANCE_DOMAIN absente : supervision désactivée.");
    return;
  }
  let masterKey: Buffer;
  try {
    masterKey = loadMasterKey();
  } catch (e) {
    console.warn(`[monitoring] ${e instanceof Error ? e.message : "MASTER_KEY invalide"} : supervision désactivée.`);
    return;
  }
  const deps: MonitoringDeps = { db, masterKey, instanceDomain: domain };
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      await runHealthChecks(now, deps);
      await runUsageSnapshots(now, deps);
    } catch (e) {
      console.error("[monitoring]", e instanceof Error ? e.message : "erreur");
    } finally {
      running = false;
    }
  };
  g.siteMonitoring = setInterval(() => void tick(), INTERVAL_MS);
  g.siteMonitoring.unref?.();
  void tick();
}
