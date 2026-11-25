import { describe, expect, it } from "vitest";
import { computeAlerts, offlineSince, type ClientState } from "./alerts";

const now = new Date("2027-03-10T12:00:00Z");
const min = (m: number) => new Date(now.getTime() - m * 60_000);
const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString().slice(0, 10);

const base: ClientState = {
  id: "c1", name: "Acme", instanceHost: "acme", status: "ACTIF", createdAt: min(60 * 24 * 90), planId: "p1",
  trialEndsOn: null, nextDueOn: day(20), offlineSince: null,
  usage: { suspended: false, coaches_active: 1, members_active: 3, last_activity_at: min(60).toISOString() },
};
const plans = new Map([["p1", { maxCoaches: 5 as number | null, maxMembers: 10 as number | null }]]);
const run = (c: Partial<ClientState>, prospects = 0, p = plans) => computeAlerts({ now, clients: [{ ...base, ...c }], newProspects: prospects, plans: p });
const kinds = (a: ReturnType<typeof run>) => a.map((x) => x.kind);

describe("alertes", () => {
  it("aucune alerte pour un client sain", () => {
    expect(run({})).toEqual([]);
  });

  it("hors ligne : pas d'alerte à 14 min, alerte à 16 min", () => {
    expect(kinds(run({ offlineSince: min(14) }))).toEqual([]);
    expect(kinds(run({ offlineSince: min(16) }))).toEqual(["OFFLINE"]);
    expect(run({ offlineSince: min(16) })[0]?.severity).toBe("critical");
  });

  it("instance suspendue : ni hors ligne ni inactivité", () => {
    const usage = { ...base.usage!, suspended: true, last_activity_at: min(60 * 24 * 30).toISOString() };
    expect(kinds(run({ offlineSince: min(60), usage }))).toEqual([]);
    expect(kinds(run({ offlineSince: min(60), status: "SUSPENDU" }))).toEqual([]);
  });

  it("essai : alerte à 6 jours, pas à 8 ; essai terminé signalé", () => {
    expect(kinds(run({ status: "ESSAI", trialEndsOn: day(6) }))).toEqual(["TRIAL_ENDING"]);
    expect(kinds(run({ status: "ESSAI", trialEndsOn: day(8) }))).toEqual([]);
    const ended = run({ status: "ESSAI", trialEndsOn: day(-2) });
    expect(ended[0]?.message).toMatch(/terminé/i);
    expect(kinds(run({ status: "ACTIF", trialEndsOn: day(2) }))).toEqual([]);
  });

  it("échéance dépassée : alerte, sauf client résilié", () => {
    expect(kinds(run({ nextDueOn: day(-1) }))).toEqual(["OVERDUE"]);
    expect(kinds(run({ nextDueOn: day(-30), status: "RESILIE" }))).toEqual([]);
    expect(kinds(run({ nextDueOn: day(0) }))).toEqual([]);
  });

  it("limites : 9 sur 10 alerte, 8 sur 10 non, limite vide jamais", () => {
    const u = (members: number) => ({ ...base.usage!, members_active: members });
    expect(kinds(run({ usage: u(9) }))).toEqual(["NEAR_LIMIT"]);
    expect(kinds(run({ usage: u(8) }))).toEqual([]);
    const unlimited = new Map([["p1", { maxCoaches: null, maxMembers: null }]]);
    expect(kinds(run({ usage: u(5000) }, 0, unlimited))).toEqual([]);
    expect(kinds(run({ usage: { ...base.usage!, coaches_active: 5 } }))).toEqual(["NEAR_LIMIT"]);
  });

  it("inactivité : 14 jours sans activité", () => {
    const old = (d: number) => ({ ...base.usage!, last_activity_at: new Date(now.getTime() - d * 86_400_000).toISOString() });
    expect(kinds(run({ usage: old(13) }))).toEqual([]);
    expect(kinds(run({ usage: old(15) }))).toEqual(["INACTIVE"]);
    expect(kinds(run({ usage: { ...base.usage!, last_activity_at: null } }))).toEqual(["INACTIVE"]);
    expect(kinds(run({ usage: { ...base.usage!, last_activity_at: null }, createdAt: min(60 * 24 * 3) }))).toEqual([]);
  });

  it("nouvelles demandes d'essai et tri par gravité", () => {
    const a = computeAlerts({ now, newProspects: 2, plans, clients: [{ ...base, nextDueOn: day(-1) }, { ...base, id: "c2", name: "B", status: "ESSAI", trialEndsOn: day(3) }] });
    expect(a.map((x) => x.severity)).toEqual(["critical", "warning", "info"]);
    expect(a.at(-1)).toMatchObject({ kind: "NEW_PROSPECT" });
    expect(computeAlerts({ now, clients: [], newProspects: 0, plans })).toEqual([]);
  });
});

describe("offlineSince", () => {
  const c = (m: number, ok: boolean) => ({ checkedAt: min(m), ok });
  it("début de la série d'échecs en cours (contrôles du plus récent au plus ancien)", () => {
    expect(offlineSince([c(1, false), c(6, false), c(11, false), c(16, true), c(21, false)])).toEqual(min(11));
  });
  it("null si le dernier contrôle est bon ou s'il n'y en a pas", () => {
    expect(offlineSince([c(1, true), c(6, false)])).toBeNull();
    expect(offlineSince([])).toBeNull();
  });
});
