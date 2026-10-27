/** Critères d'acceptation du PRD §17 (REC-01 → REC-20), exécutés contre la façade d'API. */
import { beforeEach, describe, expect, it } from "vitest";
import * as auth from "@/server/api/auth";
import * as users from "@/server/api/users";
import * as ent from "@/server/api/entitlements";
import * as requests from "@/server/api/requests";
import * as notifications from "@/server/api/notifications";
import * as settings from "@/server/api/settings";
import { createAndActivate, expectCode, login, newDraft, PASSWORD, relogin, standardSetup, submitNew, TestEnv } from "./helpers";

let env: TestEnv;
beforeEach(() => {
  env = new TestEnv("2026-10-26T09:00:00.000Z"); // lundi 09 h 00, Abidjan
});

const pdf = () => new TextEncoder().encode("%PDF-1.4\n%test\n%%EOF").buffer as ArrayBuffer;

describe("Droits et quotas", () => {
  it("REC-01 — apprenant sans droit actif : soumission refusée", async () => {
    const s = await standardSetup(env);
    const noRight = await createAndActivate(env, s.admin, "Sans Droit", "nodroit@test.example", "LEARNER");
    const d = await newDraft(noRight, s.categoryId);
    await expectCode(requests.submitRequest(noRight, d.id, { idempotencyKey: "abcdefgh1" }), "BUSINESS_RULE");

    const current = env.db().coaching_entitlements.find((e) => e.learner_id === s.learner.id && !e.superseded_at)!;
    await ent.setEntitlementStatus(s.admin, current.id, { action: "SUSPEND", reason: "Test suspension" });
    const d2 = await newDraft(s.learner, s.categoryId);
    await expectCode(requests.submitRequest(s.learner, d2.id, { idempotencyKey: "abcdefgh2" }), "BUSINESS_RULE");
    expect(env.db().coaching_quota_ledger).toHaveLength(0);
  });

  it("REC-02 — quota disponible : une demande consomme une unité", async () => {
    const s = await standardSetup(env, { quota: 3 });
    await submitNew(s.learner, s.categoryId);
    const mine = await ent.myEntitlement(s.learner);
    expect(mine.entitlement?.balance).toMatchObject({ enabled: true, limit: 3, used: 1, remaining: 2 });
    expect(env.db().coaching_quota_ledger.map((e) => [e.entry_type, e.quantity])).toEqual([["CONSUME", -1]]);
  });

  it("REC-03 — deux soumissions simultanées pour la dernière unité : une seule acceptée", async () => {
    const s = await standardSetup(env, { quota: 1 });
    const a = await newDraft(s.learner, s.categoryId, "Première question");
    const b = await newDraft(s.learner, s.categoryId, "Seconde question");
    const results = await Promise.allSettled([
      requests.submitRequest(s.learner, a.id, { idempotencyKey: "concurrent-a" }),
      requests.submitRequest(s.learner, b.id, { idempotencyKey: "concurrent-b" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(env.db().coaching_quota_ledger.filter((e) => e.entry_type === "CONSUME")).toHaveLength(1);
    expect(env.db().coaching_requests.filter((r) => r.status !== "DRAFT")).toHaveLength(1);
  });

  it("REC-20 — répétition de la même soumission : aucune consommation supplémentaire", async () => {
    const s = await standardSetup(env, { quota: 5 });
    const d = await newDraft(s.learner, s.categoryId);
    const first = await requests.submitRequest(s.learner, d.id, { idempotencyKey: "same-key-123" });
    const replay = await requests.submitRequest(s.learner, d.id, { idempotencyKey: "same-key-123" });
    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ replayed: true, reference: first.reference });
    await expectCode(requests.submitRequest(s.learner, d.id, { idempotencyKey: "other-key-456" }), "CONFLICT");
    expect(env.db().coaching_quota_ledger).toHaveLength(1);
  });

  it("une annulation ne rembourse pas automatiquement ; le remboursement admin est tracé", async () => {
    const s = await standardSetup(env, { quota: 2 });
    const r = await submitNew(s.learner, s.categoryId);
    await requests.cancelRequest(s.learner, r.id, { reason: "Erreur de saisie" });
    expect((await ent.myEntitlement(s.learner)).entitlement?.balance.remaining).toBe(1);
    await ent.refundRequestQuota(s.admin, r.id, { reason: "Geste commercial" });
    expect((await ent.myEntitlement(s.learner)).entitlement?.balance.remaining).toBe(2);
    await expectCode(ent.refundRequestQuota(s.admin, r.id, { reason: "Deuxième fois" }), "BUSINESS_RULE");
    expect(env.db().audit_logs.some((l) => l.action === "QUOTA_REFUNDED")).toBe(true);
  });

  it("une correction de quota exige un motif et alimente le registre", async () => {
    const s = await standardSetup(env, { quota: 1 });
    const e = env.db().coaching_entitlements.find((x) => x.learner_id === s.learner.id && !x.superseded_at)!;
    await expectCode(ent.correctQuota(s.admin, e.id, { quantity: 2, reason: "" }), "VALIDATION");
    await ent.correctQuota(s.admin, e.id, { quantity: 2, reason: "Bonus fidélité" });
    expect((await ent.myEntitlement(s.learner)).entitlement?.balance.remaining).toBe(3);
  });
});

describe("Délais, première réponse, retards", () => {
  it("REC-04 — soumission vendredi 16 h : échéance mercredi 16 h", async () => {
    const s = await standardSetup(env);
    env.set("2026-10-30T16:00:00.000Z");
    await relogin(s);
    const r = await submitNew(s.learner, s.categoryId);
    expect(r.due_at).toBe("2026-11-04T16:00:00.000Z");
  });

  it("REC-05 — l'accusé de réception automatique ne compte pas comme première réponse", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    const db = env.db();
    expect(db.coaching_messages.filter((m) => m.request_id === r.id && m.kind === "SYSTEM")).toHaveLength(1);
    expect(db.coaching_requests.find((x) => x.id === r.id)!.first_response_at).toBeNull();
  });

  it("REC-06 — le coach répond : réponse enregistrée et apprenant notifié", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    env.advanceMinutes(30);
    await requests.sendMessage(s.coach, r.id, { body: "Voici ma réponse.", intent: "MESSAGE" });
    const req = env.db().coaching_requests.find((x) => x.id === r.id)!;
    expect(req.first_response_at).toBe("2026-10-26T09:30:00.000Z");
    expect(req.status).toBe("IN_PROGRESS");
    const notifs = await notifications.listMyNotifications(s.learner, {});
    expect(notifs.items.some((n) => n.type === "COACH_RESPONSE" && n.related_request_id === r.id)).toBe(true);
  });

  it("une demande de précisions renseigne la première réponse", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    await requests.sendMessage(s.coach, r.id, { body: "Pouvez-vous préciser ?", intent: "CLARIFICATION_REQUEST" });
    const req = env.db().coaching_requests.find((x) => x.id === r.id)!;
    expect(req.status).toBe("WAITING_FOR_LEARNER");
    expect(req.first_response_at).not.toBeNull();
  });

  it("REC-07 — dépassement d'échéance : retard calculé, alertes et escalade sans doublon", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId); // échéance jeudi 09 h
    env.set("2026-10-27T14:00:00.000Z"); // 50 %
    await env.jobs();
    env.set("2026-10-28T13:00:00.000Z"); // > 75 %
    await env.jobs();
    env.set("2026-10-29T09:30:00.000Z"); // en retard
    await env.jobs();
    await relogin(s);
    const list = await requests.listRequests(s.coach, { view: "overdue" });
    expect(list.items.map((x) => x.id)).toContain(r.id);
    expect(env.db().coaching_requests.find((x) => x.id === r.id)!.status).toBe("SUBMITTED"); // statut métier intact
    env.set("2026-10-29T17:00:00.000Z"); // 7 h ouvrées de retard : pas encore d'escalade
    await env.jobs();
    expect(env.db().notifications.filter((n) => n.type === "ESCALATION")).toHaveLength(0);
    env.set("2026-10-30T09:00:00.000Z"); // > 8 h ouvrées de retard
    await env.jobs();
    await env.jobs();
    const db = env.db();
    const coachTypes = db.notifications.filter((n) => n.user_id === s.coach.id).map((n) => n.type);
    expect(coachTypes.filter((t) => t === "DEADLINE_REMINDER")).toHaveLength(2);
    expect(coachTypes.filter((t) => t === "REQUEST_OVERDUE")).toHaveLength(1);
    expect(db.notifications.filter((n) => n.type === "ESCALATION" && n.user_id === s.admin.id)).toHaveLength(1);
  });

  it("aucun rappel après une première réponse humaine", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    await requests.sendMessage(s.coach, r.id, { body: "Réponse rapide.", intent: "MESSAGE" });
    env.set("2026-11-05T09:00:00.000Z");
    await env.jobs();
    expect(env.db().notifications.filter((n) => ["DEADLINE_REMINDER", "REQUEST_OVERDUE", "ESCALATION"].includes(n.type))).toHaveLength(0);
  });

  it("REC-15 — une modification du calendrier ne change pas les échéances existantes", async () => {
    const s = await standardSetup(env);
    const before = await submitNew(s.learner, s.categoryId);
    await settings.updateServicePolicy(s.admin, {
      timezone: "Africa/Abidjan",
      working_days: [1, 2, 3, 4, 5],
      periods: [{ start: "08:00", end: "16:00" }],
      response_target_hours: 8,
      reminder_50_enabled: true,
      reminder_75_enabled: false,
      overdue_escalation_hours: 4,
      reason: "Nouveau contrat de service",
    });
    expect(env.db().coaching_requests.find((x) => x.id === before.id)!.due_at).toBe(before.due_at);
    const after = await submitNew(s.learner, s.categoryId);
    expect(after.due_at).toBe("2026-10-27T09:00:00.000Z"); // 09h + 8 h ouvrées sur 08h–16h
    expect(env.db().audit_logs.some((l) => l.action === "SERVICE_POLICY_UPDATED")).toBe(true);
  });
});

