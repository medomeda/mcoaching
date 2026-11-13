import type { PoolConfig } from "pg";

/**
 * Option SSL de la connexion PostgreSQL, selon DATABASE_SSL :
 * `disable` | `require` (SSL, certificat vérifié) | `no-verify` (SSL, certificat auto-signé accepté).
 * Non définie ou vide : rien n'est imposé, l'URL (`?sslmode=…`) reste seule juge.
 */
export function pgSsl(value = process.env.DATABASE_SSL): PoolConfig["ssl"] {
  switch ((value ?? "").trim().toLowerCase()) {
    case "require":
      return true;
    case "no-verify":
      return { rejectUnauthorized: false };
    case "":
      return undefined;
    case "disable":
      return false;
    default:
      throw new Error(`DATABASE_SSL invalide (« ${value} ») : disable, require ou no-verify.`);
  }
}
