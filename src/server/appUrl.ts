/** Adresse publique de l'application (APP_URL) sans barre oblique finale ; vide si non définie. */
export function appUrl(): string {
  return (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
}
