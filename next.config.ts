import type { NextConfig } from "next";

/**
 * Identifiant unique de chaque build : injecté dans le service worker (/sw.js) pour que les applications
 * installées détectent une nouvelle version après chaque déploiement. Coolify fournit SOURCE_COMMIT au build ;
 * sinon, horodatage (chaque build reste différent).
 */
const buildId = (process.env.SOURCE_COMMIT || "").slice(0, 12) || Date.now().toString(36);

const nextConfig: NextConfig = {
  env: { MENTORA_BUILD_ID: buildId },
  // Serveur autonome : utilisé par l'image Docker (Dockerfile).
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
