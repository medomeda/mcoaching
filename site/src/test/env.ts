/** Charge `site/.env.local` (SITE_TEST_DATABASE_URL…) pour les tests ; sans effet si le fichier est absent. */
try {
  process.loadEnvFile(new URL("../../.env.local", import.meta.url));
} catch {
  /* fichier absent : les variables viennent de l'environnement */
}
process.env.MONITORING = "off";
// Tests hermétiques : seules les variables de test sont conservées, jamais celles du développement local.
for (const k of ["DATABASE_URL", "DATABASE_SSL", "SITE_URL", "ADMIN_HOST", "INSTANCE_DOMAIN", "MASTER_KEY", "AUTH_SECRET", "LEGAL_COMPANY_NAME", "LEGAL_ADDRESS", "LEGAL_EMAIL", "LEGAL_PHONE"]) delete process.env[k];
