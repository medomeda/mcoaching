/** Mode d'installation de la PWA : quelle invitation afficher selon le navigateur. */
import { describe, expect, it } from "vitest";
import { installModeOf } from "@/lib/pwa/install";

const base = { installed: false, standalone: false, hasPrompt: false, ios: false };

describe("installModeOf", () => {
  it("« installed » quand l'application est lancée depuis l'écran d'accueil (autonome)", () => {
    expect(installModeOf({ ...base, standalone: true })).toBe("installed");
  });

  it("« installed » juste après une installation, même sans mode autonome", () => {
    expect(installModeOf({ ...base, installed: true })).toBe("installed");
  });

  it("l'état installé est prioritaire sur l'invite et sur iPhone", () => {
    expect(installModeOf({ installed: true, standalone: false, hasPrompt: true, ios: true })).toBe("installed");
    expect(installModeOf({ installed: false, standalone: true, hasPrompt: true, ios: true })).toBe("installed");
  });

  it("« prompt » quand le navigateur a fourni l'invite d'installation (Android, Chrome, Edge)", () => {
    expect(installModeOf({ ...base, hasPrompt: true })).toBe("prompt");
  });

  it("« ios » sur iPhone sans invite : étapes manuelles via Partager", () => {
    expect(installModeOf({ ...base, ios: true })).toBe("ios");
  });

  it("« unsupported » sinon (navigateur sans installation)", () => {
    expect(installModeOf(base)).toBe("unsupported");
  });
});