describe("Notifications e-mail", () => {
  it("REC-08 — échec d'e-mail : la demande reste enregistrée, l'envoi peut être réessayé", async () => {
    const s = await standardSetup(env, { learnerEmail: "learner@echec.test" });
    const r = await submitNew(s.learner, s.categoryId);
    for (let i = 0; i < 6; i++) {
      env.advanceMinutes(240);
      await env.jobs();
    }
    const db = env.db();
    expect(db.coaching_requests.find((x) => x.id === r.id)!.status).toBe("SUBMITTED");
    const failed = db.email_delivery_logs.filter((e) => e.recipient === "learner@echec.test" && e.status === "FAILED");
    expect(failed.length).toBeGreaterThan(0);
    expect(db.notifications.some((n) => n.type === "NOTIFICATION_FAILURE" && n.user_id === s.admin.id)).toBe(true);
    await relogin(s, "learner@echec.test");
    await notifications.retryEmail(s.admin, failed[0]!.id);
    const retried = env.db().email_delivery_logs.find((e) => e.id === failed[0]!.id)!;
    expect(["RETRY", "FAILED"]).toContain(retried.status);
    expect(retried.attempt_count).toBe(1);
    expect(env.db().audit_logs.some((l) => l.action === "EMAIL_RETRY_REQUESTED")).toBe(true);
  });

  it("les e-mails ne contiennent jamais le contenu des messages privés", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    await requests.sendMessage(s.coach, r.id, { body: "SECRET-CONTENU-PRIVE", intent: "MESSAGE" });
    await env.jobs();
    const db = env.db();
    expect(JSON.stringify(db.email_delivery_logs)).not.toContain("SECRET-CONTENU-PRIVE");
    expect(JSON.stringify(db.demo_mailbox)).not.toContain("SECRET-CONTENU-PRIVE");
    expect(db.demo_mailbox.length).toBeGreaterThan(0);
  });
});

