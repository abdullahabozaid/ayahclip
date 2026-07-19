import { afterEach, describe, expect, it } from "vitest";

import {
  checkRateLimit,
  rateLimitHeaders,
  releaseRateLimit,
  resetRateLimitsForTests,
} from "../server-rate-limit";

afterEach(resetRateLimitsForTests);

describe("server request throttling", () => {
  const policy = { namespace: "paid-api", limit: 2, windowMs: 10_000 };

  it("isolates trusted forwarded client addresses", () => {
    const first = new Request("https://ayahclip.test/api", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });
    const second = new Request("https://ayahclip.test/api", {
      headers: { "x-forwarded-for": "203.0.113.2" },
    });

    expect(checkRateLimit(first, policy, 1_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(checkRateLimit(first, policy, 1_001)).toMatchObject({ allowed: true, remaining: 0 });
    expect(checkRateLimit(first, policy, 1_002)).toMatchObject({ allowed: false, remaining: 0 });
    expect(checkRateLimit(second, policy, 1_002)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("opens a new window and returns machine-readable retry headers", () => {
    const request = new Request("https://ayahclip.test/api");
    checkRateLimit(request, policy, 5_000);
    checkRateLimit(request, policy, 5_001);
    const limited = checkRateLimit(request, policy, 5_002);

    expect(limited).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 10 });
    expect(rateLimitHeaders(limited)).toMatchObject({
      "cache-control": "no-store",
      "retry-after": "10",
      "x-ratelimit-remaining": "0",
    });
    expect(checkRateLimit(request, policy, 15_001)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("rejects invalid policies instead of silently disabling protection", () => {
    const request = new Request("https://ayahclip.test/api");
    expect(() => checkRateLimit(request, { ...policy, limit: 0 })).toThrow("Invalid rate-limit policy");
  });

  it("returns a reserved slot after an upstream operation fails", () => {
    const request = new Request("https://ayahclip.test/api", {
      headers: { "x-forwarded-for": "203.0.113.8" },
    });
    const oneAttempt = { namespace: "source", limit: 1, windowMs: 60_000 };
    expect(checkRateLimit(request, oneAttempt, 1_000).allowed).toBe(true);
    releaseRateLimit(request, oneAttempt);
    expect(checkRateLimit(request, oneAttempt, 1_001).allowed).toBe(true);
  });
});
