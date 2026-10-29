/** Adresse publique de l'application (APP_URL) sans barre oblique finale ; vide si non définie. */
export function appUrl(): string {
  return (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
}

/** Origines acceptées pour les requêtes d'écriture : APP_URL, plus TRUSTED_ORIGINS (liste séparée par des virgules). */
export function trustedOrigins(): string[] {
  const extra = (process.env.TRUSTED_ORIGINS ?? "").split(",").map((o) => o.trim().replace(/\/+$/, ""));
  return [appUrl(), ...extra].filter(Boolean);
}
