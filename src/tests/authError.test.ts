import { describe, expect, it } from "vitest";
import { authError } from "@/lib/api";

describe("authError", () => {
  it("transmet le message de suspension d'instance (503) au lieu d'une erreur interne", () => {
    const e = authError({ status: 503, message: "Abonnement impayé." });
    expect(e.code).toBe("SERVICE_SUSPENDED");
    expect(e.message).toBe("Abonnement impayé.");
    expect(e.status).toBe(503);
  });
  it("conserve les autres correspondances", () => {
    expect(authError({ status: 429 }).code).toBe("RATE_LIMITED");
    expect(authError({ status: 401 }).code).toBe("UNAUTHENTICATED");
    expect(authError({ status: 500 }).code).toBe("INTERNAL");
  });
});
