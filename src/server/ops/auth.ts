/** Authentification des points d'accès `ops` (tableau de bord de l'opérateur) : clé unique par instance. */
import { createHash, timingSafeEqual } from "node:crypto";

export const opsConfigured = (): boolean => !!process.env.OPS_API_KEY?.trim();

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Compare l'en-tête `Authorization: Bearer <clé>` à OPS_API_KEY en temps constant. */
export function checkOpsKey(header: string | null): boolean {
  const expected = process.env.OPS_API_KEY?.trim();
  if (!expected) return false;
  const m = /^Bearer (.+)$/.exec(header ?? "");
  if (!m) return false;
  return timingSafeEqual(digest(m[1]!), digest(expected));
}

/** Limiteur simple en mémoire : 60 requêtes par minute et par adresse. */
const hits = new Map<string, number[]>();
export function opsRateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 1000) for (const [k, v] of hits) if (v.every((t) => now - t >= 60_000)) hits.delete(k);
  return recent.length > 60;
}
