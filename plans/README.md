# Implementation Plans

Two `improve`-skill audits are recorded here:
- **2026-07-20** (commit `5e086f1`) — original full product review → plans 001–008.
- **2026-07-21** (commit `d06dd5a`) — full re-audit (8 parallel passes: correctness×2, security, perf, tech-debt, tests, UI/UX+a11y, iOS/deps/DX/docs/direction), each reconciling the prior findings and auditing the ~4,600 lines changed since (Clip Library, refreshed marketing pages, bulk overhaul, word-highlight-in-export). Findings vetted against source by the advisor. → adds plans 009–012.

Baseline at `d06dd5a` is **GREEN**: `npx tsc --noEmit`, `npm run lint`, `npm test` (~442 vitest) all pass; `npm audit --omit=dev` = 0.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Preview-first export flow | P1 | S | — | **DONE** (ExportButton: Export + "Preview final MP4 first" → Mp4PreviewOverlay) |
| 003 | Social-download abuse hardening (origin guard, concurrency cap, XFF, no refund-churn) | **P1 — launch blocker** | M | — | **DONE (2026-07-21)** |
| 004 | Filesystem routes behind a server-side env switch | **P1 — launch blocker** | S–M | — | **DONE (2026-07-21)** |
| 005 | QCF partial-verse slice integrity | P1 | M | — | **DONE** (f6da5e8; no-match → undefined → safe Unicode fallback; guard tests) |
| 009 | Word-highlight export parity fixes (fast-path last/single verse; reciter-mode guard; split-segment preview) | **P1 — launch** | S | — | **DONE (2026-07-21)** |
| 010 | Autosave data-loss deps + bulk unmount abort | **P1 — launch** | S | — | **DONE (2026-07-21)** |
| 011 | Launch polish: kill orphan /design-showcase, plain-copy, `lang="ar"`, touch targets, a11y, reduced-motion | **P1 — launch** | S–M | — | **DONE (2026-07-21) — UX-07 (9px microcopy) & DEBT-01 (formatTimecode dedup) deferred** |
| 012 | Vendor ffmpeg-core off unpkg (self-host the wasm) | P2 | S | — | **DONE (2026-07-21)** |
| 006 | Studio playback perf (kill 60fps re-renders) + PERF-07/08 | P2 | M | land after 002 | **TODO (still open)** |
| 002 | Mobile pull-up verse-editor sheet | P2 | M–L | — | **TODO (still open)** |
| 007 | Bulk background processing | P3 (owner decision) | L | — | TODO |
| 008 | Bulk recognition roadmap | P2 | L | — | **PARTIAL** (B,C,F,H done; item A + cross-window merge + closed-vocab + Quran-tuned model + clip-scoring wiring remain) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED | REJECTED.

### The two launch blockers (both have ready plans, both still unimplemented)
- **003** — `/api/social-download` still has no origin guard, no subprocess concurrency cap, and `server-rate-limit.ts:25` still takes the leftmost (spoofable) `X-Forwarded-For`. Compound = cheap anonymous DoS of yt-dlp/ffmpeg (up to 750 MB, 15–35 min) on a 2 GB container (`docker-compose.production.yml:28`).
- **004** — filesystem routes are gated only on forgeable headers; `AYAHCLIP_SELF_HOSTED` is set (`Dockerfile:28`, `docker-compose.production.yml:22`) but **no code reads it**. **New severity note:** the frontend container joins the shared external `public_caddy` network (`docker-compose.production.yml:41-48`, `expose` not `ports`), so a co-tenant container on that network can reach `ayahclip-frontend:3000` directly, bypass Caddy, and forge `X-Forwarded-Host: 127.0.0.1` → unauthenticated filesystem write / library IDOR / disk-fill. A deny-by-default env gate closes this regardless of proxy hygiene.

## Full vetted findings — 2026-07-21 re-audit

Leverage = impact ÷ effort, discounted by confidence/fix-risk. Every row confirmed against source.

