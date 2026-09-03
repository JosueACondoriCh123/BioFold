import { describe, expect, it } from "vitest";
import { canUseStale, freshCacheOutcome, providerCacheOutcome } from "../supabase/functions/_shared/externalCachePolicy";

const now = Date.parse("2026-09-02T12:00:00Z");
const fresh = { statusCode: 200, freshUntil: "2026-09-03T12:00:00Z", staleUntil: "2026-10-02T12:00:00Z" };
const stale = { statusCode: 200, freshUntil: "2026-09-01T12:00:00Z", staleUntil: "2026-10-02T12:00:00Z" };
const expired = { statusCode: 200, freshUntil: "2026-08-01T12:00:00Z", staleUntil: "2026-09-01T12:00:00Z" };

describe("external evidence cache policy", () => {
  it("serves fresh success and negative entries as hits", () => {
    expect(freshCacheOutcome(fresh, now)).toBe("hit");
    expect(freshCacheOutcome({ ...fresh, statusCode: 404 }, now)).toBe("hit");
    expect(freshCacheOutcome(stale, now)).toBeNull();
  });

  it("distinguishes miss and conditional revalidation", () => {
    expect(providerCacheOutcome(200, null, now)).toBe("miss");
    expect(providerCacheOutcome(404, null, now)).toBe("miss");
    expect(providerCacheOutcome(304, stale, now)).toBe("revalidated");
    expect(providerCacheOutcome(304, { ...stale, statusCode: 404 }, now)).toBe("unavailable");
  });

  it("uses stale success only for transient failures inside 30 days", () => {
    expect(canUseStale(stale, now)).toBe(true);
    expect(providerCacheOutcome(503, stale, now)).toBe("stale_fallback");
    expect(providerCacheOutcome(429, stale, now)).toBe("stale_fallback");
    expect(providerCacheOutcome(503, expired, now)).toBe("unavailable");
    expect(providerCacheOutcome(403, stale, now)).toBe("unavailable");
    expect(canUseStale({ ...stale, statusCode: 404 }, now)).toBe(false);
  });
});
