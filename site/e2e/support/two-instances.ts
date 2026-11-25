/**
 * Lance deux instances Mentora (serveur autonome) sur des bases jetables, pour les parcours de bout en bout.
 * Le serveur autonome vient de `site/scripts/build-mentora-for-e2e.sh` (variable MENTORA_STANDALONE_DIR).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export interface Instance {
  label: string;
  port: number;
  url: string;
  /** (Re)démarre l'instance avec cette clé `OPS_API_KEY` (la clé n'est connue qu'après la création du client). */
  start(opsKey: string): Promise<void>;
  /** Insère des comptes directement en base pour différencier les compteurs. */
  seedUsers(users: { role: "COACH" | "LEARNER"; status?: "ACTIVE" | "SUSPENDED" }[]): Promise<void>;
  stop(): Promise<void>;
  drop(): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function createInstance(label: string, port: number, adminUrl: string): Promise<Instance> {
  const dir = process.env.MENTORA_STANDALONE_DIR;
  if (!dir) throw new Error("MENTORA_STANDALONE_DIR est manquante : export MENTORA_STANDALONE_DIR=$(site/scripts/build-mentora-for-e2e.sh)");
  const dbName = `e2e_inst_${label}_${randomBytes(3).toString("hex")}`;
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  await admin.query(`create database ${dbName}`);
  const dbUrl = adminUrl.replace(/\/[^/?]*(\?.*)?$/, `/${dbName}$1`);
  const pool = new Pool({ connectionString: dbUrl, max: 2 });
  // Connexions inactives coupées par la suppression forcée des bases à la fin du test : sans importance.
  pool.on("error", () => undefined);
  admin.on("error", () => undefined);
  await migrate(drizzle(pool), { migrationsFolder: new URL("../../../drizzle", import.meta.url).pathname });
  let child: ChildProcess | null = null;
  const url = `http://127.0.0.1:${port}`;

  const stop = async () => {
    if (!child) return;
    const c = child;
    child = null;
    // Le serveur autonome peut engendrer un processus fils : on arrête tout le groupe, sinon le port reste occupé.
    try {
      process.kill(-c.pid!, "SIGTERM");
    } catch {
      /* déjà arrêté */
    }
    await new Promise<void>((r) => (c.exitCode !== null ? r() : c.once("exit", () => r())));
    for (let i = 0; i < 20; i++) {
      try {
        await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(300) });
      } catch {
        return; // plus rien n'écoute
      }
      await sleep(250);
    }
  };

  return {
    label,
    port,
    url,
    async start(opsKey) {
      await stop();
      child = spawn("node", ["server.js"], {
        cwd: dir,
        env: {
          ...process.env,
          PORT: String(port),
          HOSTNAME: "127.0.0.1",
          NODE_ENV: "production",
          DATABASE_URL: dbUrl,
          AUTH_SECRET: `secret-${label}-`.padEnd(48, "x"),
          APP_URL: url,
          OPS_API_KEY: opsKey,
          DISABLE_SCHEDULER: "true",
          APP_VERSION: "e2e-1.0.0",
        },
        stdio: "ignore",
        detached: true,
      });
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch(`${url}/api/health`)).status === 200) return;
        } catch {
          /* pas encore prêt */
        }
        await sleep(500);
      }
      throw new Error(`L'instance ${label} n'a pas démarré.`);
    },
    async seedUsers(users) {
      for (const [i, u] of users.entries()) {
        await pool.query(
          `insert into "user" (id, name, email, email_verified, role, status) values ($1, $2, $3, true, $4, $5)`,
          [`seed_${label}_${i}`, `Membre ${i}`, `seed${i}@${label}.test`, u.role, u.status ?? "ACTIVE"],
        );
      }
    },
    stop,
    async drop() {
      await stop();
      await pool.end();
      await admin.query(`drop database if exists ${dbName} with (force)`);
      await admin.end();
    },
  };
}