### Correctness / bugs
| # | Finding | Sev | Effort | Plan | Evidence |
|---|---------|-----|--------|------|----------|
| BUG-09 | Fast (WebCodecs) export drops the karaoke word-highlight on the **last/single-verse** clip — `cum[vi+1]` is `undefined` → duration 0 → `activeHighlightWord` returns null; preview shows it. Single-verse is the common karaoke case. | HIGH | S | 009 | `export.ts:909` vs `:754-761`,`:146` |
| BUG-10 | Fast export lights words in **reciter mode** where preview/realtime don't (guard missing `options.importedAudio`). preview≠export. | MED | S | 009 | `export.ts:908` vs `:586` |
| BUG-11 | Preview applies full-verse word-highlight index onto **split-verse** partial segments (wrong word lit); export suppresses. | MED | S | 009 | `imported-player.ts:127-139`, `StudioPreview.tsx:507` |
| BUG-01 | Autosave debounce effect's dep array **omits** `verseParts`, `arabicFontWeight`, `translationFontWeight`, `verseIntro/Ms`, and all 6 `highlight*` bar fields → editing only those + hard-refresh silently loses the edit. | HIGH | S | 010 | `studio/page.tsx:563-575` vs persisted `:445,451,461,484-499` |
| BUG-02 | `/bulk` never aborts in-flight ASR/link-import on unmount → ONNX keeps looping, IndexedDB checkpoint writes + setState after teardown. | MED–HIGH | S | 010 | `BulkCreateWorkspace.tsx:142,162` (no unmount abort) |
| BUG-03 | Export preloads QCF glyphs from selection-derived `verses`, not the rendered `rows` — latent Quran-integrity coupling if a timing ever carries an unselected verse. | MED | S | backlog | `export.ts:319-320` vs `clip-export.ts:93-97` |
| BUG-12 | WebCodecs `VideoEncoder`/`AudioEncoder` never `close()`d on the export error path (no try/finally) → leaked encoder handles across failed exports. | MED | S | backlog | `export.ts:771,801` |
| BUG-08 | `healDeadMediaUrls` re-mints without revoking. **Verdict: benign** (dead blob already unregistered) — nit only. | LOW | S | — | `clip-export.ts:44,53,63` |

### Security (see launch blockers above)
| # | Finding | Sev | Effort | Plan |
|---|---------|-----|--------|------|
| SEC-01/02/03 | social-download: leftmost XFF, no origin guard, no job cap, refund-on-cancel → anon DoS | HIGH | M | 003 |
| SEC-04 | filesystem routes on forgeable headers; env gate unread; co-tenant-reachable via shared docker net | HIGH | S–M | 004 |
| SEC-06 | job status/file/cancel routes UUID-only (defensible capability URL) | LOW | S | 003 |
| SEC-07 | CSP has no `default-src`/`script-src` — no XSS backstop (no active sink today) | HIGH-conf / defense-in-depth | M | backlog (pairs with 012) |
| SEC-08 | OpenAI caption excerpt unbounded (prompt-injection surface; bounded by strict json_schema + user review) | LOW | S | backlog |

### Performance (plan 006 items all still open)
| # | Finding | Sev | Effort | Plan |
|---|---------|-----|--------|------|
| PERF-02 | `setPreviewTick` re-renders StudioPreview ~60×/s in imported playback | HIGH | S | 006 |
| PERF-06 | `buildClipRows` rebuilt every render + every draw frame | MED | S | 006 |
| PERF-01/ARCH-01/03 | 10 components whole-store subscribe (no selector), 0 `React.memo`; per-frame playback state in global store | HIGH | M–L | 006/backlog |
| PERF-07 | QCF/Arabic line layout wrapped+measured ~3× per frame (5N `measureText`/frame) | MED–HIGH | S–M | 006 |
| PERF-08 | `TemplatePreview` allocates a fresh 1080×1920 canvas per gallery draw (~2×11 on /styles) — iOS memory | MED | S | 006 |
| PERF-04 | ObjectURLs never revoked (`page.tsx:110/116/124`, `BulkCreateWorkspace.tsx:610`) — iOS memory | MED | M | backlog |
| PERF-03 | rAF-effect ~55 deps. **Verdict: overstated** → reclass tech-debt (deps are stable refs) | LOW | — | — |

