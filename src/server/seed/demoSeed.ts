/**
 * Jeu de démonstration (PRD §18). Créé UNIQUEMENT par l'action explicite « Charger la démo ».
 *
 * Les données ne sont pas écrites à la main : le scénario REJOUE les vraies opérations métier
 * (création de comptes, affectations, droits, soumissions, réponses, clôtures, réouverture,
 * évaluations, tâches planifiées) sur une horloge simulée dans un runtime isolé.
 * Historiques, registre de quota, échéances et notifications sont donc cohérents.
 *
 * Les comptes de démonstration ont un mot de passe connu : ne jamais charger en production.
 */
import type { Database } from "@/modules/core/types";
import { workingMinutesBetween } from "@/modules/deadlines/businessHours";
import { hashPassword, newId, randomToken, sha256 } from "../crypto";
import type { StoredFile } from "../files/fileStore";
import { createMemoryRuntime, swapRuntime } from "../runtime";
import * as assignments from "../api/assignments";
import * as auth from "../api/auth";
import * as coaches from "../api/coaches";
import * as ent from "../api/entitlements";
import * as requests from "../api/requests";
import * as settings from "../api/settings";
import * as users from "../api/users";
import { catchUpJobs, resetJobThrottle } from "../api/context";

export const DEMO_PASSWORD = "Demo-Coaching-2026";
const DOMAIN = "coaching-demo.example";

