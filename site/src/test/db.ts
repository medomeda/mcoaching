/**
 * Base jetable pour les tests : crée une base à partir de SITE_TEST_DATABASE_URL (connexion d'administration),
 * applique les migrations, exécute `fn`, puis supprime la base.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import * as schema from "@/db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export async function withTestDb<T>(fn: (db: TestDb, url: string) => Promise<T>): Promise<T> {
  const adminUrl = process.env.SITE_TEST_DATABASE_URL;
  if (!adminUrl) throw new Error("SITE_TEST_DATABASE_URL est manquante (voir site/.env.example).");
  const name = `site_test_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  await admin.query(`create database ${name}`);
  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  const pool = new Pool({ connectionString: u.toString(), max: 4 });
  try {
    const db = drizzle(pool, { schema, casing: "snake_case" });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
    return await fn(db, u.toString());
  } finally {
    await pool.end();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  }
}
