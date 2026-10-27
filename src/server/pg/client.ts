import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

function createPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL est manquante (voir .env.example).");
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

// Une seule réserve de connexions, y compris lors du rechargement à chaud en développement.
const pool = (globalForPg.pgPool ??= createPool());
if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });
export type Db = typeof db;
export { pool, schema };