describe("Permissions et confidentialité", () => {
  it("REC-09 — coach non responsable : accès refusé côté serveur", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    await expectCode(requests.getRequestDetail(s.coach2, r.id), "FORBIDDEN");
    await expectCode(requests.sendMessage(s.coach2, r.id, { body: "Intrusion" }), "FORBIDDEN");
    const list = await requests.listRequests(s.coach2, {});
    expect(list.items.map((x) => x.id)).not.toContain(r.id);
    await expectCode(requests.getRequestDetail(s.learner2, r.id), "FORBIDDEN");
  });

  it("REC-16 — l'apprenant ne peut pas accéder aux notes internes", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    await requests.addNote(s.coach, r.id, { body: "Note privée du coach" });
    const detail = await requests.getRequestDetail(s.learner, r.id);
    expect(detail.notes).toBeNull();
    expect(JSON.stringify(detail)).not.toContain("Note privée du coach");
    await expectCode(requests.listNotes(s.learner, r.id), "FORBIDDEN");
    await expectCode(requests.addNote(s.learner, r.id, { body: "x" }), "FORBIDDEN");
    expect((await requests.getRequestDetail(s.admin, r.id)).notes).toHaveLength(1);
  });

  it("REC-17 — téléchargement d'une pièce jointe sans permission : refusé", async () => {
    const s = await standardSetup(env);
    const d = await requests.createDraft(s.learner, { category_id: s.categoryId, subject: "Avec pièce jointe", description: "Description suffisamment détaillée de la question." }, [{ name: "releve.pdf", data: pdf() }]);
    await requests.submitRequest(s.learner, d.id, { idempotencyKey: "with-file-1" });
    const att = env.db().message_attachments[0]!;
    await expectCode(requests.downloadAttachment(s.learner2, att.id), "FORBIDDEN");
    await expectCode(requests.downloadAttachment(s.coach2, att.id), "FORBIDDEN");
    const ok = await requests.downloadAttachment(s.coach, att.id);
    expect(ok.filename).toBe("releve.pdf");
    expect(att.storage_key).not.toContain("releve");
  });

  it("refuse un fichier dont le contenu ne correspond pas à l'extension", async () => {
    const s = await standardSetup(env);
    const fake = new TextEncoder().encode("MZ executable déguisé").buffer as ArrayBuffer;
    await expectCode(
      requests.createDraft(s.learner, { category_id: s.categoryId, subject: "Fichier piégé", description: "Description suffisamment détaillée de la question." }, [{ name: "facture.pdf", data: fake }]),
      "VALIDATION",
    );
    await expectCode(
      requests.createDraft(s.learner, { category_id: s.categoryId, subject: "Fichier piégé", description: "Description suffisamment détaillée de la question." }, [{ name: "outil.exe", data: pdf() }]),
      "VALIDATION",
    );
    expect(env.db().coaching_requests).toHaveLength(0);
  });

  it("REC-14 — désactivation d'un compte : l'historique reste consultable", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    await requests.sendMessage(s.coach, r.id, { body: "Réponse avant suspension" });
    await users.setUserStatus(s.admin, s.learner.id, { action: "SUSPEND", reason: "Fin d'abonnement" });
    await expectCode(auth.login({ email: "learner1@test.example", password: PASSWORD }), "FORBIDDEN");
    await expectCode(requests.listRequests(s.learner, {}), "UNAUTHENTICATED"); // session révoquée
    const detail = await requests.getRequestDetail(s.admin, r.id);
    expect(detail.messages.some((m) => m.body === "Réponse avant suspension")).toBe(true);
    expect((await requests.getRequestDetail(s.coach, r.id)).learner.full_name).toBe("Apprenant Un");
    expect((await users.getUserDetail(s.admin, s.learner.id)).stats.requests_total).toBe(1);
  });

  it("un coach ne peut pas réaliser d'actions administratives", async () => {
    const s = await standardSetup(env);
    await expectCode(users.listUsers(s.coach, {}), "FORBIDDEN");
    const e = env.db().coaching_entitlements[0]!;
    await expectCode(ent.correctQuota(s.coach, e.id, { quantity: 1, reason: "Tentative" }), "FORBIDDEN");
  });
});

