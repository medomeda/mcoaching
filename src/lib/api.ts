"use client";
/**
 * Client d'API. L'interface n'accède JAMAIS directement au stockage : elle passe par ces appels.
 * - Mode démo (NEXT_PUBLIC_DEMO_MODE=true) : façade simulée dans le navigateur ; le jeton de session
 *   est conservé dans sessionStorage (un onglet = une session, pratique pour tester plusieurs rôles).
 * - Mode serveur : POST /api/rpc/<module>/<fonction> (même contrat) sur PostgreSQL, session en cookie
 *   httpOnly BetterAuth ; pièces jointes téléchargées par GET /api/attachments/<id>.
 */
import { z } from "zod";
import { isAppError, type ErrorCode } from "@/modules/core/errors";
import { parse, zEmail } from "@/modules/core/validation";
import * as assignments from "@/server/api/assignments";
import * as auth from "@/server/api/auth";
import * as coaches from "@/server/api/coaches";
import * as demo from "@/server/api/demo";
import * as entitlements from "@/server/api/entitlements";
import * as notifications from "@/server/api/notifications";
import * as reports from "@/server/api/reports";
import * as requests from "@/server/api/requests";
import * as settings from "@/server/api/settings";
import * as users from "@/server/api/users";
import type { Call } from "@/server/api/context";
import { authClient } from "./auth-client";

const TOKEN_KEY = "mcoaching.session";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible : la session ne survivra pas au rechargement */
  }
}

type SessionListener = (code: ErrorCode) => void;
const sessionListeners = new Set<SessionListener>();
export function onSessionLost(l: SessionListener) {
  sessionListeners.add(l);
  return () => sessionListeners.delete(l);
}

function signalLost(e: ApiError): ApiError {
  if (e.code === "UNAUTHENTICATED" || e.code === "SESSION_EXPIRED") for (const l of sessionListeners) l(e.code);
  return e;
}

/** Indique si une session existe, sans déclencher la redirection « session perdue ». */
export async function hasSession(): Promise<boolean> {
  if (DEMO_MODE) return !!getToken();
  const r = await authClient.getSession().catch(() => null);
  return !!r?.data;
}

const latency = () => new Promise((r) => setTimeout(r, 90 + Math.random() * 160));

async function run<T>(fn: () => Promise<T>): Promise<T> {
  await latency();
  try {
    return await fn();
  } catch (e) {
    if (isAppError(e)) {
      throw signalLost(new ApiError(e.code, e.message, e.status, e.fieldErrors));
    }
    console.error(e);
    throw new ApiError("INTERNAL", "Une erreur inattendue est survenue. Réessayez.", 500);
  }
}

type Authed<F> = F extends (call: Call, ...args: infer A) => Promise<infer R> ? (...args: A) => Promise<R> : never;
type Public<F> = F extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<R> : never;

function authed<M extends Record<string, unknown>>(mod: M) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(mod)) {
    if (typeof v === "function") out[k] = (...args: unknown[]) => run(() => (v as (...a: unknown[]) => Promise<unknown>)({ token: getToken() }, ...args));
  }
  return out as { [K in keyof M]: Authed<M[K]> };
}

function pub<M extends Record<string, unknown>>(mod: M) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(mod)) {
    if (typeof v === "function") out[k] = (...args: unknown[]) => run(() => (v as (...a: unknown[]) => Promise<unknown>)(...args));
  }
  return out as { [K in keyof M]: Public<M[K]> };
}

/* ----------------------------- Mode serveur ----------------------------- */

/** Contenu binaire (pièces jointes) transmis en base64 ; décodé par la route RPC. */
function encodeBytes(_key: string, value: unknown) {
  if (!(value instanceof ArrayBuffer)) return value;
  const bytes = new Uint8Array(value);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { $bytes: btoa(bin) };
}

