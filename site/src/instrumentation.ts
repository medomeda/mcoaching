/** Démarrage du serveur : lance la supervision des instances (runtime Node uniquement). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMonitoring } = await import("./server/monitoring");
    await startMonitoring();
  }
}
