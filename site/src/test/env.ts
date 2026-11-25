/** Charge `site/.env.local` (SITE_TEST_DATABASE_URL…) pour les tests ; sans effet si le fichier est absent. */
try {
  process.loadEnvFile(new URL("../../.env.local", import.meta.url));
} catch {
  /* fichier absent : les variables viennent de l'environnement */
}
process.env.MONITORING = "off";
