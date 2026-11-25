import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Recrée la base d'essai et applique les migrations ; en fin de run la base est supprimée. */
export default async function globalSetup() {
  try {
    process.loadEnvFile(new URL("../.env.local", import.meta.url));
  } catch {
    /* absent */
  }
  const adminUrl = process.env.SITE_TEST_DATABASE_URL;
  if (!adminUrl) throw new Error("SITE_TEST_DATABASE_URL est manquante.");
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  await admin.query("drop database if exists site_e2e with (force)");
  await admin.query("create database site_e2e");
  const pool = new Pool({ connectionString: adminUrl.replace(/\/[^/]*$/, "/site_e2e"), max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  return async () => {
    await admin.query("drop database if exists site_e2e with (force)");
    await admin.end();
  };
}
