/**
 * Applique les migrations Drizzle (dossier drizzle/) sur DATABASE_URL.
 * Utilisé par le service « migrate » de docker-compose ; sans danger à relancer (idempotent).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL est manquante.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrations appliquées.");
} finally {
  await pool.end();
}
