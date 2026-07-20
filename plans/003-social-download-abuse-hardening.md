# Plan 003: Bound anonymous abuse of the social-download (yt-dlp) endpoint

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5e086f1..HEAD -- src/app/api/social-download src/lib/social-download-jobs.ts src/lib/server-rate-limit.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (public VPS, expensive subprocesses, no auth layer)
- **Effort**: M
- **Risk**: MED (limits set too tight can throttle legitimate bulk users)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `5e086f1`, 2026-07-20

## Why this matters

ayahclip.com runs on a single self-hosted container (2 GB, `docker-compose.production.yml`) and its `/api/social-download` endpoint spawns a yt-dlp (and later ffmpeg) subprocess per job — up to 750 MB downloads with 15–35 minute kill timeouts. Three gaps combine into a cheap anonymous DoS + rate-limit bypass:

1. **No origin guard**: sibling routes (`telemetry`, `social-caption`) reject cross-site calls via `sec-fetch-site`; the social-download POST and its job sub-routes do not — any page or script on the internet can start jobs.
2. **No concurrency cap**: nothing bounds simultaneous yt-dlp/ffmpeg subprocesses; N parallel requests → N heavy processes in a 2 GB container.
3. **Refund-on-cancel**: a failed or cancelled job releases its rate-limit slot (`failJob` → `releaseSlotOnce`), so start→cancel churn consumes real CPU/network forever without ever exhausting the 30/10min allowance.

