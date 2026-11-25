import { db } from "@/db/client";
import { auditLog } from "@/db/schema";

/** Journal des actions de l'opérateur (jamais de secret ni de clé dans `target`). */
export async function audit(action: string, target?: string, d: Pick<typeof db, "insert"> = db): Promise<void> {
  await d.insert(auditLog).values({ action, target: target ?? null });
}
