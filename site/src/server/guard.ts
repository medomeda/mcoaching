import { headers } from "next/headers";
import { requireOperator } from "./auth";

/** À appeler en tête de chaque action serveur : le layout ne protège pas les actions appelées directement. */
export async function guard() {
  return requireOperator(await headers());
}
