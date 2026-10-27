/**
 * Fonctions exposées par la route `/api/rpc/[module]/[fn]`. Chaque module est migré
 * de la façade simulée vers PostgreSQL au fil des étapes ; seul ce qui figure ici est servi.
 */
import * as assignments from "./assignments";
import * as auth from "./auth";
import * as coaches from "./coaches";
import type { LiveCall } from "./context";
import * as entitlements from "./entitlements";
import * as notifications from "./notifications";
import * as reports from "./reports";
import * as requests from "./requests";
import * as settings from "./settings";
import * as users from "./users";

type LiveFn = (call: LiveCall, ...args: never[]) => Promise<unknown>;

export const liveModules: Record<string, Record<string, LiveFn>> = {
  auth: {
    systemStatus: auth.systemStatus,
    bootstrapAdmin: auth.bootstrapAdmin,
    me: auth.me,
    inspectToken: auth.inspectToken,
    completeToken: auth.completeToken,
    changePassword: auth.changePassword,
    updateMyProfile: auth.updateMyProfile,
    checkSession: auth.checkSession,
  },
  users: {
    listUsers: users.listUsers,
    getUserDetail: users.getUserDetail,
    createUser: users.createUser,
    updateUser: users.updateUser,
    changeRole: users.changeRole,
    setUserStatus: users.setUserStatus,
    resendAccess: users.resendAccess,
  },
  coaches: {
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
  },
  assignments: {
    assignmentOverview: assignments.assignmentOverview,
    assignmentHistory: assignments.assignmentHistory,
    assignCoach: assignments.assignCoach,
    endAssignment: assignments.endAssignment,
  },
  entitlements: {
    listEntitlements: entitlements.listEntitlements,
    learnerEntitlementDetail: entitlements.learnerEntitlementDetail,
    grantEntitlement: entitlements.grantEntitlement,
    updateEntitlement: entitlements.updateEntitlement,
    setEntitlementStatus: entitlements.setEntitlementStatus,
    correctQuota: entitlements.correctQuota,
    refundRequestQuota: entitlements.refundRequestQuota,
    myEntitlement: entitlements.myEntitlement,
  },
  requests: {
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
  },
  settings: {
    getServiceSettings: settings.getServiceSettings,
    listCategories: settings.listCategories,
    updateServicePolicy: settings.updateServicePolicy,
    addHoliday: settings.addHoliday,
    removeHoliday: settings.removeHoliday,
    updateAppSettings: settings.updateAppSettings,
    saveCategory: settings.saveCategory,
    moveCategory: settings.moveCategory,
  },
  notifications: {
    listMyNotifications: notifications.listMyNotifications,
    unreadNotificationCount: notifications.unreadNotificationCount,
    markNotificationRead: notifications.markNotificationRead,
    markAllNotificationsRead: notifications.markAllNotificationsRead,
    listEmailDeliveries: notifications.listEmailDeliveries,
    retryEmail: notifications.retryEmail,
    listJobRuns: notifications.listJobRuns,
    runJobsNow: notifications.runJobsNow,
    incidentsSummary: notifications.incidentsSummary,
  },
  reports: {
    adminDashboard: reports.adminDashboard,
    reportMetrics: reports.reportMetrics,
    coachDashboard: reports.coachDashboard,
    learnerDashboard: reports.learnerDashboard,
    exportRequestsCsv: reports.exportRequestsCsv,
    listAuditLogs: reports.listAuditLogs,
  },
};
