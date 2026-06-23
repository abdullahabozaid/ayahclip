// Tests for the donation amount + Stripe Checkout parameter logic. These are
// pure functions so the money math (pounds → pence, min/max) and the
// one-time-vs-monthly session shape can never silently drift.
import { describe, it, expect } from "vitest";
import {
  normalizeAmount,
  buildCheckoutParams,
  MIN_PENCE,
  MAX_PENCE,
  PRESET_AMOUNTS,
} from "@/lib/support";

const URLS = {
  successUrl: "https://ayahclip.app/support/thanks?s={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://ayahclip.app/support",
};

describe("normalizeAmount", () => {
  it("accepts a plain pounds number and converts to pence", () => {
    expect(normalizeAmount(5)).toEqual({ ok: true, pence: 500 });
  });

  it("accepts a string with a £ sign, commas and whitespace", () => {
    expect(normalizeAmount("  £1,234.50 ")).toEqual({ ok: true, pence: 123450 });
  });

  it("rounds fractional pence to the nearest penny", () => {
    expect(normalizeAmount("5.555")).toEqual({ ok: true, pence: 556 });
  });

  it("rejects non-numeric input", () => {
    expect(normalizeAmount("abc").ok).toBe(false);
    expect(normalizeAmount("").ok).toBe(false);
    expect(normalizeAmount("£").ok).toBe(false);
  });

  it("rejects zero and negative amounts", () => {
    expect(normalizeAmount(0).ok).toBe(false);
    expect(normalizeAmount(-5).ok).toBe(false);
  });

  it("rejects amounts below the minimum", () => {
    expect(normalizeAmount("0.50").ok).toBe(false);
    expect(normalizeAmount(MIN_PENCE / 100)).toEqual({ ok: true, pence: MIN_PENCE });
  });

  it("rejects amounts above the maximum", () => {
    expect(normalizeAmount(MAX_PENCE / 100 + 1).ok).toBe(false);
    expect(normalizeAmount(MAX_PENCE / 100)).toEqual({ ok: true, pence: MAX_PENCE });
  });

  it("rejects non-finite numbers", () => {
    expect(normalizeAmount(Infinity).ok).toBe(false);
    expect(normalizeAmount(NaN).ok).toBe(false);
  });

  it("exposes preset amounts that are all within range", () => {
    expect(PRESET_AMOUNTS.length).toBeGreaterThan(0);
    for (const p of PRESET_AMOUNTS) {
      expect(normalizeAmount(p).ok).toBe(true);
    }
  });
});

describe("buildCheckoutParams — one-time", () => {
  const params = buildCheckoutParams({ pence: 1000, frequency: "one-time", ...URLS });

  it("uses payment mode with donate submit type", () => {
    expect(params.mode).toBe("payment");
    expect(params.submit_type).toBe("donate");
  });

  it("sets a single GBP line item at the given pence", () => {
    expect(params["line_items[0][quantity]"]).toBe("1");
    expect(params["line_items[0][price_data][currency]"]).toBe("gbp");
    expect(params["line_items[0][price_data][unit_amount]"]).toBe("1000");
    expect(params["line_items[0][price_data][product_data][name]"]).toContain("AyahClip");
  });

  it("does NOT set a recurring interval", () => {
    expect(params["line_items[0][price_data][recurring][interval]"]).toBeUndefined();
  });

  it("passes through the success and cancel urls", () => {
    expect(params.success_url).toBe(URLS.successUrl);
    expect(params.cancel_url).toBe(URLS.cancelUrl);
  });
});

describe("buildCheckoutParams — monthly", () => {
  const params = buildCheckoutParams({ pence: 500, frequency: "monthly", ...URLS });

  it("uses subscription mode without a donate submit type", () => {
    expect(params.mode).toBe("subscription");
    expect(params.submit_type).toBeUndefined();
  });

  it("sets a monthly recurring interval on the line item", () => {
    expect(params["line_items[0][price_data][recurring][interval]"]).toBe("month");
    expect(params["line_items[0][price_data][unit_amount]"]).toBe("500");
    expect(params["line_items[0][price_data][currency]"]).toBe("gbp");
  });
});
