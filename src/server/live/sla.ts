/** Échéances (SLA) des demandes, calculées par lot avec le module pur `deadlines/sla`. */
import { inArray } from "drizzle-orm";
import { computeSla, type SlaState } from "@/modules/deadlines/sla";
import { coachingRequestCycle, serviceHoliday, servicePolicy, type coachingRequest } from "../pg/schema";
import type { Tx } from "./helpers";
import { toCycle, toHoliday, toPolicy } from "./mappers";

type RequestRow = typeof coachingRequest.$inferSelect;

/** Charge cycles courants, politiques et fériés en 3 requêtes ; renvoie l'état SLA par demande. */
export async function slaResolver(tx: Tx, requests: RequestRow[], now: Date): Promise<(r: RequestRow) => SlaState | null> {
  if (requests.length === 0) return () => null;
  const cycles = await tx
    .select()
    .from(coachingRequestCycle)
    .where(inArray(coachingRequestCycle.requestId, requests.map((r) => r.id)));
  const current = new Map(
    cycles
      .filter((c) => requests.some((r) => r.id === c.requestId && r.currentCycleNumber === c.cycleNumber))
      .map((c) => [c.requestId, c]),
  );
  const policyIds = [...new Set([...current.values()].map((c) => c.policyId))];
  const policies = policyIds.length ? await tx.select().from(servicePolicy).where(inArray(servicePolicy.id, policyIds)) : [];
  const policyOf = new Map(policies.map((p) => [p.id, toPolicy(p)]));
  const holidays = (await tx.select().from(serviceHoliday)).map(toHoliday);

  return (r) => {
    const c = current.get(r.id);
    const p = c && policyOf.get(c.policyId);
    return c && p ? computeSla(toCycle(c), r.status, p, holidays, now) : null;
  };
}
