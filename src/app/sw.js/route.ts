import { buildServiceWorker } from "@/lib/pwa/sw-script";

/**
 * Service worker de la PWA. Servi par une route pour y injecter l'identifiant de build (MENTORA_BUILD_ID, défini
 * par next.config.ts) : son contenu change à chaque déploiement, ce qui déclenche la mise à jour des appareils installés.
 * Jamais mis en cache par le navigateur ni par un proxy.
 */
export function GET() {
  return new Response(buildServiceWorker(process.env.MENTORA_BUILD_ID ?? "dev"), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'",
    },
  });
}
