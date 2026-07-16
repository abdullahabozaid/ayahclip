import { NextRequest, NextResponse } from "next/server";
import { buildCheckoutParams, normalizeAmount, type Frequency } from "@/lib/support";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

// POST /api/support/checkout → create a Stripe Checkout Session for a one-time
// or monthly donation and return its hosted URL. The client redirects to it.
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    if (new URL(origin).host !== req.nextUrl.host) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { amount?: unknown; frequency?: unknown };
  try {
    body = await req.json();
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
  const siteOrigin = req.nextUrl.origin;
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start checkout" },
      { status: 502 }
    );
  }
}
