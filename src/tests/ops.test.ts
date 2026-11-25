/** Points d'accès `ops` et suspension d'instance (mode serveur, base PostgreSQL jetable). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLiveDb, liveDbAvailable } from "./liveDb";

const KEY = "cle-ops-de-test-0123456789abcdef";
const USAGE_KEYS = ["coaches_active", "generated_at", "last_activity_at", "members_active", "requests_overdue", "requests_this_month", "suspended", "version"];

type Mods = {
  usage: typeof import("@/app/api/ops/usage/route");
  susp: typeof import("@/app/api/ops/suspension/route");
  health: typeof import("@/app/api/health/route");
  ctx: typeof import("@/server/live/context");
  status: typeof import("@/server/live/auth");
  jobs: typeof import("@/server/live/jobs");
  ops: typeof import("@/server/ops/usage");
  db: typeof import("@/server/pg/client");
  schema: typeof import("@/server/pg/schema");
};

let drop: () => Promise<void>;
let m: Mods;

const get = (key?: string) => m.usage.GET(new Request("http://x/api/ops/usage", { headers: key ? { authorization: `Bearer ${key}` } : {} }) as never);
const post = (body: unknown, key = KEY) =>
  m.susp.POST(new Request("http://x/api/ops/suspension", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) }) as never);

describe.skipIf(!liveDbAvailable)("ops", () => {
  beforeAll(async () => {
    ({ drop } = await createLiveDb());
    process.env.OPS_API_KEY = KEY;
    m = {
      usage: await import("@/app/api/ops/usage/route"),
      susp: await import("@/app/api/ops/suspension/route"),
      health: await import("@/app/api/health/route"),
      ctx: await import("@/server/live/context"),
      status: await import("@/server/live/auth"),
      jobs: await import("@/server/live/jobs"),
      ops: await import("@/server/ops/usage"),
      db: await import("@/server/pg/client"),
      schema: await import("@/server/pg/schema"),
    };
    const { db } = m.db;
    const s = m.schema;
    const u = (id: string, role: "COACH" | "LEARNER" | "ADMIN", status: "ACTIVE" | "SUSPENDED" | "PENDING_ACTIVATION", last?: Date) => ({ id, name: id, email: `${id}@x.io`, role, status, emailVerified: true, lastLoginAt: last ?? null });
    await db.insert(s.user).values([
      u("c1", "COACH", "ACTIVE", new Date("2027-01-05T10:00:00Z")),
      u("c2", "COACH", "SUSPENDED"),
      u("l1", "LEARNER", "ACTIVE"),
      u("l2", "LEARNER", "ACTIVE"),
      u("l3", "LEARNER", "PENDING_ACTIVATION"),
      u("a1", "ADMIN", "ACTIVE"),
    ]);
    const [cat] = await db.select().from(s.coachingCategory).limit(1);
    const [policy] = await db.select().from(s.servicePolicy).limit(1);
    const old = new Date(Date.now() - 20 * 86_400_000);
    const mkReq = async (id: string, status: "SUBMITTED" | "DRAFT" | "CLOSED", created: Date) => {
      await db.insert(s.coachingRequest).values({ id, learnerId: "l1", coachId: "c1", categoryId: cat!.id, subject: "S", description: "D", status, createdAt: created, currentCycleNumber: 1 });
      await db.insert(s.coachingRequestCycle).values({ id: `cy_${id}`, requestId: id, cycleNumber: 1, startedAt: created, dueAt: new Date(created.getTime() + 3_600_000), policyId: policy!.id });
    };
    await mkReq("r_overdue", "SUBMITTED", old); // ouverte, échéance dépassée, créée il y a 20 jours
    await mkReq("r_draft", "DRAFT", new Date());
    await mkReq("r_new", "SUBMITTED", new Date());
  });

  afterAll(async () => {
    await drop?.();
  });

  it("répond 404 quand OPS_API_KEY n'est pas configurée", async () => {
    delete process.env.OPS_API_KEY;
    expect((await get(KEY)).status).toBe(404);
    expect((await post({ suspended: true, message: null })).status).toBe(404);
    process.env.OPS_API_KEY = KEY;
  });

  it("refuse une clé absente ou fausse", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("mauvaise-cle-mauvaise-cle-0123456789")).status).toBe(401);
    expect((await post({ suspended: true, message: null }, "mauvaise")).status).toBe(401);
  });

  it("renvoie exactement les champs du contrat, avec les bons compteurs", async () => {
    const res = await get(KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(USAGE_KEYS);
    expect(body).toMatchObject({ suspended: false, coaches_active: 1, members_active: 2, requests_overdue: 1 });
    expect(body.requests_this_month).toBeGreaterThanOrEqual(1);
    expect(body.requests_this_month).toBeLessThanOrEqual(2);
    expect(typeof body.version).toBe("string");
    expect(body.last_activity_at).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/@x\.io|Sujet|"S"|"D"/);
  });

  it("suspension : message visible, connexion et appels refusés, santé en 200, réactivation immédiate", async () => {
    expect((await post({ suspended: true, message: "Abonnement impayé." })).status).toBe(200);
    expect((await (await get(KEY)).json()).suspended).toBe(true);
    const st = (await m.status.systemStatus({ headers: new Headers() })) as { suspended: boolean; suspensionMessage: string | null };
    expect(st).toMatchObject({ suspended: true, suspensionMessage: "Abonnement impayé." });
    await expect(m.ctx.authenticate({ headers: new Headers() })).rejects.toMatchObject({ code: "SERVICE_SUSPENDED", message: "Abonnement impayé." });
    expect((await m.health.GET()).status).toBe(200);
    expect((await post({ suspended: false, message: null })).status).toBe(200);
    await expect(m.ctx.authenticate({ headers: new Headers() })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("suspension sans message : message par défaut en français ; sessions ouvertes supprimées", async () => {
    const { db } = m.db;
    const s = m.schema;
    await db.insert(s.session).values({ id: "s1", token: "t1", userId: "l1", expiresAt: new Date(Date.now() + 3_600_000) });
    await post({ suspended: true, message: "   " });
    const st = (await m.status.systemStatus({ headers: new Headers() })) as { suspensionMessage: string | null };
    expect(st.suspensionMessage).toBe(m.ops.DEFAULT_SUSPENSION_MESSAGE);
    expect(await db.select().from(s.session)).toHaveLength(0);
    await post({ suspended: false, message: null });
  });

  it("instance suspendue : les tâches planifiées n'envoient plus d'e-mails ni de rappels", async () => {
    const { db } = m.db;
    const s = m.schema;
    await post({ suspended: true, message: null });
    await db.insert(s.emailDeliveryLog).values({ id: "em1", recipient: "a@x.io", templateKey: "ACTIVATION", status: "PENDING", nextAttemptAt: new Date(Date.now() - 1000) });
    const sum = await m.jobs.runScheduledJobs();
    expect(sum.emailsSent + sum.emailsFailed + sum.reminders + sum.overdue + sum.escalations + sum.coachAlerts).toBe(0);
    const [mail] = await db.select().from(s.emailDeliveryLog);
    expect(mail).toMatchObject({ status: "PENDING", attemptCount: 0 });
    await post({ suspended: false, message: null });
  });

  it("corps invalide : 422 sans changement", async () => {
    expect((await post({ suspended: "oui" })).status).toBe(422);
    expect((await (await get(KEY)).json()).suspended).toBe(false);
  });
});
