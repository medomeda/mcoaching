/** Harnais de test : runtime en mémoire, horloge contrôlée, création de comptes par les vrais parcours. */
import { createMemoryRuntime, setRuntime, type Runtime } from "@/server/runtime";
import * as auth from "@/server/api/auth";
import * as users from "@/server/api/users";
import * as assignments from "@/server/api/assignments";
import * as ent from "@/server/api/entitlements";
import * as requests from "@/server/api/requests";
import { catchUpJobs, resetJobThrottle } from "@/server/api/context";

export const PASSWORD = "Mot-de-passe-2026";

export class TestEnv {
  clock: number;
  rt: Runtime;
  constructor(startIso = "2026-10-26T09:00:00.000Z") {
    this.clock = Date.parse(startIso);
    this.rt = createMemoryRuntime(() => this.clock);
    setRuntime(this.rt);
    resetJobThrottle();
  }
  set(iso: string) {
    this.clock = Date.parse(iso);
  }
  advanceMinutes(m: number) {
    this.clock += m * 60_000;
  }
  db() {
    return this.rt.store.snapshot();
  }
  async jobs() {
    resetJobThrottle();
    await catchUpJobs(true);
  }
}

export async function login(email: string, password = PASSWORD) {
  const r = await auth.login({ email, password });
  return { token: r.token, id: r.user.id };
}

/** Création par l'admin puis activation via le lien reçu « par e-mail ». */
export async function createAndActivate(env: TestEnv, admin: { token: string }, full_name: string, email: string, role: "COACH" | "LEARNER" | "ADMIN") {
  await users.createUser(admin, { full_name, email, role });
  const log = env.db().email_delivery_logs.filter((e) => e.recipient === email && e.template_key === "ACCOUNT_ACTIVATION").pop()!;
  const token = new URL(log.template_params.link!, "http://x").searchParams.get("token")!;
  await auth.completeToken({ token, purpose: "ACTIVATION", password: PASSWORD });
  return login(email);
}

export async function standardSetup(env: TestEnv, opts: { quota?: number | null; learnerEmail?: string } = {}) {
  await auth.bootstrapAdmin({ full_name: "Admin Test", email: "admin@test.example", password: PASSWORD });
  const admin = await login("admin@test.example");
  const coach = await createAndActivate(env, admin, "Coach Un", "coach1@test.example", "COACH");
  const coach2 = await createAndActivate(env, admin, "Coach Deux", "coach2@test.example", "COACH");
  const learner = await createAndActivate(env, admin, "Apprenant Un", opts.learnerEmail ?? "learner1@test.example", "LEARNER");
  const learner2 = await createAndActivate(env, admin, "Apprenant Deux", "learner2@test.example", "LEARNER");
  await assignments.assignCoach(admin, { learnerId: learner.id, coachId: coach.id });
  await assignments.assignCoach(admin, { learnerId: learner2.id, coachId: coach2.id });
  const quota = opts.quota === undefined ? null : opts.quota;
  const start = new Date(env.clock - 86_400_000).toISOString();
  await ent.grantEntitlement(admin, { learnerId: learner.id, starts_at: start, expires_at: null, quota_enabled: quota !== null, quota_limit: quota });
  await ent.grantEntitlement(admin, { learnerId: learner2.id, starts_at: start, expires_at: null, quota_enabled: false });
  const categoryId = env.db().coaching_categories[0]!.id;
  return { admin, coach, coach2, learner, learner2, categoryId };
}

/** Après un saut d'horloge, les sessions expirent (comportement attendu) : reconnexion. */
export async function relogin(s: Awaited<ReturnType<typeof standardSetup>>, learnerEmail = "learner1@test.example") {
  s.admin.token = (await login("admin@test.example")).token;
  s.coach.token = (await login("coach1@test.example")).token;
  s.coach2.token = (await login("coach2@test.example")).token;
  s.learner.token = (await login(learnerEmail)).token;
  s.learner2.token = (await login("learner2@test.example")).token;
}

export async function newDraft(learner: { token: string }, categoryId: string, subject = "Question sur les obligations") {
  return requests.createDraft(learner, {
    category_id: categoryId,
    subject,
    description: "Description suffisamment détaillée de ma question de coaching.",
  });
}

export async function submitNew(learner: { token: string }, categoryId: string, key = `k-${Math.random().toString(36).slice(2)}`) {
  const d = await newDraft(learner, categoryId);
  return requests.submitRequest(learner, d.id, { idempotencyKey: key });
}

export async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const c = (e as { code?: string }).code;
    if (c === code) return e;
    throw new Error(`Code attendu ${code}, reçu ${c} (${(e as Error).message})`);
  }
  throw new Error(`L’opération aurait dû échouer avec ${code}.`);
}
