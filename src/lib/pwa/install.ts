/**
 * Installation de la PWA : quelle invitation afficher selon le navigateur (logique pure, testable).
 * - installed : déjà installée (ou lancée depuis l'écran d'accueil) ;
 * - prompt : le navigateur fournit une invite native (Android, Chrome, Edge) ;
 * - ios : pas d'invite sur iPhone/iPad, il faut passer par « Partager » puis « Sur l'écran d'accueil » ;
 * - unsupported : ce navigateur ne propose pas l'installation.
 */
export type InstallMode = "prompt" | "ios" | "installed" | "unsupported";

export function installModeOf(e: { installed: boolean; standalone: boolean; hasPrompt: boolean; ios: boolean }): InstallMode {
  if (e.installed || e.standalone) return "installed";
  if (e.hasPrompt) return "prompt";
  if (e.ios) return "ios";
  return "unsupported";
}
