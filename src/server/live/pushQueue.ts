/**
 * Collecteur des push à envoyer, par appel serveur ou par exécution de tâches planifiées.
 *
 * `notify()` (appelée DANS la transaction métier) consigne l'identifiant de chaque notification créée ; l'envoi a lieu
 * quand l'appel est terminé, sans être attendu, et il RELIT les notifications dans la base : une transaction annulée
 * n'a donc créé aucune ligne et n'envoie rien. Un échec d'envoi ne remonte jamais à l'appelant.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const collector = new AsyncLocalStorage<string[]>();
const inflight = new Set<Promise<void>>();

/** Consigne une notification à envoyer en push ; sans effet hors d'un collecteur (aucune autre garantie nécessaire). */
export function queuePush(notificationId: string): void {
  collector.getStore()?.push(notificationId);
}

/** Exécute `fn` en collectant les push ; à la fin (succès ou échec), lance l'envoi sans l'attendre. */
export async function withPushDelivery<T>(fn: () => Promise<T>): Promise<T> {
  const ids: string[] = [];
  try {
    return await collector.run(ids, fn);
  } finally {
    if (ids.length > 0) {
      // Import différé : push.ts dépend des helpers, qui dépendent de ce module (pas de cycle au chargement).
      const p: Promise<void> = import("./push")
        .then(({ deliverPush }) => deliverPush(ids))
        .then(() => undefined)
        .catch((e) => console.error("[push] envoi impossible", e instanceof Error ? e.message : e))
        .finally(() => inflight.delete(p));
      inflight.add(p);
    }
  }
}

/** Attend les envois en cours : tests, et fin d'un processus qui s'arrête juste après (`npm run jobs`). */
export async function settlePushDeliveries(): Promise<void> {
  await Promise.allSettled([...inflight]);
}
