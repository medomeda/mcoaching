/**
 * Base PostgreSQL jetable pour les tests « mode serveur » : crée une base, applique les migrations,
 * pointe DATABASE_URL dessus, puis la supprime. Connexion d'administration : TEST_DATABASE_ADMIN_URL,
 * sinon DATABASE_URL de `.env.local` avec la base `postgres`. Renvoie null si aucune n'est disponible.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";

function adminUrl(): string | null {
  if (process.env.TEST_DATABASE_ADMIN_URL) return process.env.TEST_DATABASE_ADMIN_URL;
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* absent */
  }
  const u = process.env.DATABASE_URL;
  return u ? u.replace(/\/[^/?]*(\?.*)?$/, "/postgres$1") : null;
}

export const liveDbAvailable = adminUrl() !== null;

export async function createLiveDb(): Promise<{ drop: () => Promise<void>; url: string }> {
  const admin = adminUrl();
  if (!admin) throw new Error("Aucune connexion d'administration PostgreSQL pour les tests.");
  const name = `mcoaching_test_${randomBytes(5).toString("hex")}`;
  const pool = new Pool({ connectionString: admin, max: 1 });
  await pool.query(`create database ${name}`);
  const url = admin.replace(/\/[^/?]*(\?.*)?$/, `/${name}$1`);
  const mp = new Pool({ connectionString: url, max: 1 });
  await migrate(drizzle(mp), { migrationsFolder: "./drizzle" });
  await mp.end();
  process.env.DATABASE_URL = url;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-1234567890";
  process.env.APP_URL = "http://localhost:3600";
  return {
    url,
    drop: async () => {
      const g = globalThis as unknown as { pgPool?: Pool };
      await g.pgPool?.end().catch(() => undefined);
      g.pgPool = undefined;
      await pool.query(`drop database if exists ${name} with (force)`);
      await pool.end();
    },
  };
}