async function rpc<T>(path: string, args: unknown[]): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/rpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ args }, encodeBytes),
    });
  } catch {
    throw new ApiError("INTERNAL", "Le serveur est injoignable. Vérifiez votre connexion.", 0);
  }
  const body = (await res.json().catch(() => null)) as
    | { data: T }
    | { error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string> } }
    | null;
  if (res.ok && body && "data" in body) return body.data;
  const err = body && "error" in body ? body.error : null;
  throw signalLost(new ApiError(err?.code ?? "INTERNAL", err?.message ?? "Une erreur inattendue est survenue. Réessayez.", res.status, err?.fieldErrors));
}

const mutationListeners = new Set<() => void>();

/** Mode serveur : appelé après chaque action d'écriture réussie (pour rafraîchir les listes affichées). */
export function onServerMutation(listener: () => void): () => void {
  mutationListeners.add(listener);
  return () => void mutationListeners.delete(listener);
}

/** Actions d'écriture, nommées une à une : une lecture classée ici par erreur rechargerait les listes en boucle. */
const WRITES = new Set([
  "createUser",
  "updateUser",
  "changeRole",
  "setUserStatus",
  "resendAccess",
  "updateMyProfile",
  "changePassword",
  "completeToken",
  "bootstrapAdmin",
  "updateMyCoachProfile",
  "addAvailability",
  "toggleAvailability",
  "deleteAvailability",
  "addAbsence",
  "cancelAbsence",
  "assignCoach",
  "endAssignment",
  "grantEntitlement",
  "updateEntitlement",
  "setEntitlementStatus",
  "correctQuota",
  "refundRequestQuota",
  "createDraft",
  "updateDraft",
  "abandonDraft",
  "submitRequest",
  "cancelRequest",
  "sendMessage",
  "takeCharge",
  "closeRequest",
  "reopenRequest",
  "rateRequest",
  "addNote",
  "reassignRequest",
  "recalculateDue",
  "setPriority",
  "nudgeCoach",
  "updateServicePolicy",
  "addHoliday",
  "removeHoliday",
  "updateAppSettings",
  "saveCategory",
  "moveCategory",
  "markNotificationRead",
  "markAllNotificationsRead",
  "retryEmail",
  "runJobsNow",
]);

function live<M extends Record<string, unknown>>(module: string, mod: M) {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(mod))
    out[k] = async (...args: unknown[]) => {
      const r = await rpc(`${module}/${k}`, args);
      if (WRITES.has(k)) mutationListeners.forEach((l) => l());
      return r;
    };
  return out as { [K in keyof M]: Authed<M[K]> };
}

/** Validation locale (mêmes schémas que le serveur) convertie en ApiError. */
function check<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (isAppError(e)) throw new ApiError(e.code, e.message, e.status, e.fieldErrors);
    throw e;
  }
}

/** Erreurs des routes BetterAuth (/api/auth/*) traduites dans le contrat de l'application. */
function authError(e: { status: number; message?: string }): ApiError {
  if (e.status === 429) return new ApiError("RATE_LIMITED", e.message ?? "Trop de tentatives. Réessayez dans 15 minutes.", 429);
  if (e.status === 403) return new ApiError("FORBIDDEN", e.message ?? "Accès refusé.", 403);
  if (e.status === 401) return new ApiError("UNAUTHENTICATED", "Adresse e-mail ou mot de passe incorrect.", 401);
  return new ApiError("INTERNAL", "Une erreur inattendue est survenue. Réessayez.", e.status || 500);
}

const RESET_MESSAGE = "Si un compte actif correspond à cette adresse, un e-mail de réinitialisation vient d’être envoyé.";

const demoAuth = {
    systemStatus: () => run(auth.systemStatus),
    bootstrapAdmin: (i: unknown) => run(() => auth.bootstrapAdmin(i)),
    login: async (i: unknown) => {
      const r = await run(() => auth.login(i));
      setToken(r.token);
      return r.user;
    },
    logout: async () => {
      await run(() => auth.logout({ token: getToken() })).catch(() => undefined);
      setToken(null);
    },
    me: () => run(() => auth.me({ token: getToken() })),
    requestPasswordReset: (i: unknown) => run(() => auth.requestPasswordReset(i)),
    inspectToken: (i: unknown) => run(() => auth.inspectToken(i)),
    completeToken: (i: unknown) => run(() => auth.completeToken(i)),
    changePassword: (i: unknown) => run(() => auth.changePassword({ token: getToken() }, i)),
    updateMyProfile: (i: unknown) => run(() => auth.updateMyProfile({ token: getToken() }, i)),
};

