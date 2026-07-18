import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/support/checkout/route";
import { createCheckoutSession } from "../stripe";
import { resetRateLimitsForTests } from "../server-rate-limit";

vi.mock("../stripe", () => ({
  createCheckoutSession: vi.fn(),
  isStripeConfigured: vi.fn(() => true),
}));

function checkoutRequest(): NextRequest {
  return new NextRequest("https://ayahclip.test/api/support/checkout", {
    method: "POST",
    headers: {
      host: "ayahclip.test",
      origin: "https://ayahclip.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({ amount: 5, frequency: "one-time" }),
  });
}

afterEach(() => {
  resetRateLimitsForTests();
  vi.restoreAllMocks();
});

describe("support checkout route", () => {
  it("does not disclose payment-provider errors to the public client", async () => {
    vi.mocked(createCheckoutSession).mockRejectedValueOnce(
      new Error("Stripe secret sk_live_sensitive and request req_private"),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(checkoutRequest());
    const body = await response.json() as { error: string };

    expect(response.status).toBe(502);
    expect(body.error).toBe("Could not start checkout. Please try again.");
    expect(JSON.stringify(body)).not.toContain("sk_live");
    expect(JSON.stringify(body)).not.toContain("req_private");
    expect(error).toHaveBeenCalledWith(
      "[support-checkout] Stripe session creation failed",
      { errorType: "Error" },
    );
  });
});
