import { describe, expect, it } from "vitest";
import { addWorkingMinutes, nextOpening, validateCalendar, workingMinutesBetween, type CalendarConfig } from "./businessHours";

const ABIDJAN: CalendarConfig = {
  timezone: "Africa/Abidjan",
  working_days: [1, 2, 3, 4, 5],
  periods: [
    { start: "08:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
  ],
  holidays: [],
};
const H24 = 24 * 60;
const at = (iso: string) => new Date(iso);

describe("Calcul des échéances — exemples du PRD §7.3", () => {
  it("lundi 09 h 00 → jeudi 09 h 00", () => {
    expect(addWorkingMinutes(at("2026-10-26T09:00:00Z"), H24, ABIDJAN).toISOString()).toBe("2026-10-29T09:00:00.000Z");
  });
  it("vendredi 16 h 00 → mercredi suivant 16 h 00 (REC-04)", () => {
    expect(addWorkingMinutes(at("2026-10-30T16:00:00Z"), H24, ABIDJAN).toISOString()).toBe("2026-11-04T16:00:00.000Z");
  });
  it("samedi 10 h 00 : le délai commence lundi 08 h 00", () => {
    expect(nextOpening(at("2026-10-31T10:00:00Z"), ABIDJAN).toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(addWorkingMinutes(at("2026-10-31T10:00:00Z"), H24, ABIDJAN).toISOString()).toBe("2026-11-04T17:00:00.000Z");
  });
});

describe("Règles de calcul", () => {
  it("exclut la pause méridienne", () => {
    expect(addWorkingMinutes(at("2026-10-26T11:30:00Z"), 60, ABIDJAN).toISOString()).toBe("2026-10-26T13:30:00.000Z");
    expect(nextOpening(at("2026-10-26T12:15:00Z"), ABIDJAN).toISOString()).toBe("2026-10-26T13:00:00.000Z");
  });
  it("une soumission après 17 h démarre le lendemain 08 h", () => {
    expect(addWorkingMinutes(at("2026-10-26T18:00:00Z"), 60, ABIDJAN).toISOString()).toBe("2026-10-27T09:00:00.000Z");
  });
  it("épuisement exact en fin de plage → fin de plage", () => {
    expect(addWorkingMinutes(at("2026-10-26T13:00:00Z"), 240, ABIDJAN).toISOString()).toBe("2026-10-26T17:00:00.000Z");
  });
  it("exclut les jours fériés configurés", () => {
    const cal = { ...ABIDJAN, holidays: ["2026-10-27", "2026-10-28"] };
    // lundi 09h : 7h lundi, mardi/mercredi fériés, jeudi 8h, vendredi 8h, lundi 1h
    expect(addWorkingMinutes(at("2026-10-26T09:00:00Z"), H24, cal).toISOString()).toBe("2026-11-02T09:00:00.000Z");
  });
  it("exclut les fermetures consécutives (fêtes de fin d'année)", () => {
    const cal = { ...ABIDJAN, holidays: ["2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"] };
    expect(addWorkingMinutes(at("2026-12-23T16:00:00Z"), 8 * 60, cal).toISOString()).toBe("2026-12-28T16:00:00.000Z");
  });
  it("calcule le temps ouvré écoulé", () => {
    expect(workingMinutesBetween(at("2026-10-26T09:00:00Z"), at("2026-10-29T09:00:00Z"), ABIDJAN)).toBe(H24);
    expect(workingMinutesBetween(at("2026-10-31T10:00:00Z"), at("2026-11-02T08:00:00Z"), ABIDJAN)).toBe(0);
    expect(workingMinutesBetween(at("2026-10-26T11:00:00Z"), at("2026-10-26T14:00:00Z"), ABIDJAN)).toBe(120);
    expect(workingMinutesBetween(at("2026-10-29T09:00:00Z"), at("2026-10-26T09:00:00Z"), ABIDJAN)).toBe(0);
  });
  it("addWorkingMinutes et workingMinutesBetween sont cohérents", () => {
    const start = at("2026-10-30T16:20:00Z");
    for (const m of [1, 37, 240, 481, 1440, 4000]) {
      expect(workingMinutesBetween(start, addWorkingMinutes(start, m, ABIDJAN), ABIDJAN)).toBe(m);
    }
  });
  it("respecte un fuseau avec heure d'été (Europe/Paris, changement d'heure du 25/10/2026)", () => {
    const paris: CalendarConfig = { ...ABIDJAN, timezone: "Europe/Paris" };
    // vendredi 23/10 16h00 Paris (UTC+2) = 14h00Z ; + 2h ouvrées → lundi 26/10 09h00 Paris (UTC+1) = 08h00Z
    expect(addWorkingMinutes(at("2026-10-23T14:00:00Z"), 120, paris).toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });
  it("valide la configuration du calendrier", () => {
    expect(validateCalendar(ABIDJAN)).toBeNull();
    expect(validateCalendar({ ...ABIDJAN, working_days: [] })).not.toBeNull();
    expect(validateCalendar({ ...ABIDJAN, periods: [{ start: "10:00", end: "09:00" }] })).not.toBeNull();
    expect(validateCalendar({ ...ABIDJAN, periods: [{ start: "08:00", end: "12:00" }, { start: "11:00", end: "13:00" }] })).not.toBeNull();
  });
  it("échoue explicitement si le calendrier n'a aucun jour ouvré", () => {
    expect(() => addWorkingMinutes(at("2026-10-26T09:00:00Z"), 60, { ...ABIDJAN, working_days: [] })).toThrow();
  });
});
