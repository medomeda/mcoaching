import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pgSsl } from "./ssl";
import * as schema from "./schema";

const g = globalThis as unknown as { sitePool?: Pool };

function createPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL est manquante (voir .env.example).");
  return new Pool({ connectionString: process.env.DATABASE_URL, ssl: pgSsl() });
}

/** Connexion paresseuse : la compilation (pages statiques) n'a besoin d'aucune base. */
function pool() {
  g.sitePool ??= createPool();
  return g.sitePool;
}

let cached: ReturnType<typeof make> | undefined;
function make() {
  return drizzle(pool(), { schema, casing: "snake_case" });
}

export type SiteDb = ReturnType<typeof make>;

export const db: SiteDb = new Proxy({} as SiteDb, {
  get(_t, prop) {
    cached ??= make();
    return Reflect.get(cached, prop);
  },
});
export { schema };
