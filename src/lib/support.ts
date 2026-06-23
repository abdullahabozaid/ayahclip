// Donation amount + Stripe Checkout parameter logic for the Support page.
//
// Kept free of any I/O so it is trivially unit-testable: `normalizeAmount`
// owns the money math (pounds → pence, min/max), and `buildCheckoutParams`
// owns the exact Stripe form fields for a one-time vs monthly gift. The route
// handler in src/app/api/support/checkout wires these to the network.

export const CURRENCY = "gbp" as const;
export const CURRENCY_SYMBOL = "£";

export const MIN_PENCE = 100; // £1
export const MAX_PENCE = 1_000_000; // £10,000 — sanity ceiling, not a real cap

/** Suggested gifts, in pounds. Same chips serve one-time and monthly. */
export const PRESET_AMOUNTS = [3, 5, 10, 25] as const;

export type Frequency = "one-time" | "monthly";

export type AmountResult =
  | { ok: true; pence: number }
  | { ok: false; error: string };

/**
 * Parse a user-entered amount in pounds into validated integer pence.
 * Accepts numbers or strings with a leading £, thousands commas, and surrounding
 * whitespace. Anything non-finite, non-positive, or out of range is rejected.
 */
export function normalizeAmount(input: string | number): AmountResult {
  let pounds: number;
  if (typeof input === "number") {
    pounds = input;
  } else {
    const cleaned = input.replace(/[£,\s]/g, "");
    if (cleaned === "") return { ok: false, error: "Enter an amount" };
    pounds = Number(cleaned);
  }

  if (!Number.isFinite(pounds)) return { ok: false, error: "Enter a valid amount" };

  const pence = Math.round(pounds * 100);
  if (pence < MIN_PENCE) {
    return { ok: false, error: `Minimum is ${CURRENCY_SYMBOL}${MIN_PENCE / 100}` };
  }
  if (pence > MAX_PENCE) {
    return {
      ok: false,
      error: `Maximum is ${CURRENCY_SYMBOL}${(MAX_PENCE / 100).toLocaleString("en-GB")}`,
    };
  }
  return { ok: true, pence };
}

/** Human-readable amount, e.g. 1250 → "£12.50", 500 → "£5". */
export function formatPence(pence: number): string {
  const pounds = pence / 100;
  const body = Number.isInteger(pounds)
    ? pounds.toLocaleString("en-GB")
    : pounds.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${CURRENCY_SYMBOL}${body}`;
}

export interface CheckoutParamsInput {
  pence: number;
  frequency: Frequency;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Build the flat, form-encodable field map Stripe's Checkout Session API
 * expects. One-time gifts use `payment` mode with the "Donate" button; monthly
 * gifts use `subscription` mode with a monthly recurring interval. The amount
 * is an inline price (no pre-created products in the dashboard).
 */
export function buildCheckoutParams(input: CheckoutParamsInput): Record<string, string> {
  const { pence, frequency, successUrl, cancelUrl } = input;
  const monthly = frequency === "monthly";

  const params: Record<string, string> = {
    mode: monthly ? "subscription" : "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": CURRENCY,
    "line_items[0][price_data][unit_amount]": String(pence),
    "line_items[0][price_data][product_data][name]": monthly
      ? "AyahClip monthly support"
      : "AyahClip support",
  };

  if (monthly) {
    params["line_items[0][price_data][recurring][interval]"] = "month";
  } else {
    // submit_type is only valid in payment mode; it relabels the button "Donate".
    params.submit_type = "donate";
  }

  return params;
}