describe("Clôture, réouverture, cycles et évaluations", () => {
  async function closedRequest() {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    await requests.sendMessage(s.coach, r.id, { body: "Réponse complète.", intent: "FINAL_RESPONSE" });
    await requests.closeRequest(s.coach, r.id, {});
    return { s, r };
  }

  it("REC-10 — réouverture admin : motif exigé, historique conservé, nouveau cycle", async () => {
    const { s, r } = await closedRequest();
    await expectCode(requests.reopenRequest(s.admin, r.id, { reason: "" }), "VALIDATION");
    env.advanceMinutes(60);
    await requests.reopenRequest(s.admin, r.id, { reason: "Question complémentaire" });
    const d = await requests.getRequestDetail(s.admin, r.id);
    expect(d.status).toBe("WAITING_FOR_COACH");
    expect(d.cycle_number).toBe(2);
    expect(d.cycles).toHaveLength(2);
    expect(d.cycles[0]!.closed_at).not.toBeNull();
    expect(d.messages.some((m) => m.body === "Réponse complète.")).toBe(true);
    expect(d.status_history.some((h) => h.new_status === "CLOSED" && h.cycle_number === 1)).toBe(true);
    expect(d.first_response_at).toBeNull();
    expect(env.db().audit_logs.some((l) => l.action === "REQUEST_REOPENED" && l.reason === "Question complémentaire")).toBe(true);
  });

  it("REC-11 — un apprenant ne peut pas réouvrir ; un coach non plus", async () => {
    const { s, r } = await closedRequest();
    await expectCode(requests.reopenRequest(s.learner, r.id, { reason: "Je veux réouvrir" }), "FORBIDDEN");
    await expectCode(requests.reopenRequest(s.coach, r.id, { reason: "Je veux réouvrir" }), "FORBIDDEN");
  });

  it("REC-12 / REC-13 — évaluation liée au bon cycle et conservée après réouverture", async () => {
    const { s, r } = await closedRequest();
    await requests.rateRequest(s.learner, r.id, { score: 4, comment: "Très utile" });
    await expectCode(requests.rateRequest(s.learner, r.id, { score: 5 }), "CONFLICT");
    expect(env.db().coaching_ratings[0]).toMatchObject({ cycle_number: 1, coach_id: s.coach.id, score: 4 });
    await requests.reopenRequest(s.admin, r.id, { reason: "Complément" });
    await requests.sendMessage(s.coach, r.id, { body: "Complément de réponse.", intent: "FINAL_RESPONSE" });
    await requests.closeRequest(s.coach, r.id, {});
    await requests.rateRequest(s.learner, r.id, { score: 5 });
    const ratings = env.db().coaching_ratings;
    expect(ratings.map((x) => [x.cycle_number, x.score])).toEqual([[1, 4], [2, 5]]);
  });

  it("l'apprenant ne peut clôturer que si le paramètre l'autorise", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    await requests.sendMessage(s.coach, r.id, { body: "Réponse finale", intent: "FINAL_RESPONSE" });
    await expectCode(requests.closeRequest(s.learner, r.id, {}), "FORBIDDEN");
  });
});

