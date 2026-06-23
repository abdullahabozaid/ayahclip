# Support / Donations — Design Spec

**Date:** 2026-06-23
**Status:** Approved, building
**Scope:** A "Support AyahClip" donation flow. The app stays free; supporters can give any amount, once or monthly, via Stripe Checkout. Storage-management UI is explicitly out of scope for this pass (deferred).

## Decisions

- **Audience:** public web app (Vercel). The flow targets visitors, not the local-only library.
- **Payments:** Stripe Checkout, redirect flow. Custom amounts. One-time **and** monthly.
- **Currency:** GBP (£).
- **Transparency:** no public totals, no database, no webhook. Donate → hosted Stripe checkout → thank-you page.
- **Placement:** dedicated `/support` page, linked from `SiteNav` and `SiteFooter`.
- **Identity:** keep Midnight Mihrab (ink-navy + gilded gold + emerald; Marcellus / Outfit / Amiri). The Support page uses brand-register ambition within that system; emerald gets a real second-voice role here.

## Architecture

No `stripe` npm dependency. We call Stripe's REST API directly with `fetch` + the secret key (form-encoded body, Bearer auth). The session-parameter and amount logic are pure functions, unit-tested with vitest.

### Files

| File | Purpose |
|---|---|
| `src/lib/support.ts` | Pure logic: presets, `normalizeAmount()`, `buildCheckoutParams()` (returns the exact Stripe form fields). No I/O. |
| `src/lib/stripe.ts` | Server-only. `isStripeConfigured()`, `createCheckoutSession(params)` → POSTs to Stripe, returns the session URL. |
| `src/app/api/support/checkout/route.ts` | `POST` handler. Validates `{ amount, frequency }`, builds params, creates the session, returns `{ url }`. 503 when unconfigured. |
| `src/app/support/page.tsx` | Brand-register page shell + copy. |
| `src/components/SupportForm.tsx` | Client: frequency toggle, amount chips, custom input, submit → redirect to Stripe. |
| `src/app/support/thanks/page.tsx` | Confirmation / du'a, link back to Studio. |
| `src/components/SiteNav.tsx`, `src/components/SiteFooter.tsx` | Add Support links. |
| `src/lib/__tests__/support.test.ts` | Tests for amount validation + param building. |

### Amount handling (`normalizeAmount`)

- Input: a string or number of **pounds** ("£5", "5.50", "12").
- Strips `£`, commas, whitespace; parses; must be finite and positive.
- Converts to integer **pence** via `Math.round(pounds * 100)`.
- Range: min £1 (100p), max £10,000 (1,000,000p). Out of range → `{ ok: false, error }`.

### `buildCheckoutParams({ pence, frequency, successUrl, cancelUrl })`

Returns a flat `Record<string, string>` of Stripe form fields:

- One-time: `mode=payment`, `submit_type=donate`, single `line_item` with inline `price_data` (currency `gbp`, `unit_amount` = pence, `product_data[name]` = "AyahClip support").
- Monthly: `mode=subscription`, same line item plus `price_data[recurring][interval]=month`, name "AyahClip monthly support". (`submit_type=donate` is omitted — invalid in subscription mode.)
- `success_url` (with `{CHECKOUT_SESSION_ID}` placeholder) and `cancel_url` from the request origin.

### Route flow

1. Parse JSON body `{ amount, frequency }`.
2. `normalizeAmount` → 400 on failure.
3. If `!isStripeConfigured()` → 503 `{ error: "not configured" }` (page renders fine; the form surfaces a friendly message).
4. Build params with success/cancel URLs derived from `req` origin.
5. `createCheckoutSession` → `{ url }`. Client sets `window.location.href = url`.
6. Stripe error → 502 with a safe message.

## Config / env

- `STRIPE_SECRET_KEY` — required for live donations. Absent in local/dev by default → graceful "not configured" state. Add to Vercel env to go live.

## Testing

- `normalizeAmount`: accepts "£5"/"5.50"/whitespace, rejects junk/negatives/below-min/above-max, rounds pence.
- `buildCheckoutParams`: one-time vs monthly mode, currency, unit_amount, recurring only when monthly, donate submit_type only one-time.
- Manual: run app, open `/support`, confirm toggle + chips + custom drive the CTA label; unconfigured path shows the friendly notice.

## Out of scope (deferred)

Storage-management UI; donation totals / webhooks / database; donor accounts or receipts beyond Stripe's own email; Apple/Google Pay tuning (Stripe Checkout enables wallets automatically when configured).
