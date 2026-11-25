import type { PoolConfig } from "pg";

/** Option SSL selon DATABASE_SSL : `disable` | `require` | `no-verify` ; vide = l'URL décide. */
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
