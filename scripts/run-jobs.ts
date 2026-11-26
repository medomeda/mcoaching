/**
 * Exécution ponctuelle des tâches planifiées (cron externe ou manuel) : `npm run jobs`.
 * À utiliser avec DISABLE_SCHEDULER=true sur le serveur web si l'on préfère un processus dédié.
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { runScheduledJobs } = await import("../src/server/live/jobs");
const { pool } = await import("../src/server/pg/client");
const { settlePushDeliveries } = await import("../src/server/live/pushQueue");

try {
  console.log(await runScheduledJobs());
} finally {
  await settlePushDeliveries(); // les push partent sans être attendus : on les laisse finir avant de fermer la base
  await pool.end();
}
