import { describe, expect, it } from "vitest";
import { nextDueDate } from "./billing";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const day = (x: Date) => x.toISOString().slice(0, 10);

describe("nextDueDate", () => {
  it("premier paiement le 31 janvier + 1 mois = fin février", () => {
    expect(day(nextDueDate(null, d("2027-01-31"), "MONTHLY"))).toBe("2027-02-28");
    expect(day(nextDueDate(null, d("2028-01-31"), "MONTHLY"))).toBe("2028-02-29");
  });
  it("paiement en avance : part de l'échéance en cours", () => {
    expect(day(nextDueDate(d("2027-03-15"), d("2027-02-01"), "MONTHLY"))).toBe("2027-04-15");
  });
  it("paiement en retard : part de la date de paiement", () => {
    expect(day(nextDueDate(d("2027-01-10"), d("2027-02-05"), "MONTHLY"))).toBe("2027-03-05");
  });
  it("paiement annuel : 12 mois", () => {
    expect(day(nextDueDate(null, d("2027-03-10"), "ANNUAL"))).toBe("2028-03-10");
    expect(day(nextDueDate(null, d("2028-02-29"), "ANNUAL"))).toBe("2029-02-28");
  });
});