describe("Réaffectation et droits expirés", () => {
  it("REC-18 — réaffectation : nouveau responsable enregistré, messages conservés", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    await requests.sendMessage(s.coach, r.id, { body: "Premier échange" });
    await requests.reassignRequest(s.admin, r.id, { coachId: s.coach2.id, reason: "Absence prolongée" });
    const d = await requests.getRequestDetail(s.coach2, r.id);
    expect(d.coach?.id).toBe(s.coach2.id);
    expect(d.messages.some((m) => m.body === "Premier échange")).toBe(true);
    expect(d.assignment_history[0]).toMatchObject({ old_coach_id: s.coach.id, new_coach_id: s.coach2.id, reason: "Absence prolongée" });
    await expectCode(requests.sendMessage(s.coach, r.id, { body: "Ancien coach" }), "FORBIDDEN");
    await expectCode(requests.getRequestDetail(s.coach, r.id), "FORBIDDEN");
    expect(d.due_at).toBe(r.due_at);
  });

  it("REC-19 — droit expiré avec demande ouverte : la demande reste traitable", async () => {
    const s = await standardSetup(env);
    const r = await submitNew(s.learner, s.categoryId);
    const e = env.db().coaching_entitlements.find((x) => x.learner_id === s.learner.id && !x.superseded_at)!;
    await ent.setEntitlementStatus(s.admin, e.id, { action: "REVOKE", reason: "Fin de formule" });
    await requests.sendMessage(s.coach, r.id, { body: "Je continue le traitement." });
    await requests.sendMessage(s.learner, r.id, { body: "Merci." });
    expect((await requests.getRequestDetail(s.learner, r.id)).messages.length).toBeGreaterThanOrEqual(3);
    const d = await newDraft(s.learner, s.categoryId);
    await expectCode(requests.submitRequest(s.learner, d.id, { idempotencyKey: "after-expiry" }), "BUSINESS_RULE");
  });
});

