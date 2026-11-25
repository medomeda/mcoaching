import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("refuse au-delà du maximum dans la fenêtre puis réaccepte après", () => {
    const allow = createRateLimiter({ max: 5, windowMs: 3600_000 });
    for (let i = 0; i < 5; i++) expect(allow("1.2.3.4", 1000)).toBe(true);
    expect(allow("1.2.3.4", 2000)).toBe(false);
    expect(allow("5.6.7.8", 2000)).toBe(true);
    expect(allow("1.2.3.4", 1000 + 3600_000 + 1)).toBe(true);
  });
});
