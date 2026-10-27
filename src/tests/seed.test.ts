import { describe, expect, it } from "vitest";
import { buildDemoDatabase } from "@/server/seed/demoSeed";
import { createMemoryRuntime, setRuntime } from "@/server/runtime";
import { computeMetrics } from "@/modules/reporting/metrics";
import { quotaBalance } from "@/modules/entitlements/entitlements";

describe("Jeu de démonstration", () => {
  it("est produit par les opérations métier et reste cohérent", async () => {
    setRuntime(createMemoryRuntime());
    const now = Date.parse("2026-10-27T11:00:00.000Z");
    const { db, files } = await buildDemoDatabase(now);
    const statuses = db.coaching_requests.map((r) => r.status).sort();
    expect(statuses).toEqual(
      expect.arrayContaining(["CLOSED", "CANCELLED", "DRAFT", "IN_PROGRESS", "RESPONSE_PROVIDED", "SUBMITTED", "WAITING_FOR_LEARNER"]),
    );
    // Réouverture → 2 cycles et évaluation du 1er cycle conservée
    const reopened = db.coaching_requests.find((r) => r.current_cycle_number === 2)!;
    expect(reopened).toBeDefined();
    expect(db.coaching_ratings.some((x) => x.request_id === reopened.id && x.cycle_number === 1)).toBe(true);
    // Quota épuisé pour Ibrahim (3/3)
    const ibrahim = db.users.find((u) => u.full_name === "Ibrahim Sanogo")!;
    const e = db.coaching_entitlements.find((x) => x.learner_id === ibrahim.id && !x.superseded_at)!;
    expect(quotaBalance(e, db.coaching_quota_ledger).remaining).toBe(0);
    // Retard + escalade + échecs d'e-mail
    expect(db.notifications.some((n) => n.type === "ESCALATION")).toBe(true);
    expect(db.email_delivery_logs.some((x) => x.status === "FAILED")).toBe(true);
    expect(files.size).toBe(db.message_attachments.length);
    expect(db.sessions).toHaveLength(0);
    const m = computeMetrics(db, { from: new Date(now - 60 * 86_400_000), to: new Date(now) }, new Date(now));
    expect(m.overdue_now).toBeGreaterThanOrEqual(1);
    expect(m.satisfaction.ratings).toBe(3);
    expect(m.reopened).toBe(1);
  });
});
