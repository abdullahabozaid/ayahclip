import { NextRequest, NextResponse } from "next/server";
import { buildCheckoutParams, normalizeAmount, type Frequency } from "@/lib/support";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe";
import { checkRateLimit, rateLimitHeaders } from "@/lib/server-rate-limit";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 2_048;

// POST /api/support/checkout → create a Stripe Checkout Session for a one-time
// or monthly donation and return its hosted URL. The client redirects to it.
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let siteOrigin: string;
  try {
    const parsedOrigin = new URL(origin);
    const requestHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!requestHost || parsedOrigin.host !== requestHost) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    siteOrigin = parsedOrigin.origin;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rateLimit = checkRateLimit(req, {
    namespace: "support-checkout",
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Please wait before starting another checkout." },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: { amount?: unknown; frequency?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    body = JSON.parse(text) as { amount?: unknown; frequency?: unknown };
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const rawAmount = body.amount;
  if (typeof rawAmount !== "string" && typeof rawAmount !== "number") {
    return NextResponse.json({ error: "Enter an amount" }, { status: 400 });
  }
  const amount = normalizeAmount(rawAmount);
  if (!amount.ok) {
    return NextResponse.json({ error: amount.error }, { status: 400 });
  }

  const frequency: Frequency = body.frequency === "monthly" ? "monthly" : "one-time";

  // Page renders even without keys; only the act of donating needs them.
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Donations aren't set up yet. Please check back soon." },
      { status: 503 }
    );
  }

  // Build absolute return URLs from the request origin so this works on any
  // deployment without a hardcoded base URL.
  const params = buildCheckoutParams({
    pence: amount.pence,
    frequency,
    successUrl: `${siteOrigin}/support/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${siteOrigin}/support`,
  });

  try {
    const { url } = await createCheckoutSession(params);
    return NextResponse.json({ url });
  } catch (err) {
    // Provider messages can contain request identifiers or configuration
    // details. Keep a coarse server-side category and return fixed public copy.
    console.error("[support-checkout] Stripe session creation failed", {
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 502 }
    );
  }
}
