/** Appels sortants vers les instances (santé, usage, suspension). Redirections jamais suivies, délai court, aucune clé journalisée. */
import { z } from "zod";

export interface FetchOpts {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 5000;

/** Contrat exact de `GET /api/ops/usage` : tout champ supplémentaire est écarté. */
export const zUsage = z
  .object({
    version: z.string(),
    generated_at: z.string(),
    suspended: z.boolean(),
    coaches_active: z.number().int().nonnegative(),
    members_active: z.number().int().nonnegative(),
    requests_this_month: z.number().int().nonnegative(),
    requests_overdue: z.number().int().nonnegative(),
    last_activity_at: z.string().nullable(),
  })
  .strip();
export type InstanceUsage = z.infer<typeof zUsage>;

export interface HealthResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
}


/** Les chemins de test peuvent préfixer le chemin de base (ex. /redirect) ; en production `url` est l'origine. */
const join = (url: URL, path: string) => `${url.pathname.replace(/\/$/, "")}${path}`;

/**
 * Réservé aux tests de bout en bout : INSTANCE_CONNECT_OVERRIDES = JSON {"acme.mentora.app": "http://127.0.0.1:3721"}.
 * L'adresse reste validée par `parseInstanceUrl` ; seule la destination réseau change. Ne jamais définir en production.
 */
function connectOrigin(url: URL): string {
  const raw = process.env.INSTANCE_CONNECT_OVERRIDES;
  if (!raw) return url.origin;
  try {
    const target = (JSON.parse(raw) as Record<string, string>)[url.hostname];
    if (!target) return url.origin;
    // Uniquement une destination locale : jamais de clé en clair vers une autre machine, même si la variable est mal posée.
    const t = new URL(target);
    return ["127.0.0.1", "localhost", "[::1]"].includes(t.hostname) ? t.origin : url.origin;
  } catch {
    return url.origin;
  }
}

async function call(url: URL, path: string, init: RequestInit, timeoutMs: number) {
  return fetch(new URL(join(url, path), connectOrigin(url)), { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
}

export async function fetchHealth(url: URL, opts: FetchOpts = {}): Promise<HealthResult> {
  const t0 = Date.now();
  try {
    const res = await call(url, "/api/health", { method: "GET" }, opts.timeoutMs ?? DEFAULT_TIMEOUT);
    return { ok: res.status === 200, status: res.status, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false, status: null, latencyMs: Date.now() - t0 };
  }
}

export async function fetchUsage(url: URL, key: string, opts: FetchOpts = {}): Promise<InstanceUsage | null> {
  try {
    const res = await call(url, "/api/ops/usage", { method: "GET", headers: { authorization: `Bearer ${key}` } }, opts.timeoutMs ?? DEFAULT_TIMEOUT);
    if (res.status !== 200) return null;
    const parsed = zUsage.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function setInstanceSuspension(url: URL, key: string, suspended: boolean, message: string | null, opts: FetchOpts = {}): Promise<boolean> {
  try {
    const res = await call(
      url,
      "/api/ops/suspension",
      { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ suspended, message }) },
      opts.timeoutMs ?? DEFAULT_TIMEOUT,
    );
    return res.status === 200;
  } catch {
    return false;
  }
}
