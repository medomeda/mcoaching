/**
 * Détection des nouvelles versions de l'application (service worker). Logique pure, sans dépendance à React,
 * pour être testable sans navigateur.
 *
 * Une version « prête » (installée mais en attente) est PROPOSÉE à l'utilisateur ; elle n'est activée, et la page
 * rechargée une seule fois, que s'il accepte : il peut être en train d'écrire un message.
 */
export interface UpdateHandlers {
  /** Une nouvelle version est prête ; `apply` l'active (à appeler quand l'utilisateur accepte). */
  offerUpdate: (apply: () => void) => void;
  /** Recharge la page (appelé une seule fois, après acceptation). */
  reload: () => void;
}

/** Surveille un enregistrement ; renvoie la fonction qui retire les écouteurs. */
export function watchRegistration(reg: ServiceWorkerRegistration, container: ServiceWorkerContainer, h: UpdateHandlers): () => void {
  let accepted = false;

  const offer = (worker: ServiceWorker) =>
    h.offerUpdate(() => {
      accepted = true;
      worker.postMessage({ type: "SKIP_WAITING" });
    });

  // Une version déjà téléchargée attend peut-être depuis la dernière visite.
  if (reg.waiting && container.controller) offer(reg.waiting);

  const onUpdateFound = () => {
    const worker = reg.installing;
    worker?.addEventListener("statechange", () => {
      // « installed » avec un contrôleur déjà en place = mise à jour (et non première installation).
      if (worker.state === "installed" && container.controller) offer(worker);
    });
  };

  const onControllerChange = () => {
    // La toute première installation déclenche aussi cet événement : on ne recharge que sur demande.
    if (!accepted) return;
    accepted = false;
    h.reload();
  };

  reg.addEventListener("updatefound", onUpdateFound);
  container.addEventListener("controllerchange", onControllerChange);
  return () => {
    reg.removeEventListener("updatefound", onUpdateFound);
    container.removeEventListener("controllerchange", onControllerChange);
  };
}