### Tech debt & architecture
| # | Finding | Sev | Effort | Plan |
|---|---------|-----|--------|------|
| ARCH-05 | TimelineEditor (2086) / StudioPreview (1021) mega-components, highest churn, no seam | MED | L | backlog |
| ARCH-04 | `canvas-utils.ts` — 56 exports / 22 importers junk drawer | MED | L | backlog |
| DEBT-01 | `formatTimecode` reimplemented 5× (canonical `source-link.ts:67`); `import/page.tsx` imports **and** duplicates it | LOW–MED | S | 011 (quick win) |
| DEBT-02 | orphan `/design-showcase` ships to prod: no refs, 5.7 MB `public/design-audit/`, leaks superdesign.dev team URL | MED | S | 011 |
| DEBT-03 | 3 persistence layers; `broll-library:*` key missing the `ayahclip:` prefix | MED | M | backlog |

### UI/UX & accessibility
| # | Finding | Sev | Effort | Plan |
|---|---------|-----|--------|------|
| COPY-01 | Banned flowery copy on the most-seen surfaces: OG image "Craft **luminous**…", meta/manifest "Craft polished", studio/footer "crafting" | HIGH (brand rule) | S | 011 |
| COPY-02 | "River **sanctuary**" background preset name (banned word) | MED | S | 011 |
| COPY-03 | Footer still calls it a "personal tool" post-launch pivot | MED | S | 011 |
| A11Y-01 | Core Quran Arabic rendered without `lang="ar"` (dir=rtl only) → wrong SR phonetics on the product's core content | HIGH | S | 011 |
| A11Y-03 | Active nav item color-only, no `aria-current` | MED | S | 011 |
| A11Y-02 | Two `<h1>` on the Templates/Clip-library page | LOW | S | 011 |
| A11Y-04 | Browse/gallery cards suppress the global focus ring | MED | S | 011 |
| MOBILE-UX-01 | Docked timeline transports 32px on phones (below 40px floor) | MED | S | 011 |
| UX-02 | Library clip-card actions 24–28px (below touch min) | MED | M | 011 |
| UX-03 | Library play badge hover-only (invisible on touch) | LOW | S | 011 |
| UX-04 | DESIGN.md color tokens stale — documents a failing-contrast value | LOW | S | 011 |
| UX-06 | `prefers-reduced-motion` zeroes duration but not delay → content pops in late | MED | S | 011 |
| UX-07 | Sub-11px microcopy (`text-[9px]`) in a few production spots | LOW | S | 011 |
| UX-08 | Home hero CTA row can overflow narrow phones (no `flex-wrap`) | MED | S | 011 |

