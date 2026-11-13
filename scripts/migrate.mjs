/**
 * Applique les migrations Drizzle (dossier drizzle/) sur DATABASE_URL.
 * Lancé par docker-entrypoint.sh au démarrage du conteneur (ou à la main : `node scripts/migrate.mjs`) ; sans danger à relancer.
 * Attend la base jusqu'à MIGRATE_WAIT_SECONDS (60 par défaut) : une base indépendante peut démarrer après l'application.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL est manquante.");

// Même règle que src/server/pg/ssl.ts (ce script ne passe pas par la compilation TypeScript).
function ssl() {
  const v = (process.env.DATABASE_SSL ?? "").trim().toLowerCase();
  if (v === "") return undefined;
  if (v === "disable") return false;
  if (v === "require") return true;
  if (v === "no-verify") return { rejectUnauthorized: false };
  throw new Error(`DATABASE_SSL invalide (« ${process.env.DATABASE_SSL} ») : disable, require ou no-verify.`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const target = (() => {
  try {
    const u = new URL(process.env.DATABASE_URL);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return "(DATABASE_URL illisible : vérifier l'encodage des caractères spéciaux du mot de passe)";
  }
})();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: ssl() });
try {
  const deadline = Date.now() + Number(process.env.MIGRATE_WAIT_SECONDS ?? 60) * 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("select 1");
      break;
    } catch (e) {
      // 28xxx : identifiants refusés, 3D000 : base inexistante — inutile d'attendre, la configuration est fausse.
      const fatal = typeof e.code === "string" && (e.code.startsWith("28") || e.code === "3D000");
      if (fatal || Date.now() >= deadline) {
        console.error(`Base de données inaccessible (${target}) : ${e.code ?? ""} ${e.message}`);
        process.exit(1);
      }
      console.log(`Base de données ${target} pas encore joignable (${e.code ?? e.message}), nouvelle tentative…`);
      await sleep(Math.min(2000 * attempt, 5000));
    }
  }
  await migrate(drizzle(pool), { migrationsFolder: process.env.MIGRATIONS_DIR || "./drizzle" });
  console.log("Migrations appliquées.");
} catch (e) {
  console.error(`Échec des migrations : ${e.message}`);
  process.exit(1);
} finally {
  await pool.end();
}