const serverAuth: typeof demoAuth = {
  systemStatus: () => rpc("auth/systemStatus", []),
  bootstrapAdmin: (i) => rpc("auth/bootstrapAdmin", [i]),
  login: async (i) => {
    const data = check(() => parse(z.object({ email: zEmail, password: z.string().min(1, "Le mot de passe est requis.").max(128) }), i));
    const r = await authClient.signIn.email({ email: data.email, password: data.password });
    if (r.error) throw authError(r.error);
    return rpc("auth/me", []);
  },
  logout: async () => {
    await authClient.signOut().catch(() => undefined);
  },
  me: () => rpc("auth/me", []),
  requestPasswordReset: async (i) => {
    const data = check(() => parse(z.object({ email: zEmail }), i));
    const r = await authClient.requestPasswordReset({ email: data.email, redirectTo: "/reset-password" });
    if (r.error) throw authError(r.error);
    return { message: RESET_MESSAGE };
  },
  inspectToken: (i) => rpc("auth/inspectToken", [i]),
  completeToken: (i) => rpc("auth/completeToken", [i]),
  changePassword: (i) => rpc("auth/changePassword", [i]),
  updateMyProfile: (i) => rpc("auth/updateMyProfile", [i]),
};

/** Téléchargement en mode serveur : route dédiée (contrôle d'accès), hors RPC. */
async function serverDownload(id: string) {
  let res: Response;
  try {
    res = await fetch(`/api/attachments/${encodeURIComponent(id)}`, { credentials: "same-origin" });
  } catch {
    throw new ApiError("INTERNAL", "Le serveur est injoignable. Vérifiez votre connexion.", 0);
  }
  if (!res.ok) {
    const err = ((await res.json().catch(() => null)) as { error?: { code: ErrorCode; message: string } } | null)?.error;
    throw signalLost(new ApiError(err?.code ?? "INTERNAL", err?.message ?? "Téléchargement impossible.", res.status));
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const filename = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1] ?? "piece-jointe");
  return { data: await res.arrayBuffer(), mime: res.headers.get("content-type") ?? "application/octet-stream", filename };
}

function withServerDownload<M extends { downloadAttachment: (id: string) => Promise<{ data: ArrayBuffer; mime: string; filename: string }> }>(mod: M): M {
  if (!DEMO_MODE) mod.downloadAttachment = serverDownload;
  return mod;
}

/** Façade simulée en démo, routes RPC PostgreSQL en mode serveur (même contrat). */
function migrated<M extends Record<string, unknown>>(module: string, mod: M) {
  return DEMO_MODE ? authed(mod) : live(module, mod);
}

