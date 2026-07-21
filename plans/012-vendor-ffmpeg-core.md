# Plan 012: Self-host the ffmpeg.wasm core (stop loading it from unpkg.com at runtime)

> **Executor instructions**: Follow step by step; run each verify step. On a "STOP
> condition", stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d06dd5a..HEAD -- src/lib/video-audio.ts next.config.ts`
> Confirm the excerpt still matches before editing.

## Status
- **Priority**: P2 (launch reliability + unblocks a stricter CSP)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but do before tightening CSP / SEC-07)
- **Category**: dependencies / reliability
- **Planned at**: commit `d06dd5a`, 2026-07-21

## Why this matters
Imported-video recognition extracts audio with ffmpeg.wasm, and the wasm **core** is fetched from a public CDN at runtime:
```
src/lib/video-audio.ts:8   const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
src/lib/video-audio.ts:22  coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
src/lib/video-audio.ts:23  wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
```
Live callers: `src/app/import/page.tsx:316-317` and `src/components/bulk/BulkCreateWorkspace.tsx:356-357` (single + bulk imported-video ASR). Consequences of the CDN dependency in a launch product:
- **Reliability**: imported-video recognition breaks when unpkg is slow/down, and on any offline/self-hosted deployment.
- **Security/CSP**: it forces the CSP to keep `connect-src`/`script-src` permissive — a same-origin core is a prerequisite for the stricter CSP in SEC-07.

The `@ffmpeg/ffmpeg` + `@ffmpeg/util` packages are already dependencies; only the **core** wasm/js is being pulled from the CDN. Vendoring it into `public/` makes the whole path same-origin.

## Current state
- `src/lib/video-audio.ts:5-6` imports `FFmpeg` from `@ffmpeg/ffmpeg` and `fetchFile, toBlobURL` from `@ffmpeg/util`.
- `CORE_BASE` (`:8`) points at unpkg; `load()` (`~:20-24`) blob-URLs the core from there.
- `@ffmpeg/core@0.12.10` is NOT currently a direct dependency — the exact-version core files must be obtained and committed under `public/`. (The version string `0.12.10` in `CORE_BASE` is the source of truth for which files to vendor.)
- CSP: `next.config.ts:6-12` sets no `connect-src`/`script-src` (so the unpkg fetch is currently allowed).

## Commands you will need
| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Build | `npm run build` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Unit tests | `npm test` | all pass |

## Scope
**In scope**:
- `public/ffmpeg/` (new — the vendored core files)
- `src/lib/video-audio.ts` (point `CORE_BASE` at the same-origin path)
- `.gitignore` (only if the wasm must be tracked — confirm it isn't ignored)

**Out of scope**:
- The CSP tightening itself (SEC-07 is its own plan) — this plan only *removes the blocker*.
- The ASR onnx model path (`NEXT_PUBLIC_ASR_MODEL_URL`) — a separate, already-configurable asset.
- The ffmpeg argv / trim / probe logic — unchanged.

## Steps

### Step 1 — Vendor the exact core files
Obtain `@ffmpeg/core@0.12.10` (the version in `CORE_BASE`) and copy its `dist/umd/ffmpeg-core.js` and `dist/umd/ffmpeg-core.wasm` into `public/ffmpeg/`. Get them from the already-installed package tree if present (`ls node_modules/@ffmpeg/core/dist/umd` — if `@ffmpeg/core` isn't installed, `npm pack @ffmpeg/core@0.12.10` and extract, or add it as a dependency purely to source the files; do NOT change the runtime import to a bundler import). Keep the version pinned and matching `CORE_BASE`'s version.

**Verify**: `ls -la public/ffmpeg/ffmpeg-core.js public/ffmpeg/ffmpeg-core.wasm` → both present; `git check-ignore public/ffmpeg/ffmpeg-core.wasm` → not ignored (if it is, add a `!public/ffmpeg/*` exception).

### Step 2 — Point the loader at the same origin
In `src/lib/video-audio.ts:8`, change `CORE_BASE` to the same-origin path:
```ts
const CORE_BASE = "/ffmpeg";
```
`toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, …)` then fetches `/ffmpeg/ffmpeg-core.js` from the app's own origin. Leave the rest of `load()` unchanged.

**Verify**: `grep -n "unpkg" src/lib/video-audio.ts` → no match; `npx tsc --noEmit` → exit 0.

### Step 3 — Prove the import-video path still works
Build and exercise imported-video recognition (the only consumer). If a browser is available: run `npm run build && npm run start`, import a short local video on `/import`, and confirm "Recognise verses" completes (audio extraction is the ffmpeg step). Otherwise rely on the build plus a code check that both callers still resolve `extractAudio`/`video-audio.ts` without the CDN.

**Verify**: `npm run build` → exit 0; in the browser (if available) imported-video recognition runs with the Network tab showing the core loaded from the app origin, not unpkg. STOP and report if the ffmpeg core fails to load from `/ffmpeg/…` (path/mime issue).

## Test plan
- No new unit test is strictly required (the change is an asset path), but if `video-audio.ts` gains a testable seam, assert `CORE_BASE` is a same-origin relative path (not `http(s)://`).
- Manual/e2e: imported-video recognition on `/import` and in `/bulk` completes offline (disconnect the network after the app loads, before importing a local file) — the core must come from `/ffmpeg/`.

## Done criteria
- [ ] `public/ffmpeg/ffmpeg-core.js` and `.wasm` committed (matching `@ffmpeg/core@0.12.10`)
- [ ] `grep -rn "unpkg" src/` → no matches
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` all exit 0
- [ ] Imported-video recognition verified working from the same origin (browser check or documented why deferred)
- [ ] Only in-scope files modified; `plans/README.md` row updated

## STOP conditions
- The vendored core version doesn't match `0.12.10` and the API/mime differs — align versions; do not mix a different core with the pinned `@ffmpeg/ffmpeg`.
- The wasm file is caught by `.gitignore`/LFS rules and can't be committed as-is — report the repo's large-asset policy rather than forcing it.
- `npm run build` or the runtime rejects the wasm mime type from `/ffmpeg/` — Next serves `public/` static; if a header/mime tweak is needed, note it and STOP rather than loosening the (future) CSP.

## Maintenance notes
- After this lands, SEC-07 can add `connect-src 'self'` / `script-src 'self'` without breaking ffmpeg — call that out when planning the CSP.
- Pin the core version in one place; if `@ffmpeg/ffmpeg` is upgraded, re-vendor the matching core.
- The onnx ASR model is already same-origin-or-configurable via `NEXT_PUBLIC_ASR_MODEL_URL`; this brings ffmpeg to the same standard (no third-party runtime origins).