describe("Authentification", () => {
  it("verrouille après 5 échecs sans révéler l'existence du compte", async () => {
    await standardSetup(env);
    for (let i = 0; i < 5; i++) await expectCode(auth.login({ email: "learner1@test.example", password: "mauvais-mdp-1" }), "UNAUTHENTICATED");
    await expectCode(auth.login({ email: "learner1@test.example", password: PASSWORD }), "RATE_LIMITED");
    env.advanceMinutes(16);
    await login("learner1@test.example");
    const e = (await expectCode(auth.login({ email: "inconnu@test.example", password: "mauvais-mdp-1" }), "UNAUTHENTICATED")) as Error;
    expect(e.message).toBe("Adresse e-mail ou mot de passe incorrect.");
  });

  it("réinitialisation du mot de passe : jeton à usage unique, sessions révoquées", async () => {
    const s = await standardSetup(env);
    const res = await auth.requestPasswordReset({ email: "learner1@test.example" });
    const unknown = await auth.requestPasswordReset({ email: "inconnu@test.example" });
    expect(res.message).toBe(unknown.message);
    const link = env.db().email_delivery_logs.filter((e) => e.template_key === "PASSWORD_RESET").pop()!.template_params.link!;
    const token = new URL(link, "http://x").searchParams.get("token")!;
    await auth.completeToken({ token, purpose: "PASSWORD_RESET", password: "Nouveau-mdp-2027" });
    await expectCode(auth.completeToken({ token, purpose: "PASSWORD_RESET", password: "Encore-mdp-2028" }), "BUSINESS_RULE");
    await expectCode(requests.listRequests(s.learner, {}), "UNAUTHENTICATED");
    await login("learner1@test.example", "Nouveau-mdp-2027");
  });

  it("session expirée après inactivité", async () => {
    const s = await standardSetup(env);
    env.advanceMinutes(121);
    await expectCode(requests.listRequests(s.learner, {}), "SESSION_EXPIRED");
  });

  it("le premier administrateur ne peut être créé qu'une fois", async () => {
    await standardSetup(env);
    await expectCode(auth.bootstrapAdmin({ full_name: "Intrus", email: "intrus@test.example", password: PASSWORD }), "BUSINESS_RULE");
  });
});