### iOS shell, deps, DX, docs
| # | Finding | Sev | Effort | Plan |
|---|---------|-----|--------|------|
| IOS-01 | Off-origin links dead-end in WKWebView (no WKUIDelegate/`UIApplication.open`) → Stripe donation redirect + GitHub links silently fail in-app; App-Store 3.1.1 exposure | HIGH | S | backlog (+DIRECTION-03) |
| IOS-02 | Native export hard-rejects non-MP4; MediaRecorder webm fallback → hard dead-end on WebCodecs-less WebView | MED | S–M | backlog |
| DEP-01 | ffmpeg.wasm core loaded from **unpkg.com at runtime** (imported-video ASR); breaks offline/self-host, forces permissive CSP | HIGH | S | 012 |
| DX-03 | No iOS build/test CI job — 1,700-line Swift test suite never run in CI | MED | M | backlog |
| DX-02 | `.env.example` drift — `AYAHCLIP_SELF_HOSTED` documented-but-dead; `AYAHCLIP_YTDLP_PATH`, cache vars, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` read-but-undocumented | LOW | S | backlog |
| DX-01 | No `npm run typecheck` script | LOW | S | 011 (quick win) |
| DOCS-02 | `future-platform-and-growth-plan.md:233` + a spec still assert "no downloader / no watermark stripping", contradicted by shipped yt-dlp + `WatermarkCleanupService.swift` | MED | S | backlog |

### Test coverage (all additive → LOW fix-risk)
| # | Finding | Sev | Effort | Plan |
|---|---------|-----|--------|------|
| TEST-01 | export.ts money-path unit-uncovered; exact-MP4 e2e is **release-only, not gating CI** (systemic) | HIGH | L | backlog |
| TEST-05 | checkout route: 8 security/money gates untested (only the 502 branch is) | HIGH | S | backlog |
| TEST-06 | social-download route: YouTube rights-attestation (legal) gate untested | HIGH | S–M | backlog |
| TEST-08 | `/api/library` 409 id-collision data-loss guard untested | HIGH | S | backlog |
| TEST-07 | Clip Library `hydrateExampleClip`/`applyExampleBroll` compose path untested | HIGH | M | backlog |
| TEST-10 | `bulk-studio.ts` open/persist orchestrators untested | HIGH | S–M | backlog |
| TEST-09 | No render-output golden/pixel test; `drawScene` untested | MED | M–L spike | backlog |
| TEST-04 | `social-import.ts` untested | LOW–MED | S | backlog |

## Direction (options for the owner — grounded, cite evidence)
- **DIRECTION-01 — finish 008-F wiring**: `rankBulkCandidates` is shipped + unit-tested; only the presentation wiring into the bulk review grid remains (best-first). Cheap; the hard, integrity-sensitive half is done. (`plans/008:54`)
- **DIRECTION-02 — native detection bridge: wire or delete**: `detectionProgress`/`detectionResult` message types exist on both sides with a full payload struct but no web-side sender/handler — a half-built one-directional surface. Decide before it rots. (`mobile-bridge.ts:10-11`, `MobileEditorBridgeContract.swift:8-9`)
- **DIRECTION-03 — resolve the donation dual gap**: Stripe checkout is fully built but not live (`STRIPE_SECRET_KEY` unset) **and** blocked in the iOS shell (IOS-01). It returns value to no one today. Decide: set the key for web + hide/replace on iOS (IAP/compliant path).

## Findings considered and rejected / verdicts (do not re-audit)
- **Word-highlight-in-export** (prior addendum "known deferred gap"): the traveling highlight **was added** (88466c0/463c645) and IS in the run-length key — but the fast path has real residual bugs → now plan 009, not "done".
- **DOCS-01** ("post-pull-review claims no CI"): the same doc's addendum records the resolution — self-correcting dated review, not actively misleading. No action.
- **`@ffmpeg/*` dead-weight**: refuted — used by `video-audio.ts` (imported-video audio extraction). All 10 deps are imported.
- **Clip Library re-implements template rendering**: refuted — `example-clips.ts` composes existing primitives; `ExampleClipCard` reuses `TemplatePreview`. Clean reuse.
- **Second render path / duplicate export path**: refuted — single `drawScene` composition; `clip-export.ts` calls `export.ts`.
- **Bundle bloat (ffmpeg/onnx/transformers eager)**: refuted — all reached via `await import()` at event time; first paint clean.
- **Committed secrets**: none — the only `sk_live_` string is a deliberate test fixture (`checkout-route.test.ts:33`). No rotation needed.
- **iOS ATS / bridge**: clean — no `NSAllowsArbitraryLoads`, WKWebView confined to `ayahclip.com`, JS bridge validates envelope/size/origin and blocks `javascript:`/`data:`/`blob:`/`file:`.
- **PERF-03** (55-dep rAF effect): overstated — deps are stable refs; a pure re-render doesn't re-run it. Maintainability nit, not a perf storm.

## What was NOT audited
iOS Swift internals beyond the bridge/export/link surface and its own test suite; live-production probing; ASR/alignment model *quality* (separate benchmarks exist: `test:recognition`/`detection`/`alignment`); `e2e/` spec quality itself. The 003/004 exploitability also depends on the out-of-repo Caddyfile's `X-Forwarded-*` handling — worth one operator check.
