/**
 * Exécution ponctuelle des tâches planifiées (cron externe ou manuel) : `npm run jobs`.
 * À utiliser avec DISABLE_SCHEDULER=true sur le serveur web si l'on préfère un processus dédié.
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { runScheduledJobs } = await import("../src/server/live/jobs");
const { pool } = await import("../src/server/pg/client");

try {
  console.log(await runScheduledJobs());
} finally {
  await pool.end();
}
