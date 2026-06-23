// Minimal server-only Stripe client. We avoid the `stripe` SDK (and its weight)
// because the Support flow needs exactly one endpoint: create a Checkout
// Session. Calling the REST API directly with fetch keeps the dependency list
// lean and the surface obvious.
//
// Requires the STRIPE_SECRET_KEY env var. When it is absent the route falls
// back to a friendly "not configured" response, so the page still renders.
//
// Server-only by construction: STRIPE_SECRET_KEY has no NEXT_PUBLIC_ prefix, so
// it is never bundled to the client, and this module is imported only by the
// checkout route handler.

const STRIPE_API = "https://api.stripe.com/v1/checkout/sessions";

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Create a Stripe Checkout Session from the flat form fields built by
 * `buildCheckoutParams`. Returns the hosted checkout URL to redirect to.
 * Throws on a missing key or any Stripe-side error.
 */
export async function createCheckoutSession(
  params: Record<string, string>
): Promise<{ url: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured");

  const res = await fetch(STRIPE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });

  const data = (await res.json().catch(() => null)) as
    | { url?: string; error?: { message?: string } }
    | null;

  if (!res.ok || !data?.url) {
    throw new Error(data?.error?.message || "Could not start checkout");
  }
  return { url: data.url };
}
