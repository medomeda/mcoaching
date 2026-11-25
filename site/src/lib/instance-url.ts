/**
 * Validation des adresses d'instances (anti-SSRF) : seules `https://<étiquette>.<INSTANCE_DOMAIN>` sont acceptées —
 * un seul niveau de sous-domaine, ni identifiants, ni port, ni chemin, ni adresse IP, ni point final.
 */
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function parseInstanceUrl(input: string, instanceDomain: string): URL | null {
  const domain = instanceDomain.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!domain || !input) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  const host = url.hostname;
  if (!host.endsWith(`.${domain}`)) return null;
  const label = host.slice(0, -(domain.length + 1));
  if (!LABEL.test(label) || label.startsWith("xn--")) return null;
  return url;
}

/** Adresse sûre d'une instance à partir de son sous-domaine, ou null. */
export function instanceTarget(label: string | null | undefined, instanceDomain: string | undefined): URL | null {
  if (!label || !instanceDomain) return null;
  return parseInstanceUrl(`https://${label}.${instanceDomain}`, instanceDomain);
}
