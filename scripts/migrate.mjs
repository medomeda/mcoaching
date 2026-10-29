/**
 * Applique les migrations Drizzle (dossier drizzle/) sur DATABASE_URL.
 * Lancé par docker-entrypoint.sh au démarrage du conteneur (ou à la main : `node scripts/migrate.mjs`) ; sans danger à relancer.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL est manquante.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder: process.env.MIGRATIONS_DIR || "./drizzle" });
  console.log("Migrations appliquées.");
} finally {
  await pool.end();
}
