/** Démarrage du serveur : lance le planificateur des tâches (mode serveur uniquement, runtime Node). */
export async function register() {
  // Condition laissée sous cette forme : Next l'évalue à la compilation et exclut ce code du runtime Edge.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return;
    const { startScheduler } = await import("./server/live/jobs");
    startScheduler();
  }
}
