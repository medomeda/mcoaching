import { describe, expect, it } from "vitest";
import { instanceTarget, parseInstanceUrl } from "./instance-url";

const D = "mentora.app";

describe("parseInstanceUrl", () => {
  it("accepte https://<étiquette>.<domaine>", () => {
    expect(parseInstanceUrl("https://acme.mentora.app", D)?.origin).toBe("https://acme.mentora.app");
    expect(parseInstanceUrl("https://ACME.mentora.app/", D)?.origin).toBe("https://acme.mentora.app");
  });
  it.each([
    "https://acme.mentora.app@evil.com",
    "https://evil.com#@acme.mentora.app",
    "http://acme.mentora.app",
    "https://a.b.mentora.app",
    "https://127.0.0.1",
    "https://[::1]",
    "https://localhost",
    "https://acme.mentora.app.evil.com",
    "https://mentora.app",
    "https://acme.mentora.app.",
    "https://acme.mentora.app:8443",
    "https://user:pw@acme.mentora.app",
    "https://acme.mentora.app/chemin",
    "https://-acme.mentora.app",
    "https://xn--acme.mentora.app",
    "pas une url",
    "",
  ])("refuse %s", (input) => {
    expect(parseInstanceUrl(input, D)).toBeNull();
  });
  it("instanceTarget construit puis re-valide l'adresse", () => {
    expect(instanceTarget("acme", D)?.origin).toBe("https://acme.mentora.app");
    expect(instanceTarget("a.b", D)).toBeNull();
    expect(instanceTarget(null, D)).toBeNull();
    expect(instanceTarget("acme", "")).toBeNull();
  });
});
