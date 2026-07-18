# Production security and backend audit

Date: 2026-07-18

## Verified controls

- `npm audit --omit=dev` reports zero known production dependency vulnerabilities: zero critical, high, moderate, low, or informational findings.
- The tracked-file secret scan finds no API keys, private keys, credentials, or committed environment files. `.env.local` and all `.env*` files remain ignored except the value-free `.env.example` contract.
- The public Vercel deployment returns `nosniff`, `DENY` framing, strict referrer policy, a restrictive feature policy, HSTS, and a CSP baseline that denies framing, object embedding, and hostile base URLs.
- Public deployments return 404 for the disk-backed clip library routes. Local filesystem mutations require the exact localhost/private-LAN origin serving AyahClip—including its port—so another page on the same Wi-Fi cannot submit a cross-origin library or export write. `/api/save-export` validates names/extensions and caps files at 500 MB.
- Stored local-library videos accept only canonical MP4/WebM types, validate generated IDs, return `nosniff`, and never echo an attacker-selected content type.
- Telemetry accepts only event-specific fields from the versioned schema in `src/lib/telemetry-schema.ts`, caps payloads at 2 KB, rejects cross-site browser requests, and does not log source media, file names, Quran text, transcripts, URLs, raw errors, user agents, referrers, or client IP addresses. Route tests prove deterministic 120-accepted/1-throttled behavior under a 121-request same-client burst.
- Caption requests cap bodies at 12 KB, reject cross-site browser requests, use structured output, set `store: false`, and fall back to reviewed local editorial copy if OpenAI is absent or unavailable.
- Pexels search, caption generation, telemetry and Stripe checkout now share bounded warm-instance throttling. Cross-site browser requests cannot spend Pexels or caption quota.
- Checkout validates the exact same origin, normalizes the donation amount, constructs return URLs from the deployment origin, keeps the Stripe key server-only, and never returns payment-provider errors or request identifiers to the public client.
- Production recognition resolves the reviewed 131,652,337-byte model through a same-origin route. The route rejects upstream size drift, redacts upstream failures, marks the response immutable for browser/CDN caching, and adds `nosniff`; move the asset to CORS-enabled object storage before broad traffic to control bandwidth cost.
- `e2e/security-boundaries.spec.ts` verifies cross-site Pexels/checkout rejection, oversized telemetry rejection, public filesystem isolation, and public save-to-disk denial. Production smoke tests verify security headers and a real MP4 render in installed Google Chrome.

## Remaining launch controls

1. Warm-instance throttling is defense-in-depth, not a distributed guarantee. Before broad paid-API traffic, publish a Vercel WAF fixed-window rule for `/api/social-caption`, `/api/pexels`, `/api/support/checkout`, and `/api/telemetry`, keyed by IP and preferably JA4 digest. Vercel documents rate limiting as available on all plans but charges for allowed requests; enabling it requires owner approval of that operational cost.
2. The current product intentionally has no accounts. Therefore there is no tenant data on the server, but there is also no durable per-user quota, account deletion, account export, or admin authorization model. Do not add an admin surface until authentication, role checks, audit logging, and tenant-isolation tests exist together.
3. Product events currently live in Vercel Runtime Logs. A real analytics/CRM backend needs a documented retention period, access roles, deletion policy, schema migration process, and incident-response owner before ingesting user-linked records.
4. Complete external dynamic application security testing and load testing against a non-production environment before a broad launch. Do not run destructive load tests against the live creator service.
5. Rotate all production secrets on an incident or staff-access change and review Vercel environment-variable access before each public release.

## Reproducible gate

```bash
npm audit --omit=dev
npm run lint
npx tsc --noEmit
npm test
npm run build
npx playwright test e2e/security-boundaries.spec.ts e2e/social-caption.spec.ts
PLAYWRIGHT_BASE_URL=https://ayahclip.vercel.app GOOGLE_CHROME=1 \
  npx playwright test e2e/security-boundaries.spec.ts e2e/production-smoke.spec.ts --project=google-chrome
```