export const api = {
  auth: DEMO_MODE ? demoAuth : serverAuth,
  users: migrated("users", {
    listUsers: users.listUsers,
    getUserDetail: users.getUserDetail,
    createUser: users.createUser,
    updateUser: users.updateUser,
    changeRole: users.changeRole,
    setUserStatus: users.setUserStatus,
    resendAccess: users.resendAccess,
  }),
  coaches: migrated("coaches", {
    listCoaches: coaches.listCoaches,
    getCoachDetail: coaches.getCoachDetail,
    assignableCoaches: coaches.assignableCoaches,
    myCoachSpace: coaches.myCoachSpace,
    updateMyCoachProfile: coaches.updateMyCoachProfile,
    addAvailability: coaches.addAvailability,
    toggleAvailability: coaches.toggleAvailability,
    deleteAvailability: coaches.deleteAvailability,
    addAbsence: coaches.addAbsence,
    cancelAbsence: coaches.cancelAbsence,
    myLearners: coaches.myLearners,
    coachLearnerDetail: coaches.coachLearnerDetail,
    myCoach: coaches.myCoach,
  }),
  assignments: migrated("assignments", {
    assignmentOverview: assignments.assignmentOverview,
    assignmentHistory: assignments.assignmentHistory,
    assignCoach: assignments.assignCoach,
    endAssignment: assignments.endAssignment,
  }),
  entitlements: migrated("entitlements", {
    listEntitlements: entitlements.listEntitlements,
    learnerEntitlementDetail: entitlements.learnerEntitlementDetail,
    grantEntitlement: entitlements.grantEntitlement,
    updateEntitlement: entitlements.updateEntitlement,
    setEntitlementStatus: entitlements.setEntitlementStatus,
    correctQuota: entitlements.correctQuota,
    refundRequestQuota: entitlements.refundRequestQuota,
    myEntitlement: entitlements.myEntitlement,
  }),
  requests: withServerDownload(migrated("requests", {
    myEligibility: requests.myEligibility,
    listRequests: requests.listRequests,
    getRequestDetail: requests.getRequestDetail,
    createDraft: requests.createDraft,
    updateDraft: requests.updateDraft,
    abandonDraft: requests.abandonDraft,
    submitRequest: requests.submitRequest,
    cancelRequest: requests.cancelRequest,
    sendMessage: requests.sendMessage,
    takeCharge: requests.takeCharge,
    closeRequest: requests.closeRequest,
    reopenRequest: requests.reopenRequest,
    rateRequest: requests.rateRequest,
    addNote: requests.addNote,
    reassignRequest: requests.reassignRequest,
    recalculateDue: requests.recalculateDue,
    setPriority: requests.setPriority,
    nudgeCoach: requests.nudgeCoach,
    downloadAttachment: requests.downloadAttachment,
  })),
  notifications: migrated("notifications", {
    listMyNotifications: notifications.listMyNotifications,
    unreadNotificationCount: notifications.unreadNotificationCount,
    markNotificationRead: notifications.markNotificationRead,
    markAllNotificationsRead: notifications.markAllNotificationsRead,
    listEmailDeliveries: notifications.listEmailDeliveries,
    retryEmail: notifications.retryEmail,
    listJobRuns: notifications.listJobRuns,
    runJobsNow: notifications.runJobsNow,
    incidentsSummary: notifications.incidentsSummary,
  }),
  settings: migrated("settings", {
    getServiceSettings: settings.getServiceSettings,
    listCategories: settings.listCategories,
    updateServicePolicy: settings.updateServicePolicy,
    addHoliday: settings.addHoliday,
    removeHoliday: settings.removeHoliday,
    updateAppSettings: settings.updateAppSettings,
    saveCategory: settings.saveCategory,
    moveCategory: settings.moveCategory,
  }),
  reports: migrated("reports", {
    adminDashboard: reports.adminDashboard,
    reportMetrics: reports.reportMetrics,
    coachDashboard: reports.coachDashboard,
    learnerDashboard: reports.learnerDashboard,
    exportRequestsCsv: reports.exportRequestsCsv,
    listAuditLogs: reports.listAuditLogs,
  }),
  demo: pub({
    demoState: demo.demoState,
    advanceClock: demo.advanceClock,
    resetClock: demo.resetClock,
    setEmailFailureRate: demo.setEmailFailureRate,
    runJobs: demo.runJobs,
    mailbox: demo.mailbox,
    resetAllData: demo.resetAllData,
    seedDemo: demo.seedDemo,
  }),
};

/** Lit des fichiers du navigateur pour les transmettre à l'API (validation côté façade). */
export async function readFiles(files: File[]) {
  return Promise.all(files.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
}

/** Téléchargement contrôlé : URL d'objet éphémère, révoquée immédiatement après usage. */
export async function downloadAttachment(id: string) {
  const f = await api.requests.downloadAttachment(id);
  const url = URL.createObjectURL(new Blob([f.data], { type: f.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = f.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