const ABIDJAN = {
  timezone: "Africa/Abidjan",
  working_days: [1, 2, 3, 4, 5],
  periods: [
    { start: "08:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
  ],
  holidays: [] as string[],
};

/** Instant situé `hours` heures ouvrées avant `now` (recherche dichotomique). */
function workingHoursAgo(now: number, hours: number): number {
  const target = hours * 60;
  let lo = now - 120 * 86_400_000;
  let hi = now;
  for (let i = 0; i < 60; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const w = workingMinutesBetween(new Date(mid), new Date(now), ABIDJAN);
    if (w > target) lo = mid;
    else hi = mid;
  }
  return hi;
}

function minimalPdf(title: string): ArrayBuffer {
  const text = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 60>>stream\nBT /F1 14 Tf 60 780 Td (${title}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function csvFile(content: string): ArrayBuffer {
  return new TextEncoder().encode(content).buffer as ArrayBuffer;
}

export async function buildDemoDatabase(realNow: number): Promise<{ db: Database; files: Map<string, StoredFile> }> {
  let virtual = realNow - 35 * 86_400_000;
  const rt = createMemoryRuntime(() => virtual);
  const previous = swapRuntime(rt);
  try {
    const setTime = async (t: number) => {
      if (t < virtual) throw new Error("Scénario de démonstration non chronologique.");
      virtual = t;
      resetJobThrottle();
      await catchUpJobs(true);
    };
    const wh = (h: number) => setTime(workingHoursAgo(realNow, h));
    /** Session technique à l'instant simulé (évite de rejouer le hachage du mot de passe). */
    const as = async (userId: string) => {
      const token = randomToken();
      const hash = await sha256(token);
      await rt.store.transaction((db, now) => {
        db.sessions.push({ id: newId("ses"), token_hash: hash, user_id: userId, created_at: now.toISOString(), last_seen_at: now.toISOString(), expires_at: new Date(now.getTime() + 3600_000).toISOString(), revoked_at: null });
      });
      return { token };
    };
    const key = () => randomToken(12);

    // ------------------------------------------------------------ socle
    await auth.bootstrapAdmin({ full_name: "Aïcha Koné", email: `admin@${DOMAIN}`, password: DEMO_PASSWORD });
    const adminId = rt.store.snapshot().users[0]!.id;
    let admin = await as(adminId);

    for (const [date, label] of [
      ["2026-08-07", "Fête de l’Indépendance"],
      ["2026-11-01", "Toussaint"],
      ["2026-11-15", "Journée nationale de la Paix"],
      ["2026-12-25", "Noël"],
      ["2027-01-01", "Jour de l’An"],
    ] as const) {
      await settings.addHoliday(admin, { holiday_date: date, label });
    }

    const pwd = await hashPassword(DEMO_PASSWORD);
    const createActive = async (full_name: string, local: string, role: "COACH" | "LEARNER", activate = true) => {
      const u = await users.createUser(admin, { full_name, email: `${local}`.includes("@") ? local : `${local}@${DOMAIN}`, role });
      await rt.store.transaction((db, now) => {
        const user = db.users.find((x) => x.id === u.id)!;
        user.is_demo = true;
        if (!activate) return;
        user.status = "ACTIVE";
        db.credentials.push({ user_id: user.id, password_hash: pwd.hash, salt: pwd.salt, iterations: pwd.iterations, updated_at: now.toISOString() });
        for (const t of db.auth_tokens) if (t.user_id === user.id) t.used_at = now.toISOString();
      });
      return u.id;
    };
    await rt.store.transaction((db) => {
      db.users[0]!.is_demo = true;
    });

    const moussa = await createActive("Moussa Diabaté", "moussa.diabate", "COACH");
    const fatou = await createActive("Fatou Ndiaye", "fatou.ndiaye", "COACH");
    const kouadio = await createActive("Kouadio Yao", "kouadio.yao", "LEARNER");
    const mariam = await createActive("Mariam Traoré", "mariam.traore", "LEARNER");
    const ibrahim = await createActive("Ibrahim Sanogo", "ibrahim.sanogo", "LEARNER");
    const awa = await createActive("Awa Coulibaly", "awa.coulibaly", "LEARNER");
    // Adresse volontairement en échec : illustre les incidents d'envoi et les relances (REC-08).
    const serge = await createActive("Serge N’Guessan", "serge.nguessan@echec.test", "LEARNER");
    const aminata = await createActive("Aminata Diallo", "aminata.diallo", "LEARNER");
    const jeanmarc = await createActive("Jean-Marc Kouassi", "jeanmarc.kouassi", "LEARNER");
    await createActive("Clarisse Bamba", "clarisse.bamba", "LEARNER", false); // invitation en attente

    // Profils et disponibilités des coachs
    let c1 = await as(moussa);
    await coaches.updateMyCoachProfile(c1, {
      bio: "Coach en développement professionnel, 12 ans d’expérience. Accompagne les personnes qui préparent une évolution de carrière ou un projet de reconversion.",
      specialties: ["Objectifs de carrière", "Organisation", "Prise de décision"],
    });
    for (const d of [1, 2, 3, 4]) await coaches.addAvailability(c1, { day_of_week: d, start_time: "09:00", end_time: "12:00" });
    await coaches.addAvailability(c1, { day_of_week: 5, start_time: "14:00", end_time: "17:00" });
    let c2 = await as(fatou);
    await coaches.updateMyCoachProfile(c2, {
      bio: "Ancienne responsable d’équipe, formatrice en méthodes de travail. Spécialiste de l’organisation, de la gestion du temps et du suivi des progrès.",
      specialties: ["Gestion du temps", "Méthode de travail", "Suivi des progrès"],
    });
    for (const d of [1, 3, 5]) await coaches.addAvailability(c2, { day_of_week: d, start_time: "08:00", end_time: "12:00" });
    await coaches.addAvailability(c2, { day_of_week: 2, start_time: "13:00", end_time: "17:00" });

    // Affectations
    for (const l of [kouadio, mariam, ibrahim]) await assignments.assignCoach(admin, { learnerId: l, coachId: moussa, reason: "Affectation initiale" });
    for (const l of [awa, serge, aminata]) await assignments.assignCoach(admin, { learnerId: l, coachId: fatou, reason: "Affectation initiale" });

    // Droits : avec et sans quota, expiration, droit sans coach
    const start = new Date(virtual).toISOString();
    const in90 = new Date(realNow + 90 * 86_400_000).toISOString();
    await ent.grantEntitlement(admin, { learnerId: kouadio, starts_at: start, expires_at: in90, quota_enabled: false, reason: "Formule Accompagnement illimité" });
    await ent.grantEntitlement(admin, { learnerId: mariam, starts_at: start, expires_at: in90, quota_enabled: true, quota_limit: 5, reason: "Formule 5 demandes" });
    await ent.grantEntitlement(admin, { learnerId: ibrahim, starts_at: start, expires_at: in90, quota_enabled: true, quota_limit: 3, reason: "Formule découverte 3 demandes" });
    await ent.grantEntitlement(admin, { learnerId: awa, starts_at: start, expires_at: new Date(realNow + 40 * 86_400_000).toISOString(), quota_enabled: true, quota_limit: 10, reason: "Formule 10 demandes" });
    await ent.grantEntitlement(admin, { learnerId: serge, starts_at: start, expires_at: null, quota_enabled: false, reason: "Membre fondateur" });
    await ent.grantEntitlement(admin, { learnerId: aminata, starts_at: start, expires_at: in90, quota_enabled: true, quota_limit: 4, reason: "Formule 4 demandes" });
    await ent.grantEntitlement(admin, { learnerId: jeanmarc, starts_at: start, expires_at: in90, quota_enabled: false, reason: "En attente d’affectation d’un coach" });

    // Absence passée de Fatou
    await setTime(realNow - 26 * 86_400_000);
    c2 = await as(fatou);
    await coaches.addAbsence(c2, { starts_at: new Date(realNow - 24 * 86_400_000).toISOString(), ends_at: new Date(realNow - 22 * 86_400_000).toISOString(), reason: "Formation" });

    const categories = rt.store.snapshot().coaching_categories;
    const cat = (i: number) => categories[i]!.id;

    const draftAndSubmit = async (learnerId: string, category: string, subject: string, description: string, files?: Array<{ name: string; data: ArrayBuffer }>) => {
      const l = await as(learnerId);
      const d = await requests.createDraft(l, { category_id: category, subject, description }, files);
      await requests.submitRequest(l, d.id, { idempotencyKey: key() });
      return d.id;
    };
    const say = async (userId: string, reqId: string, body: string, intent: "MESSAGE" | "CLARIFICATION_REQUEST" | "FINAL_RESPONSE" = "MESSAGE", files?: Array<{ name: string; data: ArrayBuffer }>) =>
      requests.sendMessage(await as(userId), reqId, { body, intent }, files);
    const view = async (userId: string, reqId: string) => requests.getRequestDetail(await as(userId), reqId);

    /** Étapes planifiées (heures ouvrées avant maintenant), exécutées dans l'ordre chronologique. */
    const steps: Array<[number, () => Promise<void>]> = [];
    const at = (hours: number, fn: () => Promise<void>) => void steps.push([hours, fn]);
    const R: Record<string, string> = {};
    // ------------------------------------------------------------ R1 : parcours complet, évalué 5/5
    at(120, async () => {
      R.r1 = await draftAndSubmit(
        kouadio,
        cat(0),
        "Définir un objectif réaliste pour les six prochains mois",
        "Je souhaite changer de poste dans l’année mais mes objectifs me semblent flous. Pouvez-vous m’aider à formuler un objectif réaliste et à le découper en étapes ?",
        [{ name: "plan-objectifs-brouillon.pdf", data: minimalPdf("Brouillon de plan d'objectifs - document de demonstration") }],
      );
    });
    at(118, async () => {
      await view(moussa, R.r1!);
    });
    at(116, async () => {
      await say(moussa, R.r1!, "Bonjour Kouadio. Pour bien vous répondre : à quelle échéance souhaitez-vous changer de poste, et qu’avez-vous déjà entrepris (formation, candidatures, réseau) ?", "CLARIFICATION_REQUEST");
    });
    at(112, async () => {
      await say(kouadio, R.r1!, "Je vise la fin de l’année. J’ai mis à jour mon CV mais je n’ai encore contacté personne.");
    });
    at(110, async () => {
      await say(
        moussa,
        R.r1!,
        "Merci. Voici une proposition en trois étapes : 1) préciser le poste visé et trois critères non négociables, 2) contacter deux personnes de votre réseau chaque semaine pendant un mois, 3) faire le point à la fin du mois pour ajuster. Il s’agit d’une proposition de méthode : adaptez-la à votre situation.",
        "FINAL_RESPONSE",
      );
    });
    at(108, async () => {
      await requests.closeRequest(await as(moussa), R.r1!, { reason: "Mécanisme expliqué" });
    });
    at(107, async () => {
      await requests.rateRequest(await as(kouadio), R.r1!, { score: 5, comment: "Explication très claire, merci !" });

    });
    // ------------------------------------------------------------ R8 : évaluée 3/5 (Fatou)
    at(100, async () => {
      R.r8 = await draftAndSubmit(awa, cat(1), "Organiser ma semaine de travail", "Mes journées sont souvent absorbées par les urgences et je n’avance pas sur mes sujets importants. Comment organiser ma semaine pour mieux protéger mon temps ?");
    });
    at(96, async () => {
      await say(fatou, R.r8!, "Bonjour Awa. Une méthode simple consiste à réserver chaque semaine deux créneaux protégés pour vos sujets importants et à regrouper les tâches courtes. Qu’est-ce qui vous interrompt le plus souvent ?");
    });
    at(94, async () => {
      await say(awa, R.r8!, "Surtout les messages et les demandes de collègues qui arrivent à tout moment.");
    });
    at(90, async () => {
      await say(fatou, R.r8!, "Dans ce cas, fixez deux ou trois moments par jour pour traiter les messages, et signalez vos créneaux protégés à votre équipe. Faites un essai d’une semaine, puis ajustez selon ce qui a fonctionné.", "FINAL_RESPONSE");
    });
    at(89, async () => {
      await requests.closeRequest(await as(fatou), R.r8!, {});
    });
    at(88, async () => {
      await requests.rateRequest(await as(awa), R.r8!, { score: 3, comment: "Réponse utile, mais j’aurais aimé un exemple de planning." });

    });
    // ------------------------------------------------------------ R2 : clôturée, évaluée, puis réouverte (cycle 2)
    at(90, async () => {
      R.r2 = await draftAndSubmit(mariam, cat(2), "Choisir entre deux opportunités professionnelles", "On me propose deux postes différents et j’hésite. Comment structurer ma réflexion et quels critères prendre en compte ?");
    });
    at(72, async () => {
      await view(moussa, R.r2!);
      await say(moussa, R.r2!, "Bonjour Mariam. Une méthode consiste à lister vos critères (apprentissage, rémunération, équilibre de vie, perspectives), à les classer par importance puis à noter chaque option. Nous pouvons détailler chaque critère.", "FINAL_RESPONSE");
    });
    at(68, async () => {
      await requests.closeRequest(await as(moussa), R.r2!, {});
    });
    at(67, async () => {
      await requests.rateRequest(await as(mariam), R.r2!, { score: 4, comment: "Bonne méthode de réflexion." });

    });
    // ------------------------------------------------------------ R11 : annulée par l'apprenant (quota non remboursé)
    at(60, async () => {
      R.r11 = await draftAndSubmit(kouadio, cat(4), "Question en double", "Je me suis trompé, cette question est la même que ma précédente demande sur mon objectif.");
    });
    at(59.5, async () => {
      await requests.cancelRequest(await as(kouadio), R.r11!, { reason: "Question posée par erreur (doublon)" });

    });
    // ------------------------------------------------------------ R13 : réaffectée à Fatou
    at(50, async () => {
      R.r13 = await draftAndSubmit(kouadio, cat(0), "Construire un plan d’action en trois étapes", "J’ai un objectif mais je ne sais pas par où commencer. Comment le découper en actions concrètes avec des dates ?");
    });
    at(49, async () => {
      admin = await as(adminId);
      await requests.reassignRequest(admin, R.r13!, { coachId: fatou, reason: "Expertise spécifique sur la construction de plans d’action" });
    });
    at(45, async () => {
      await say(fatou, R.r13!, "Bonjour Kouadio, je reprends votre demande. S’agit-il d’un objectif personnel ou professionnel, et avez-vous une date limite ?", "CLARIFICATION_REQUEST");
    });
    at(44, async () => {
      await say(kouadio, R.r13!, "Professionnel, avec une échéance dans quatre mois.");
    });
    at(42, async () => {
      await say(fatou, R.r13!, "Très bien. Je vous prépare un modèle de plan d’action avec des jalons mensuels.");

    });
    // ------------------------------------------------------------ R3 : en retard + escalade
    at(45, async () => {
      R.r3 = await draftAndSubmit(ibrahim, cat(3), "Gérer un découragement face à une difficulté", "Je bloque depuis plusieurs semaines sur une difficulté et je commence à me décourager. Comment analyser la situation avant de décider de continuer ou de changer d’approche ? Quelles questions dois-je me poser ?");

    });
    // ------------------------------------------------------------ R2 : réouverture administrative (cycle 2)
    at(40, async () => {
      admin = await as(adminId);
      await requests.reopenRequest(admin, R.r2!, { reason: "L’apprenante signale une question complémentaire restée sans réponse sur les critères de choix." });
    });
    at(36, async () => {
      await view(moussa, R.r2!);
      await say(moussa, R.r2!, "Bonjour Mariam, je reprends votre demande suite à la réouverture. Quelle est votre question complémentaire sur les critères ?");
    });
    at(34, async () => {
      await say(mariam, R.r2!, "Comment départager deux options qui obtiennent presque le même score ?");

    });
    // ------------------------------------------------------------ R4 : en attente de l'apprenant
    at(30, async () => {
      R.r4 = await draftAndSubmit(ibrahim, cat(1), "Prioriser mes tâches quand tout paraît urgent", "Mon responsable me donne plusieurs tâches urgentes en même temps. Comment les prioriser et en discuter avec lui ?");
    });
    at(29.5, async () => {
      admin = await as(adminId);
      await requests.setPriority(admin, R.r3!, { priority: "URGENT", reason: "Escalade : apprenant inquiet, aucune réponse" });
    });
    at(29, async () => {
      await view(moussa, R.r4!);
    });
    at(27, async () => {
      await say(moussa, R.r4!, "Bonjour Ibrahim. Avant de détailler, quelles sont les tâches concernées et quelles échéances vous ont été données ?", "CLARIFICATION_REQUEST");

    });
    // ------------------------------------------------------------ R5 : réponse apportée, en attente de clôture (quota épuisé)
    at(20, async () => {
      R.r5 = await draftAndSubmit(ibrahim, cat(0), "Mesurer mes progrès avec un indicateur simple", "Comment choisir un indicateur simple pour savoir si j’avance vraiment vers mon objectif ?");

    });
    // ------------------------------------------------------------ R12 : échéance proche (rappel 75 %)
    at(19, async () => {
      await draftAndSubmit(mariam, cat(4), "Faire un point mensuel sur mes progrès", "Comment organiser un bilan mensuel utile, et quelles questions me poser pour ajuster mon plan ?");

    });
    // ------------------------------------------------------------ R9 : droit suspendu après soumission (REC-19)
    at(18, async () => {
      R.r9 = await draftAndSubmit(aminata, cat(2), "Décider d’une reconversion professionnelle", "Je pense à me reconvertir mais je crains de me tromper. Comment évaluer mon projet sans tout quitter tout de suite ?");
    });
    at(16, async () => {
      await view(fatou, R.r9!);
      await requests.takeCharge(await as(fatou), R.r9!);
      await requests.addNote(await as(fatou), R.r9!, { body: "Apprenante très motivée. Faire le point sur son plan d’action lors du prochain échange." });
    });
    at(15, async () => {
      await say(moussa, R.r5!, "Bonjour Ibrahim. Choisissez un indicateur que vous pouvez relever chaque semaine, par exemple le nombre d’actions réalisées sur le nombre prévu. Je vous joins un exemple illustratif.", "FINAL_RESPONSE", [
        { name: "exemple-suivi-progres.csv", data: csvFile("Semaine;Actions prévues;Actions réalisées;Taux (%)\n1;5;4;80\n2;5;5;100\n3;5;3;60\n") },
      ]);
      await say(fatou, R.r9!, "Bonjour Aminata. Vous pouvez tester votre projet à petite échelle : rencontrer des professionnels du métier visé, suivre une courte formation ou réaliser une mission test. Cela réduit le risque avant de décider.");
    });
    at(12, async () => {
      admin = await as(adminId);
      const aminataEnt = rt.store.snapshot().coaching_entitlements.find((e) => e.learner_id === aminata && !e.superseded_at)!;
      await ent.setEntitlementStatus(admin, aminataEnt.id, { action: "SUSPEND", reason: "Abonnement non renouvelé — en attente de régularisation" });

    });
    // ------------------------------------------------------------ R6 : en cours
    at(14, async () => {
      R.r6 = await draftAndSubmit(awa, cat(3), "Comment progresser plus vite sur une compétence ?", "Quelles pratiques simples permettent de progresser plus vite sur une compétence nouvelle ?");
    });
    at(10, async () => {
      await say(fatou, R.r6!, "Bonjour Awa. On peut combiner pratique régulière, retours d’une personne expérimentée et objectifs de progression courts. Souhaitez-vous que l’on détaille l’une de ces pratiques ?");
      await requests.addNote(await as(fatou), R.r6!, { body: "Proposer un exercice de mise en pratique sur une compétence ciblée." });
    });
    at(9, async () => {
      await say(awa, R.r6!, "Oui, les retours d’une personne expérimentée m’intéressent particulièrement.");

    });
    // ------------------------------------------------------------ R7 : soumise très récemment ; R10 : brouillon
    at(2, async () => {
      await draftAndSubmit(serge, cat(1), "Mettre en place un tableau de suivi", "Quelles sont les étapes pour mettre en place un tableau de suivi de mes tâches et quels outils utiliser ?");
    });
    at(1, async () => {
      await requests.createDraft(await as(serge), { category_id: cat(4), subject: "Préparer mon bilan de fin d’année", description: "Brouillon : je souhaite préparer un bilan de mes progrès sur l’année." });


    });

    for (const [hours, fn] of steps.map((x, i) => [x, i] as const).sort((a, b) => b[0][0] - a[0][0] || a[1] - b[1]).map(([x]) => x)) {
      await wh(hours);
      await fn();
    }

    // ------------------------------------------------------------ fin : instant réel, absence future de Moussa
    await setTime(realNow);
    c1 = await as(moussa);
    await coaches.addAbsence(c1, { starts_at: new Date(realNow + 5 * 86_400_000).toISOString(), ends_at: new Date(realNow + 7 * 86_400_000).toISOString(), reason: "Congés" });

    const db = structuredClone(rt.store.snapshot());
    db.sessions = [];
    db.login_attempts = [];
    db.meta.demo_seeded = true;
    db.meta.clock_offset_ms = 0;

    const files = new Map<string, StoredFile>();
    for (const att of db.message_attachments) {
      const f = await rt.files.get(att.storage_key);
      if (f) files.set(att.storage_key, f);
    }
    return { db, files };
  } finally {
    swapRuntime(previous);
    resetJobThrottle();
  }
}
