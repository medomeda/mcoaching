import { describe, expect, it } from "vitest";
import { REQUEST_STATUSES } from "../core/types";
import { canTransition, planTransition } from "./stateMachine";

describe("Machine à états des demandes (PRD §8.2)", () => {
  it("applique les transitions du tableau", () => {
    expect(planTransition("DRAFT", "SUBMIT")).toEqual(["SUBMITTED"]);
    expect(planTransition("SUBMITTED", "ACKNOWLEDGE")).toEqual(["WAITING_FOR_COACH"]);
    expect(planTransition("SUBMITTED", "TAKE_CHARGE")).toEqual(["IN_PROGRESS"]);
    expect(planTransition("WAITING_FOR_COACH", "TAKE_CHARGE")).toEqual(["IN_PROGRESS"]);
    expect(planTransition("IN_PROGRESS", "REQUEST_CLARIFICATION")).toEqual(["WAITING_FOR_LEARNER"]);
    expect(planTransition("WAITING_FOR_LEARNER", "LEARNER_MESSAGE")).toEqual(["IN_PROGRESS"]);
    expect(planTransition("IN_PROGRESS", "FINAL_RESPONSE")).toEqual(["RESPONSE_PROVIDED"]);
    expect(planTransition("RESPONSE_PROVIDED", "CLOSE")).toEqual(["CLOSED"]);
    expect(planTransition("CLOSED", "REOPEN")).toEqual(["WAITING_FOR_COACH"]);
    expect(planTransition("DRAFT", "ABANDON")).toEqual(["CANCELLED"]);
    expect(planTransition("SUBMITTED", "CANCEL")).toEqual(["CANCELLED"]);
  });

  it("compose « prendre en charge » quand le coach répond directement", () => {
    expect(planTransition("SUBMITTED", "COACH_MESSAGE")).toEqual(["IN_PROGRESS"]);
    expect(planTransition("WAITING_FOR_COACH", "FINAL_RESPONSE")).toEqual(["IN_PROGRESS", "RESPONSE_PROVIDED"]);
    expect(planTransition("SUBMITTED", "REQUEST_CLARIFICATION")).toEqual(["IN_PROGRESS", "WAITING_FOR_LEARNER"]);
  });

  it("refuse les transitions non prévues", () => {
    expect(canTransition("CLOSED", "CLOSE")).toBe(false);
    expect(canTransition("IN_PROGRESS", "CANCEL")).toBe(false);
    expect(canTransition("WAITING_FOR_COACH", "CANCEL")).toBe(false);
    expect(canTransition("DRAFT", "CLOSE")).toBe(false);
    expect(canTransition("WAITING_FOR_LEARNER", "FINAL_RESPONSE")).toBe(false);
    expect(canTransition("IN_PROGRESS", "REOPEN")).toBe(false);
    for (const s of REQUEST_STATUSES) {
      if (s !== "CLOSED") expect(canTransition(s, "REOPEN")).toBe(false);
    }
    for (const a of ["COACH_MESSAGE", "LEARNER_MESSAGE", "REQUEST_CLARIFICATION", "FINAL_RESPONSE"] as const) {
      expect(canTransition("CLOSED", a)).toBe(false);
      expect(canTransition("CANCELLED", a)).toBe(false);
    }
  });

  it("relance de l'apprenant après réponse finale : paramétrable", () => {
    expect(planTransition("RESPONSE_PROVIDED", "LEARNER_MESSAGE", { learnerFollowUpReopensProcessing: true })).toEqual(["IN_PROGRESS"]);
    expect(canTransition("RESPONSE_PROVIDED", "LEARNER_MESSAGE", { learnerFollowUpReopensProcessing: false })).toBe(false);
  });
});