Additionally, the limiter keys on the **leftmost** `X-Forwarded-For` value, which is client-suppliable when the proxy appends rather than overwrites (Caddy's default appends). One spoofed header per request = unlimited fresh buckets.

## Current state

- `src/app/api/social-download/route.ts` — POST validates the link, checks `checkRateLimit` (line 63), then `startSocialDownloadJob` (line 72). **No `sec-fetch-site`/Origin check anywhere in the file.**
- `src/app/api/social-download/jobs/[jobId]/route.ts` — GET status / DELETE cancel, no guard of any kind (whole file is 25 lines; access controlled only by knowing the UUID). There is also a sibling `file/route.ts` (GET the finished media) with the same shape.
- `src/lib/social-download-jobs.ts`:
  - `jobs` map is per-process memory (line 183); `sweepExpiredJobs` (line 185) runs only when another request calls in.
  - `failJob` (lines 205–214) sets phase error and `releaseSlotOnce(job)` — the comment says "Only completed imports consume the rolling anti-abuse allowance." `cancelSocialDownloadJob` routes through `failJob`.
  - `startSocialDownloadJob` (lines 519–554) creates the job and fire-and-forgets `orchestrateJob` — **no count of active jobs is consulted**.
- `src/lib/server-rate-limit.ts` — `clientAddress` (lines 21–29):
  ```ts
  // Production is reachable only through the trusted TLS reverse proxy, which
  // overwrites X-Forwarded-For with the public client IP. ...
  return (request.headers.get("x-forwarded-for") ?? "local")
    .split(",")[0]
  ```
  Leftmost value. If Caddy appends (its default) instead of overwriting, this is attacker-chosen.
- The origin-guard convention to copy — `src/app/api/telemetry/route.ts:9-12`:
  ```ts
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  ```
- Existing tests: `src/app/api/social-download/route.test.ts` (command building, strategy, parsing) and rate-limit tests near `server-rate-limit.ts` (find via `grep -rln "resetRateLimitsForTests" src/`). Vitest, `npm test`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`       | exit 0              |
| Unit tests| `npm test`               | all pass            |
| Targeted  | `npm test -- social-download` | all pass       |
| Lint      | `npm run lint`           | exit 0              |

## Scope

**In scope**:
- `src/app/api/social-download/route.ts`
- `src/app/api/social-download/jobs/[jobId]/route.ts`
- `src/app/api/social-download/jobs/[jobId]/file/route.ts`
- `src/lib/social-download-jobs.ts`
- `src/lib/server-rate-limit.ts`
- Their test files (`route.test.ts`, rate-limit tests)
- `docker-compose.production.yml` / `.env` documentation ONLY as comments/README if a new env var is added (no secrets)

**Out of scope** (do NOT touch):
- `src/lib/source-link.ts` — URL validation is already sound (allowlisted hosts, https-only).
- `src/lib/social-import.ts` (client side) — behavior must keep working unchanged; it polls status and cancels on abort.
- The yt-dlp/ffmpeg argv construction — already array-based, no shell.
- Other API routes' rate policies (telemetry, social-caption, support) beyond the shared `clientAddress` fix.

## Git workflow

- Branch: current working branch unless instructed otherwise.
- Commit style: plain imperative sentence, e.g. `Bound anonymous social-download abuse`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix `clientAddress` to stop trusting client-supplied XFF entries

In `src/lib/server-rate-limit.ts`, replace the leftmost pick with a rightmost-minus-trusted-hops parse:

```ts
const TRUSTED_PROXY_HOPS = Math.max(0, Number(process.env.AYAHCLIP_TRUSTED_PROXY_HOPS ?? "1") || 0);
function clientAddress(request: Request): string {
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  // The proxy APPENDS the real peer, so the trustworthy entry is counted from
  // the RIGHT: with one trusted proxy hop, the last entry is the client.
  const fromRight = chain.length - TRUSTED_PROXY_HOPS;
  return (chain[fromRight >= 0 ? fromRight : 0] ?? "local").slice(0, 80) || "local";
}
```

Semantics: with the default `1` hop and Caddy appending the peer IP, `[attacker-junk, real-ip]` resolves to `real-ip`; a bare `[real-ip]` (proxy overwrote) also resolves to `real-ip`; header absent → `"local"` (dev). Update the misleading comment. The default of 1 hop is safe under both proxy behaviors: append (`[junk, real-ip]` → index 1 → real-ip) and overwrite (`[real-ip]` → index 0 → real-ip).

**Verify**: `npm test -- server-rate-limit` (or the file containing rate-limit tests) → pass, plus the new tests from the Test plan. `npx tsc --noEmit` → exit 0.

### Step 2: Add the origin guard to all three social-download routes

Copy the telemetry pattern verbatim into the top of: POST in `route.ts`, GET+DELETE in `jobs/[jobId]/route.ts`, GET in `jobs/[jobId]/file/route.ts`:

```ts
const fetchSite = request.headers.get("sec-fetch-site");
if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
```

Note the `[jobId]` handlers currently name the request param `_request` — rename to `request`. This blocks cross-site browser traffic while non-browser clients (no `sec-fetch-site` header) still pass — that is the same trade-off the repo already accepted for telemetry/social-caption; keep it consistent.

**Verify**: `npm test -- social-download` → existing tests pass (they call handlers directly — add the header to their mock requests only if they fail; prefer requests without the header, which remain allowed).

### Step 3: Cap concurrent jobs globally

In `src/lib/social-download-jobs.ts`:

- Add `const MAX_ACTIVE_JOBS = Math.max(1, Number(process.env.AYAHCLIP_MAX_ACTIVE_IMPORTS ?? "3") || 3);`
- Add a helper `function activeJobCount(): number` counting jobs whose phase is `"starting" | "downloading" | "processing"`.
- In `startSocialDownloadJob` (line 519), after `sweepExpiredJobs()`: if `activeJobCount() >= MAX_ACTIVE_JOBS`, throw a typed error (e.g. `export class ImportBusyError extends Error {}`) **before** `mkdtemp`.
- In `route.ts` POST, catch `ImportBusyError` and return `503` with `retry-after: 60` and a friendly message ("The import queue is full right now. Try again in about a minute."). Do this *after* the rate-limit check so a busy queue does not consume quota — and since quota is only consumed on completion anyway (see Step 4), simply let the busy path return before any slot bookkeeping.

Default of 3: two-plus-one headroom on a 2 GB single container where each yt-dlp+ffmpeg pair can use hundreds of MB. Operators can raise via env.

**Verify**: new unit test (Test plan case 3) passes; `npm test -- social-download` all green.

### Step 4: Count attempts that did real work — no refund on cancel or late failure

Keep the friendly UX for *cheap* failures but stop refunding *expensive* ones. In `social-download-jobs.ts`:

- Record `startedAt: number` on the job (set in `startSocialDownloadJob`).
- In `failJob` (lines 205–214), only call `releaseSlotOnce(job)` when the job died **before download did real work**: `job.phase` at time of failure was `"starting"` (probe/validation stage) — pass the prior phase into `failJob` or capture it before mutating. If the job had reached `"downloading"` or `"processing"`, do NOT release the slot.
- `cancelSocialDownloadJob`: same rule via the shared `failJob` path — a cancel during `"starting"` refunds; a cancel mid-download does not.
- Update the comment at lines 210–212 and the POST comment in `route.ts` (lines 60–62, 14–17) to describe the new rule: "Validation and extractor failures release their slot; anything that started downloading consumes it."

**Verify**: new unit tests (Test plan cases 4a/4b) pass.

### Step 5: Sweep on a timer, not only on traffic

`sweepExpiredJobs` currently runs only inside other calls. Add a module-level `setInterval(sweepExpiredJobs, 60_000)` guarded with `.unref?.()` (so tests/processes can exit) and a guard against double-registration under hot reload (e.g. store the interval on `globalThis` key check). Temp dirs from crashed jobs are then reclaimed within a minute rather than waiting for the next visitor.

**Verify**: `npm test` full run still exits (no hanging handles — vitest would time out otherwise).

## Test plan

In the existing test files (model after `src/app/api/social-download/route.test.ts` style; use `resetRateLimitsForTests()`):

1. `clientAddress` via `checkRateLimit`: two requests with `x-forwarded-for: "spoofA, 1.2.3.4"` and `"spoofB, 1.2.3.4"` share ONE bucket (previously two). A single-entry header `"1.2.3.4"` also maps to that bucket.
2. Origin guard: POST with `sec-fetch-site: cross-site` → 403; with `same-origin`, `none`, or absent → not 403.
3. Concurrency cap: with `MAX_ACTIVE_JOBS` jobs active (inject via starting jobs with a stubbed orchestrate, or export a test-only seeding helper mirroring `resetRateLimitsForTests` naming), POST → 503 with `retry-after`.
4. Slot accounting: (a) job failing from `"starting"` releases its slot (bucket count decremented); (b) job cancelled after reaching `"downloading"` does NOT release it.
5. Existing suites unchanged and green.

Verification: `npm test` → all pass including ≥5 new tests.

## Done criteria

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` all exit 0
- [ ] `grep -n "sec-fetch-site" src/app/api/social-download -r` → 4 handlers guarded (POST, GET status, DELETE, GET file)
- [ ] `grep -n "split(\",\")\[0\]" src/lib/server-rate-limit.ts` → no match (leftmost pick gone)
- [ ] New env vars documented where env vars are already listed (grep `AYAHCLIP_YTDLP_PATH` to find the spot — README or compose comments)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts don't match the live code (drift).
- `src/lib/social-import.ts` (client) turns out to send `sec-fetch-site`-less same-origin requests that the guard would block (it will not in real browsers — same-origin fetches send `same-origin` — but if any e2e spec fails on 403, report instead of loosening the guard).
- The rate-limit release is load-bearing for an e2e/production flow you can see (e.g. bulk import intentionally cancels and retries) — report the conflict rather than choosing a side.
- You find the `file/route.ts` handler shape differs materially from the status route (e.g. it already has guards) — reconcile with reality and note it.

## Maintenance notes

- These are warm-instance, in-memory bounds. The roadmap (docs/2026-07-18-market-readiness-roadmap.md §4) already names a distributed WAF as the authoritative launch-scale control; this plan is the in-app floor, not the ceiling.
- If the deployment ever adds a second proxy hop (CDN in front of Caddy), `AYAHCLIP_TRUSTED_PROXY_HOPS` must become 2 — note this next to the env var docs.
- Job-to-client binding (cookie/token so only the creator can poll/cancel/download their job) was considered and deferred: UUIDv4 + origin guard is adequate at current scale; revisit when accounts land.
- A reviewer should scrutinize: the busy-queue 503 path in the bulk workflow UI (does `social-import.ts` surface the 503 message cleanly?).
