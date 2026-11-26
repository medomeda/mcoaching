/** Détection des nouvelles versions : logique pure, testée avec de faux objets du navigateur. */
import { describe, expect, it, vi } from "vitest";
import { watchRegistration } from "@/lib/pwa/update-watcher";

class FakeWorker extends EventTarget {
  state = "installing";
  postMessage = vi.fn();
  become(state: string) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}
class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
}
class FakeContainer extends EventTarget {
  controller: object | null = {};
}

function setup(opts: { controller?: boolean; waiting?: boolean; installing?: FakeWorker } = {}) {
  const reg = new FakeRegistration();
  const container = new FakeContainer();
  if (opts.controller === false) container.controller = null;
  if (opts.waiting) reg.waiting = new FakeWorker();
  if (opts.installing) reg.installing = opts.installing;
  const offers: Array<() => void> = [];
  const h = { offerUpdate: vi.fn((apply: () => void) => offers.push(apply)), reload: vi.fn() };
  const stop = watchRegistration(reg as unknown as ServiceWorkerRegistration, container as unknown as ServiceWorkerContainer, h);
  return { reg, container, h, offers, stop };
}

describe("watchRegistration", () => {
  it("propose une version déjà téléchargée qui attend depuis la dernière visite", () => {
    const { h } = setup({ waiting: true });
    expect(h.offerUpdate).toHaveBeenCalledTimes(1);
  });

  it("propose la mise à jour quand un nouveau worker est installé", () => {
    const { reg, h } = setup();
    const w = new FakeWorker();
    reg.installing = w;
    reg.dispatchEvent(new Event("updatefound"));
    expect(h.offerUpdate).not.toHaveBeenCalled(); // encore en cours d'installation
    w.become("installed");
    expect(h.offerUpdate).toHaveBeenCalledTimes(1);
  });

  it("ne propose rien à la toute première installation (pas encore de contrôleur)", () => {
    const { reg, h } = setup({ controller: false, waiting: true });
    const w = new FakeWorker();
    reg.installing = w;
    reg.dispatchEvent(new Event("updatefound"));
    w.become("installed");
    expect(h.offerUpdate).not.toHaveBeenCalled();
  });

  it("« Mettre à jour » demande l'activation au nouveau worker", () => {
    const { reg, offers } = setup();
    const w = new FakeWorker();
    reg.installing = w;
    reg.dispatchEvent(new Event("updatefound"));
    w.become("installed");
    offers[0]!();
    expect(w.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("ne recharge jamais la page sans l'accord de l'utilisateur", () => {
    const { container, h } = setup();
    container.dispatchEvent(new Event("controllerchange")); // la première installation déclenche aussi cet événement
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("recharge une seule fois après l'accord, même si l'événement se répète", () => {
    const { reg, container, h, offers } = setup();
    const w = new FakeWorker();
    reg.installing = w;
    reg.dispatchEvent(new Event("updatefound"));
    w.become("installed");
    offers[0]!();
    container.dispatchEvent(new Event("controllerchange"));
    container.dispatchEvent(new Event("controllerchange"));
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("n'écoute plus rien après le nettoyage", () => {
    const { reg, container, h, offers, stop } = setup({ waiting: true });
    offers[0]!();
    stop();
    container.dispatchEvent(new Event("controllerchange"));
    const w = new FakeWorker();
    reg.installing = w;
    reg.dispatchEvent(new Event("updatefound"));
    w.become("installed");
    expect(h.reload).not.toHaveBeenCalled();
    expect(h.offerUpdate).toHaveBeenCalledTimes(1);
  });

  it("propose une version dont l'installation est déjà en cours quand la surveillance démarre (page hydratée en retard)", () => {
    const w = new FakeWorker();
    const { h } = setup({ installing: w });
    expect(h.offerUpdate).not.toHaveBeenCalled();
    w.become("installed");
    expect(h.offerUpdate).toHaveBeenCalledTimes(1);
  });

  it("ne propose jamais deux fois la même version", () => {
    const w = new FakeWorker();
    const { reg, h } = setup({ installing: w });
    reg.dispatchEvent(new Event("updatefound")); // même worker annoncé de nouveau
    w.become("installed");
    w.become("installed");
    expect(h.offerUpdate).toHaveBeenCalledTimes(1);
  });

  it("ne propose plus rien après le nettoyage, même pour un worker déjà suivi", () => {
    const w = new FakeWorker();
    const { h, stop } = setup({ installing: w });
    stop();
    w.become("installed");
    expect(h.offerUpdate).not.toHaveBeenCalled();
  });
});
