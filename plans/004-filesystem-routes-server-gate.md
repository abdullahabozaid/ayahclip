# Plan 004: Gate the disk-backed library on a server-side switch, not request headers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5e086f1..HEAD -- src/lib/local-origin.ts src/lib/library-server.ts src/app/api/save-export src/app/api/library`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (real design flaw; exploitability depends on proxy header hygiene)
- **Effort**: S–M
- **Risk**: MED (must not break the owner's own localhost/LAN workflow)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `5e086f1`, 2026-07-20

## Why this matters

The routes that read/write/delete files under `~/Documents/AyahClip/` (`/api/library/*`, `/api/save-export`) are guarded only by request-derived values: `x-forwarded-host`/`host`, `x-forwarded-proto`, `Origin`, and `req.nextUrl.hostname`. All of these are attacker-suppliable headers unless the reverse proxy is verified to strip/overwrite them — and no proxy config lives in this repo, so that guarantee cannot be audited here. A client that sends `Origin: http://127.0.0.1`, `X-Forwarded-Host: 127.0.0.1`, `X-Forwarded-Proto: http` passes `localMutationAllowed` if those headers reach Next.js — giving the public internet server-side filesystem read/write/delete. Meanwhile the deployment already sets an explicit `AYAHCLIP_SELF_HOSTED=1` env var in `docker-compose.production.yml` that **no code reads**. The fix: filesystem features are enabled by a server-side env switch; headers only refine same-origin checks after the switch allows them at all.

Note the deployment semantics before coding: `AYAHCLIP_SELF_HOSTED=1` is set on the *production public* container. That naming suggests it may have been intended to ENABLE the disk library on the owner's self-hosted box. This plan therefore introduces a precisely named new variable instead of guessing at the old one's intent — and flags the old one for the operator.

## Current state

- `src/lib/local-origin.ts` (55 lines, read in full):
  - `requestHost` (lines 26–30): `x-forwarded-host` preferred over `host` — client-suppliable.
  - `localMutationAllowed` (lines 41–54): requires `Origin` to equal `protocol//host` AND `isLocalNetworkHostname(origin.hostname)`. All inputs are request headers.
- `src/lib/library-server.ts:136-149`:
  ```ts
  export function originAllowed(req: NextRequest): boolean {
    return localMutationAllowed(req);
  }
  /** The disk-backed library is a localhost/LAN feature. Public deployments use
   * private browser storage and must never expose a shared server filesystem. */
  export function localRequestAllowed(req: NextRequest): boolean {
    return isLocalNetworkHostname(req.nextUrl.hostname);
  }
  ```
  (`req.nextUrl.hostname` is itself derived from forwarded/host headers in Next.)
- `src/app/api/save-export/route.ts:12-15` — POST gated on `localMutationAllowed(req)` only; then writes into `~/Documents/AyahClip/Exports` (path-traversal itself is correctly blocked at lines 42–45).
- `src/app/api/library/**` — routes call `originAllowed`/`localRequestAllowed` (find each call site: `grep -rn "originAllowed\|localRequestAllowed\|localMutationAllowed" src/app/api src/lib`).
- `docker-compose.production.yml:22` sets `AYAHCLIP_SELF_HOSTED=1`; `grep -rn "AYAHCLIP_SELF_HOSTED" src/` → no code reads it.
- Existing tests: `src/lib/__tests__/library-server.test.ts` and (locate others) `grep -rln "localMutationAllowed\|local-origin" src --include=*.test.ts`.
- Client behavior when these routes 403/fail: `src/lib/clip-export.ts:224-243` `saveFile` falls back to a browser download when `/api/save-export` is unreachable, and the library client code has a browser-storage path (memory: clips also persist in IndexedDB; `migrateLegacyClips`). So disabling the disk routes on the public server degrades gracefully — verify this claim in Step 4 rather than assuming.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`       | exit 0              |
| Unit tests| `npm test`               | all pass            |
| Lint      | `npm run lint`           | exit 0              |

## Scope

**In scope**:
- `src/lib/local-origin.ts`
- `src/lib/library-server.ts`
- Route files that call the guards (under `src/app/api/library/` and `src/app/api/save-export/`)
- Their tests
- `docker-compose.production.yml` (add the new env var set to disabled) and the README section that documents env vars

**Out of scope**:
- `src/lib/clip-library.ts` (client) — its fallback behavior is observed, not modified.
- Any auth/accounts system — explicitly future work per `docs/future-platform-and-growth-plan.md`.
- The header-based same-origin refinement itself — keep it as the second layer.

## Git workflow

- Branch: current working branch unless instructed otherwise.
- Commit style: plain imperative sentence, e.g. `Gate disk library routes on a server-side switch`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Introduce the server-side switch

In `src/lib/local-origin.ts` add:

```ts
/** Filesystem-backed features (disk library, save-export) run ONLY when the
 * operator explicitly enables them on a machine they own. Request headers can
 * never turn this on: headers refine WHICH origin may call, the env decides IF. */
export function filesystemFeaturesEnabled(): boolean {
  return process.env.AYAHCLIP_ENABLE_DISK_LIBRARY === "1";
}
```

### Step 2: Enforce it in every guard

- `localMutationAllowed`: first line `if (!filesystemFeaturesEnabled()) return false;`
- `library-server.ts` `localRequestAllowed`: same first line.
- Confirm via grep that every `/api/library/**` handler and `/api/save-export` passes through one of these two functions; add the check directly in any handler that bypasses both (report it too — see STOP conditions).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Wire the environments

- `docker-compose.production.yml`: add `AYAHCLIP_ENABLE_DISK_LIBRARY=0` with a one-line comment (public deployment: browser storage only). Leave `AYAHCLIP_SELF_HOSTED=1` untouched but add a comment that it is currently unread by code.
- Local dev must keep working: in `next.config.ts` or dev docs, note that `npm run dev` needs `AYAHCLIP_ENABLE_DISK_LIBRARY=1` for the disk library. **Better default for the owner's workflow**: default the flag ON when `NODE_ENV !== "production"`:
  ```ts
  return process.env.AYAHCLIP_ENABLE_DISK_LIBRARY === "1"
    || (process.env.AYAHCLIP_ENABLE_DISK_LIBRARY !== "0" && process.env.NODE_ENV !== "production");
  ```
  (dev: on unless explicitly off; production: off unless explicitly on.)
- Document both states wherever env vars are documented (grep `AYAHCLIP_YTDLP_PATH` for the spot).

### Step 4: Verify graceful client degradation

With the flag off (`AYAHCLIP_ENABLE_DISK_LIBRARY=0 npm run build && npm start` or dev with the var), exercise: an export save (should fall back to browser download per `saveFile`), and the /library page (should show browser-stored clips without server errors surfacing to the UI). If the library page hard-fails without the server routes, STOP and report — the client fallback assumption was wrong.

**Verify**: manual/Playwright check as above; no unhandled 403s in the console beyond the expected, silently-handled fetch failures.

### Step 5: Tests

Extend the guard tests (pattern: `src/lib/__tests__/library-server.test.ts`): with the env flag off, `localMutationAllowed`/`localRequestAllowed` return false even for a perfect localhost request; with it on, prior behavior is unchanged (existing cases). Use `vi.stubEnv` / save-restore of `process.env` per the repo's existing env-handling tests (grep `process.env` in `src/**/*.test.ts` for the idiom).

**Verify**: `npm test` → all pass.

## Test plan

Covered in Step 5; cases: flag off + valid localhost origin → denied; flag on + valid localhost → allowed; flag on + public-domain origin → denied (existing behavior); production-default (NODE_ENV=production, flag unset) → denied.

## Done criteria

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` all exit 0 (incl. new env-gate tests)
- [ ] `grep -rn "filesystemFeaturesEnabled" src/lib/local-origin.ts src/lib/library-server.ts` → both guards call it
- [ ] `grep -n "AYAHCLIP_ENABLE_DISK_LIBRARY" docker-compose.production.yml` → present, set to 0
- [ ] Flag-off run: export falls back to browser download; /library renders from browser storage
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any `/api/library/**` handler performs filesystem work without passing through `originAllowed`/`localRequestAllowed`/`localMutationAllowed` — patch nothing there yet; report the uncovered handler.
- The /library page hard-depends on the server store when the flag is off (Step 4) — the client fallback needs its own plan.
- You find code elsewhere reading `AYAHCLIP_SELF_HOSTED` (repo grep says none today) — reconcile intent before adding a second flag.

## Maintenance notes

- This makes the public VPS immune to header-forgery against filesystem routes regardless of Caddy configuration — defense stops depending on out-of-repo proxy hygiene.
- The operator decision to surface: is the *production* box meant to be the owner's personal disk library (memory notes say `~/Documents/AyahClip/Library` is used across browsers)? If yes, the operator can set the flag to 1 there consciously — the difference is it's now an explicit server-side choice, not a header-reachable default.
- When accounts land (future-platform plan), these routes should migrate to per-user private storage and this flag becomes the "single-tenant mode" switch.
