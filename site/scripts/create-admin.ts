/**
 * Crée l'unique compte opérateur, ou réinitialise son second facteur.
 *   npm run create-admin -- --email vous@exemple.com            (mot de passe demandé, sans écho)
 *   npm run create-admin -- --reset-2fa --email vous@exemple.com
 * À exécuter sur le serveur (DATABASE_URL, AUTH_SECRET et ADMIN_HOST doivent être définies).
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* variables déjà dans l'environnement */
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function askHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

const email = arg("email");
if (!email) {
  console.error("Indiquez --email.");
  process.exit(1);
}
const { db } = await import("../src/db/client");
const { getAuth } = await import("../src/server/auth");
const { createOperator, resetTwoFactor } = await import("../src/server/operator");

try {
  if (process.argv.includes("--reset-2fa")) {
    await resetTwoFactor(db, email);
    console.log("Second facteur réinitialisé : il sera à réactiver à la prochaine connexion.");
  } else {
    const password = process.env.ADMIN_PASSWORD ?? (await askHidden("Mot de passe (12 caractères minimum) : "));
    await createOperator(getAuth(), db, { email, password });
    console.log("Compte opérateur créé. Connectez-vous sur l'hôte d'administration : la double authentification sera à activer.");
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
process.exit();
