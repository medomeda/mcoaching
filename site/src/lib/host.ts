export type HostKind = "public" | "admin" | "unknown";

export interface HostEnv {
  siteUrl: string;
  adminHost: string;
}

/** Normalise un nom d'hôte : minuscules, sans point final. Le port est conservé à part. */
function split(raw: string): { name: string; port: string } {
  const v = raw.trim().toLowerCase();
  const m = /^(.*?)(?::(\d+))?$/.exec(v);
  return { name: (m?.[1] ?? v).replace(/\.+$/, ""), port: m?.[2] ?? "" };
}

function hostOfUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Classe l'en-tête `Host` : public (SITE_URL), administration (ADMIN_HOST) ou inconnu. Le port n'est comparé que s'il est donné dans la configuration. */
export function classifyHost(rawHost: string | null, env: HostEnv): HostKind {
  if (!rawHost) return "unknown";
  const h = split(rawHost);
  const matches = (configured: string) => {
    const c = split(configured);
    if (!c.name) return false;
    return h.name === c.name && (c.port === "" || h.port === "" || h.port === c.port);
  };
  if (matches(env.adminHost)) return "admin";
  if (matches(hostOfUrl(env.siteUrl))) return "public";
  return "unknown";
}

const ADMIN_PATHS = ["/admin", "/api/admin"];
const COMMON_PATHS = ["/_next", "/api/health"];

const startsWithPath = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Règle d'accès par hôte : l'hôte public ne sert jamais l'administration et inversement. */
export function decide(kind: HostKind, pathname: string): "next" | "notfound" {
  if (kind === "unknown") return "notfound";
  if (COMMON_PATHS.some((p) => startsWithPath(pathname, p))) return "next";
  const isAdminPath = ADMIN_PATHS.some((p) => startsWithPath(pathname, p));
  if (kind === "public") return isAdminPath ? "notfound" : "next";
  return isAdminPath ? "next" : "notfound";
}
