# AyahClip — Production Readiness & Post-Production Design

**Date:** 2026-07-16
**Status:** Approved for planning
**Supersedes:** nothing; complements the phase specs in this directory.

---

## 1. Context

AyahClip is a browser-based Quran-recitation → vertical-social-video studio. 19,157 LOC across
`src/`, 87 commits, 82 passing unit tests, clean `tsc` and `eslint`.

This spec is the output of a six-dimension audit (imported-audio timeline, design/AI-slop,
production readiness, clip library, mobile port, social import). It defines the work to make
AyahClip production-ready **as a personal studio tool**.

### 1.1 Decisions taken (2026-07-16)

| # | Decision | Consequence |
|---|---|---|
| D1 | **Audience: the owner only.** Not a public multi-user product. | No auth, no multi-tenancy, no per-user cloud storage. The disk-backed library stays. |
| D2 | **Kill the public Vercel deploy.** | Removes the entire security-hardening workstream (save-export auth, Host-header gate, CSP, rate limiting, public ASR hosting, SEO/OG surface). Largest single scope reduction. |
| D3 | **Correctness before polish.** | Phase 0 ships first. |
| D4 | **No 8-point star. Reduce chrome.** | Amend the art direction; the signature is the gold hairline + single glow + grain. Actively cut decoration. |
| D5 | **No TikTok/Instagram downloader.** | Serve the underlying need via the already-working video-file import path. See §8. |
| D6 | **Mobile: PWA → Capacitor. Never React Native.** | See §7. |

### 1.2 What is explicitly NOT broken

Recorded so nobody "fixes" it later:

- **Security model is sound for its threat model.** `safeId()` (`src/lib/library-server.ts:25`)
  blocks path traversal. `canonicalVideoType()` (`:37`) prevents stored XSS. No SSRF in
  `/api/pexels` or `/api/qcf-font`. No secrets reach the client.
- **Bundle discipline is good.** `onnxruntime-web`, `@huggingface/transformers`, `@ffmpeg/ffmpeg`
  are all dynamically imported and never in the main bundle.
- **WebCodecs degradation is real and thoughtful** (`src/lib/export.ts:274-290`).
- **`src/lib/store.ts` is 100% DOM-free** — verified. This is the most valuable port asset in the
  repo. Defend it (§7.3).
- **The Arabic font is correct.** `public/fonts/UthmanicHafs1Ver18.woff2` — cmap verified
  2026-07-16: 608 codepoints, all critical Hafs marks present incl. U+06DF. The old
  broken-jsDelivr-webfont warning no longer applies to the shipped font.
- **Typography loads correctly.** Marcellus + Outfit via `next/font`, no system-font leak.
- **Spacing is the healthiest axis** — only 4 arbitrary values repo-wide, all `env(safe-area-inset-*)`.
- **The ASR fallback chain** (forced CTC align → pause-scored `autoSegment` → proportional) is
  sophisticated, well-commented work.

---

## 2. Root causes

Nearly every finding is downstream of one of three structural faults. Fix the causes, not the
symptoms.

### RC1 — No chokepoint for timing mutations

`setVerseTimings` (`src/lib/store.ts:497`) accepts any array verbatim. Nothing validates or
normalises. Consequences:

- Two divergent `duplicateVerse` implementations that **already disagree**
  (`TimelineEditor.tsx:718` keeps `wordRange`; `VerseCardEditor.tsx:216` drops it).
- **Five copies** of the "which segment is at time t" loop: `FullscreenTimeline.tsx:54`,
  `imported-player.ts:153`, `StudioPreview.tsx:392`, `export.ts:142`, `audio-import.ts:108`.
- **Three copies** of the split→word-range mapping, with different fallback maths
  (`VerseCardEditor.tsx:594-612` vs `audio-import.ts:113-146` vs `:165-194`).
- Splits can escape their verse bounds; overlaps are reachable; nothing re-clamps.

### RC2 — Settings duplicated across four files

Every setting must be declared in `AppState` (`store.ts:23`), `Project["settings"]`
(`types/index.ts:76`), the `saveNow` literal (`studio/page.tsx:184`), and `restoreProject`
(`store.ts:414`). Verified drift: **3 fields silently never persist** — `translationVerseNumber`,
`wordHighlight`, `backgroundVideoSync`. All three are live user toggles in `StudioSettings.tsx`
(`:539`, `:450`, `:875`).

### RC3 — Incomplete design system

The system defines 13 colours; **~62 distinct colours ship**. Because:

- `--color-emerald-soft` is **not exported** in `@theme inline` (`globals.css:41-54`) → 28 Tailwind
  classes across 4 files compile to **zero rules**. The emerald split markers have never rendered.
- No `--danger` token → 14 `red-*` call sites improvise.
- No radius tokens → 155 `rounded-full` vs `.panel`'s 16px and `.field`'s 10px.
- No `--nav-h` → four different hardcoded values (65/69/72/88px), all wrong under a notch.
- `DESIGN.md:18-19` is **stale and dangerous**: its `--muted-deep: #5a607a` is 3.21:1 (WCAG AA
  fail). The shipped `#777d95` is 4.88:1 and passes. Trusting the doc re-breaks accessibility.

---

## 3. Phase 0 — Correctness (ships first)

Rule violated: *preview must match export* (`feedback_preview_export_parity`). Two live breaks.

### P0.1 — `wordRange` ignored in export ⚠️ parity

`effectiveAudioBounds` (`audio-import.ts:44`) is imported **only** by `imported-player.ts:8`.
`export.ts` never calls it.

- **Audio:** `export.ts:470-474` and `:573-578` slice `tm.start..tm.end`, re-including trimmed words.
- **Text:** `export.ts:133-140` `segmentFor` short-circuits when `!tm?.splits?.length`, so a verse
  with `wordRange` but no splits exports the **full** verse text. Preview shows 4 words; export
  shows 40.

Fix: route both export paths through `effectiveAudioBounds` / `verseTextAt`.

### P0.2 — Duplicated verses silently dropped from export ⚠️ parity

`export.ts:446` and `:574` use `.find(t => t.verseNumber === verse.verse_number)` — the second copy
is never found. `StudioPreview.tsx:369/385` index `verses[i]` vs `timings[i]`, which diverge after
any duplicate.

Fix: export and preview must iterate **`timings`** (the authoritative row list), resolving verse
text per timing — not iterate verses and look up timings. This is the correct model: a timing IS a
clip row; a verse is a text lookup.

### P0.3 — Three settings never persist

Fix `saveNow` + `Project["settings"]` for `translationVerseNumber`, `wordHighlight`,
`backgroundVideoSync`. (RC2 makes this permanent in P1.4.)

### P0.4 — Library deletes clips you cannot see

`selected` (`library/page.tsx:125`) is never reconciled against `filtered`. Select 5 → change
filter → Delete removes all 5 including the 4 off-screen. Confirm text says only "Delete 5 clip(s)?".

Also: "Select All" compares `selected.size === filtered.length` — **counts, not membership**
(`:403`, `:408`).

### P0.5 — Silent export loss

`saveRenderedToLibrary` discards `saveClip`'s boolean (`clip-export.ts:201`); `ExportButton.tsx:52`
shows nothing on success or failure. Disk-full → user sees success, clip never saved.

Fix: surface the result. Success and total loss must not look identical.

### P0.6 — Non-atomic writes corrupt the library

`library-server.ts:79` and `:111` are bare `fs.writeFile`. A crash truncates the JSON; `listMeta`
(`:60-64`) then **silently skips** the corrupt entry — the clip vanishes from the UI while its 36MB
video leaks on disk forever.

Fix: temp-file + `rename`. Also de-duplicate ids on POST (`api/library/route.ts:53-69` currently
overwrites any existing clip with a colliding id, destroying it).

### P0.7 — Commit the working tree

44 files / 1,543 insertions uncommitted, including all the library hardening. It isn't in git.

---

## 4. Phase 1 — Single source of truth

### P1.1 — `src/lib/timing-ops.ts`

Extract from `TimelineEditor.tsx:607-808` + `VerseCardEditor.tsx:216-290` as pure
`(timings, args) => timings` functions: `splitAt`, `removeSplit`, `setWordRange`, `duplicate`,
`moveBoundary`, `trim`, `deleteRow`.

Add `normalizeTimings(timings, duration)` enforcing the invariants that don't exist today:
ordering, `MIN_DUR`, no overlaps, splits clamped inside their verse, timings clamped to audio
duration. Call it in `setVerseTimings` (`store.ts:497`) — the single chokepoint.

Unit-testable (`src/lib/__tests__/timing.test.ts` already exists). Kills RC1.

### P1.2 — One undo history, in the store

`historyRef` is component-local in both `TimelineEditor.tsx:88` and `VerseCardEditor.tsx:95` —
byte-identical implementations. Consequences: toggling Word split/Timeline silently discards all
undo; dock + fullscreen keep **divergent** stacks so ⌘Z in the dock wipes every fullscreen edit.

Move to the store. Fixes:
- Phantom undo entries (`TimelineEditor.tsx:566` snapshots on every pointerdown, `:540` pushes
  unconditionally — a plain selecting click creates a no-op entry).
- Doubled entries on tap-to-split (`:657` and `:541` both fire).
- History surviving structural changes (`duplicateVerse` at `:718` doesn't clear it; `VerseCardEditor.tsx:258`
  correctly does).

### P1.3 — Unmount the dock editor when fullscreen is open

`studio/page.tsx:628` keeps `<TimelineEditor>` mounted while `:641` mounts `<FullscreenTimeline>`
→ `<TimelineEditor fullscreen>`. Two live instances → divergent histories, **triple** audio decode
(~100MB per `AudioBuffer` on a 10-min track), and a DOM-sniff hack (`:361`
`document.querySelector(".fixed.inset-0.z-50")`) to arbitrate keyboard focus.

The `fullscreen` prop's only real effect is one Tailwind height class (`:1287`).

### P1.4 — One settings schema

Derive `AppState` settings, `Project["settings"]`, `saveNow`, and `restoreProject` from a single
declaration. Kills RC2 permanently. Add a test asserting the four stay in sync.

### P1.5 — De-duplicate the shared logic

- `useAudioBuffer(url)` — module-cached, kills the double/triple decode
  (`TimelineEditor.tsx:143` + `VerseCardEditor.tsx:59`).
- `useVerseAlignment()` — `TimelineEditor.tsx:828-901` and `VerseCardEditor.tsx:328-400` differ only
  in an error string.
- `segmentAt(timing, t)` — one implementation, replacing all five copies.

### P1.6 — Leaks

- Object URL leak on every import (`import/page.tsx:143`, never revoked; `store.beginNewProject`
  and `clearImportedAudio` reset without revoking; `clip-export.ts:42/51/62` mint replacements
  without revoking the dead ones).
- Window listeners leak on unmount mid-drag (`TimelineEditor.tsx:582`, `:463` — removal only in
  `onDragEnd`/`onScrubEnd`, no `useEffect` cleanup).
- Zombie loop region after delete (`imported-player.ts:225`).
- `beginNewProject` (`store.ts:528`) doesn't reset `emphasis` → re-importing the same surah
  inherits the previous clip's word emphasis.
- Re-render storm: `TimelineEditor.tsx:51` and `VerseCardEditor.tsx:88` subscribe to the **whole**
  store, re-rendering every card at 60fps during playback.

---

## 5. Phase 2 — Design system & de-slop

### P2.1 — Complete the tokens (mostly one-liners)

1. `globals.css:49` — add `--color-emerald-soft: var(--emerald-soft);`. **Un-breaks 28 dead classes
   and restores the split-marker feature that has never been visible.**
2. Add `--danger` / `--danger-soft` + `--color-danger`. Legitimises 14 `red-*` sites.
3. Add `--nav-h`. Replaces 4 wrong hardcoded values; fixes 3 responsive bugs at once.
4. Add radius tokens.
5. Either use the `@theme` aliases or delete them — `--color-muted-fg`, `--color-surface`,
   `--color-ink`, `--color-ink-deep` compile to **0 rules each** while everything uses
   `bg-[var(--surface)]` arbitrary syntax. 70% decorative today, and that's exactly what made
   `emerald-soft` look plausible.
6. **Fix `DESIGN.md:18-19`** before someone trusts it and re-breaks AA.

### P2.2 — Amend the art direction (D4)

Remove the 8-point star from the brief. Record: signature = gold hairline + single gold radial glow
+ 2.5% grain. Then cut chrome to match:

- 155 `rounded-full` → audit down to pills that are actually pills.
- 12 `backdrop-blur` → remove from a 24px checkbox (`library/page.tsx:658`) and 24/28px buttons
  (`DashboardCard.tsx:79`, `:97`). Blurring a 24px square is pure cost.
- 3 near-identical bespoke drop shadows (`20/50/-15`, `30/60/-25`, `24/60/-20`) → one
  `--shadow-float`.
- `shadow-[0_0_0_1px_...]` fake borders → `ring-1`.

### P2.3 — The actual slop

- Delete `✨` (`import/page.tsx:259`, `VerseCardEditor.tsx:472`) — the most recognisable tell.
- Replace **30 emoji-as-icons** across 10 files with the existing hand-rolled SVG set
  (`SiteNav.tsx:121-147`). Priority: `⧉`/`⛶` render as tofu on Android/Windows.
- **Rewrite `PexelsSearch.tsx`** (113 lines, never migrated): `bg-emerald-600` — literally the
  forbidden generic emerald — on a primary button; raw inputs instead of `.field`;
  `text-gray-400/500`, `text-red-400`.
- `StockLibrary.tsx:51` `text-gray-600` @10px = **2.47:1**, worst contrast in the app.
- `emerald-300/400/500` → `emerald-soft`/`emerald-accent`; `amber-*` → `gold`/`gold-soft` (11 sites).

### P2.4 — Typography

**129 arbitrary sizes; 18 distinct steps.** `text-[11px]` is the third most-used size in the app
and isn't in the scale. `text-[12px]` is literally `text-xs` written longhand 14 times.
`[13px]/[14px]/[15px]` are three sizes in a 2px band. `DESIGN.md:32` demands a ≥1.25 ratio; actual
ratios are 1.07–1.11.

Collapse `[9px]…[13px]` → `text-xs`/`text-sm`: **removes 123 of 129 arbitrary sizes**.

Only 2 font weights are in use despite Outfit being loaded variable. A weight axis lets us delete
half the size steps — hierarchy currently leans entirely on colour + size, which is *why* 18 sizes
accumulated.

Move the 4 user-selectable translation fonts (`layout.tsx:16-19`) off every-page load.

### P2.5 — Accessibility & responsive

- `SupportForm.tsx:120` — `outline-none` with no replacement on a payment input. Delete it.
- `PexelsSearch.tsx:45` — `outline-none focus:border-white/20` (~1.2:1, and `focus:` not
  `focus-visible:`).
- Hit targets: `TimelineEditor.tsx:1373` is **16×16**; `library/page.tsx:381` is a bare unpadded
  `<button>` inside a styled pill. Floor is 36px per `DESIGN.md:62`.
- `aria-label` on icon-only buttons (`title` is not an accessible name).
- `aria-hidden="true"` on the three decorative `﷽` glyphs — screen readers announce the full Basmala.
- Replace `confirm()`/`alert()` (`library/page.tsx:186/238/253/259`, `page.tsx:30/52`) — on iOS the
  system sheet shatters the art direction entirely.
- `grid-cols-1 xs:grid-cols-2` on the three card grids (at 390px cards are ~167px wide holding 4
  buttons — overflows). `flex-wrap` on `styles/page.tsx:273` and `:529`.
- `library/page.tsx:400` bulk bar wraps to ~140px sticky at 390px and overlaps the nav.
- `browse/page.tsx:91` `text-[clamp(2.25rem,6vw,3.5rem)]` is the only fluid type in the app and is
  exactly right — make it the pattern.

---

## 6. Phase 3 — Timeline UX ("clumsy")

### P3.1 — Decompose `TimelineEditor.tsx` (1528 → ~250)

Seams, in payoff order: `useTimingHistory` (P1.2) → `lib/timing-ops.ts` (P1.1) →
`useAudioBuffer` (P1.5) → `<Waveform>`/`<Minimap>` (`:169-243`) → `useTimelineViewport`
(`:246-273`, `:811-824`) → `useTimelineDrag` (`:436-600`) → `useVerseAlignment` (`:828-901`) →
`<TimelineInspector>` (`:1083-1240`) → `<CaptionsTrack>` (`:1431-1472`).

`VerseCardEditor.tsx` (999) follows the same extractions.

### P3.2 — Destructive actions must warn

`redetect` and `deepAlign` (`TimelineEditor.tsx:833`, `:853`) `commit()` results that **wipe every
`splits`, `splitWords`, `splitWordTotal` and `wordRange`** — no warning, no confirm. Undo works, but
nothing hints that one click destroys all your split work.

`deepAlign` also silently **deletes** duplicate rows (it dedupes to unique verse numbers).

### P3.3 — `redetect` produces garbage after a duplicate

`verseNumbers = cur.timings.map(...)` keeps duplicates, but `getVerseWeights` returns exactly
`hi-lo+1` weights. Length mismatch → `weights[i] === undefined` → `NaN` propagates →
`autoSegment` (`audio-import.ts:374-393`) silently locks onto the first pause in each window. No
error surfaces.

### P3.4 — Real gaps

- **You can duplicate in the timeline but not delete there** — `deleteImportedVerse` is only wired
  into `VerseCardEditor`. Nor can two rows be merged back.
- **The pauses you snap to are never drawn** (`pausesRef`, `:154`) — snapping is invisible magic.
- No keyboard nudge of the selected boundary (arrows seek the playhead instead).
- Zoom recentres on the playhead (`:267`), so ⌘+wheel over a spot 30s away jumps you elsewhere.
- No multi-select; every mutation takes a single `verseIdx`.
- Loop is verse-only, polled in rAF with a 20ms fudge (`imported-player.ts:64`) — audibly imprecise.
- `L`/`R` shortcuts are implemented (`:400-422`) but missing from the shortcuts dialog (`:1508`).

### P3.5 — Honest errors

`forceAlignVerses` returns `null` at four distinct points; all collapse to one string. Any throw →
*"Deep align failed (model couldn't load). Check your connection"* — from a bare `catch {}` with no
`err` binding, so an OOM, an ONNX crash and a 404 all blame the network. Nothing is logged.

- No confidence surfaced. `matchVerses` (`verse-match.ts:270`) **computes** a score and gates on
  `MIN_SCORE`, then `import/page.tsx:66-78` throws it away.
- `asr.ts:59` dithers with `Math.random()` → Deep align is **non-deterministic**; two runs on the
  same file give different boundaries with no explanation.
- Silent audio → `autoSegment` hands every verse an equal slice of silence with no message.
- No file size/duration cap: `logSoftmaxPerFrame` (`asr.ts:271`) allocates ~4MB per 10s; a 30-min
  upload OOMs the tab with no guard.
- Loading: `pct()` with `duration === 0` piles every block at `left: 0%` during decode.

### P3.6 — Captions track misalignment

`TimelineEditor.tsx:1441` zips `verseSegments(...)` against `points` by index, but `verseSegments`
(`audio-import.ts:171-193`) **conditionally skips** segments — so with a `wordRange` excluding a
whole segment, every caption after the skip is drawn at the wrong time.

---

## 7. Phase 4 — Library / post-production

Measured today: 24 meta files (686KB), 23 videos (0.83GB), ~30KB metadata per clip.

### P4.1 — Thumbnails out of the meta JSON

`captureThumbnail` (`clip-library.ts:315`) emits a 480×854 JPEG **data URL stored inside the meta
JSON** — observed 4KB–113KB per clip. `GET /api/library` returns all of it, always, with no
pagination or `Cache-Control`. `listMeta` (`library-server.ts:54-67`) `await`s inside a `for` loop
— serial I/O.

| clips | payload per page load |
|---|---|
| 23 (today) | 686 KB |
| 800 (40 reciters × 20) | **~24 MB** |

Rendering is worse: `page.tsx:636` renders every thumbnail with no `loading="lazy"` and no
virtualisation. Decoded, 800 × 480×854 RGBA ≈ **1.3GB**.

Fix: `thumbs/<id>.jpg` beside `videos/<id>.mp4`, served by a route. The architecture already has
this pattern — the thumbnail is the one field that ignored it.

### P4.2 — `projectId` on `LibraryClip`

`saveRenderedToLibrary` (`clip-export.ts:185`) builds the clip from live store state but never
records `s.projectId` — which is right there (used at `:39`). **One field unlocks re-export,
version history, and duplicate detection.** Its absence is why all three are missing, and why the
library is a one-way door.

### P4.3 — The calendar is the product, and it isn't a calendar

`page.tsx:500-563` "Calendar" view is a **vertically stacked list grouped by date**. No grid, no
empty days, no month nav, no drag-to-reschedule, **no today marker, no overdue distinction**. A clip
scheduled last Tuesday looks identical to one scheduled next Tuesday.

It cannot answer "what's due today?" or "what did I miss?" — the only two questions a content
calendar exists to answer. Also: posted clips render under "Unscheduled" (`:284` filters
`status !== "scheduled"`, which includes `posted`) — finished work displayed as backlog.

### P4.4 — Missing at 40-reciter scale

Bulk **schedule** (the bulk bar has move/share/delete only — the most obvious bulk op for a calendar
app is the absent one); search (no text input exists); sort (hardcoded `createdAt` desc); tags;
per-reciter coverage matrix; duplicate detection; quota warnings.

**Captions:** `notes?: string` is declared (`clip-library.ts:27`) and **never read or written
anywhere** — a dead field. The clip reaches the phone; the caption doesn't.

### P4.5 — Storage waste (measured)

- **Every clip is stored twice.** `saveRenderedToLibrary` → `Library/videos/`, then `saveFile`
  (`ExportButton.tsx:60`) → `Exports/`. 0.83GB library ⇒ ~0.8GB shadow.
- **~1/3 of the library is redundant re-exports** (`Al-Waqi'ah 49–56` ×3, `Az-Zumar 1–4` ×2,
  `Fatir 2–3` ×2 at 33,258,780 and 33,256,158 bytes …) ≈ 300MB. Caused by P4.2.
- Orphan GC: nothing reconciles `videos/` against `meta/`. Crash between the two writes
  (`api/library/route.ts:68-69`) orphans a video permanently.

### P4.6 — Projects vs Library incoherence

Two disconnected stores, two thumbnail systems, **byte-identical id generators**
(`projects.ts:86-88` ≡ `clip-library.ts:64-66`), and a duplicated grid UI (`app/page.tsx:34-56`
reimplements the library's select/bulk-delete).

The library moved to disk *because* IndexedDB was per-browser — but **projects are still in
IndexedDB**. So the editable half still has exactly the problem the library was built to fix: open
Safari instead of Chrome and your projects are gone while your clips are fine. Resolve.

### P4.7 — Getting to the phone

`bulkShare` (`page.tsx:156-204`) loads **every selected video fully into memory** (10 × 36MB =
360MB of `File` objects) before opening the sheet — OOMs a phone. Non-Safari gets an alert telling
you to use Finder. Per-clip download on iOS **cannot reach the camera roll**.

`URL.revokeObjectURL` fires synchronously after `a.click()` (`:267`, `:197`) — races the download.

### P4.8 — Decompose `library/page.tsx` (796 → ~200)

`useLibraryClips` / `useFolders` / `useClipSelection(filtered)` (fixes P0.4 by construction) /
`<LibraryToolbar>` / `<FolderChips>` / `<BulkActionBar>` / `<ClipGrid>` / `<CalendarView>` /
`<ScheduleEditor>` / `lib/library-format.ts`. The `<ClipCard>` prop block is repeated **verbatim
three times** (45 duplicated lines).

Also: `byDate`'s `useMemo` (`:271`) never hits — it depends on `filtered`, rebuilt every render at
`:217`.

---

## 8. Phase 5 — Import (the legitimate path)

**Decision D5: no downloader.** Rationale, engineering first:

- yt-dlp — ~1,400 extractors, weekly releases — has had TikTok extraction **broken for months**
  (issues #15629, #15418, #14508, Dec 2025 → Jan 2026). A solo-maintained version would be down
  more than up. Permanent maintenance tax on a feature that also carries legal risk.
- ToS breach on both platforms. The reciter's **performance** is copyrighted even though the Quran
  text is public domain.
- "Without watermarks" specifically triggers **17 U.S.C. §1202** (CMI removal): $2,500–$25,000 per
  violation, fee-shifting, criminal exposure for willful commercial use. The feature's name supplies
  the intent element a plaintiff would otherwise have to prove.
- Kills any App Store listing under **guideline 5.2.3**; rejections attach to the **developer
  account**, not just the app. Directly contradicts D6.
- TikTok's Display API returns **metadata and embed players only** — no media download, at any
  effort. Instagram Basic Display was shut down 4 Dec 2024. There is no sanctioned path for other
  people's content.

**The legitimate 90% already ships and is undiscoverable.** `decodeAudioFile` (`audio-import.ts`)
already accepts **video files and extracts the audio track**; `autoSegment` then splits by verse
with real pause detection. So: user hits TikTok's own share sheet → saves to camera roll → drags the
mp4 in. The platform performs the export; AyahClip is the editor, not the downloader. Zero
maintenance, zero risk, works today.

Work:
1. **Surface it.** Rewrite the import affordance + empty state: *"Drop an audio **or video** file —
   we'll pull the recitation out and split it by verse."* Highest demand-served-per-effort in the
   audit.
2. **Fix the `.mov` error.** `library/page.tsx:93` → QuickTime → `canonicalVideoType` returns null →
   415 → user is told **"storage may be full."** `.mov` is what a phone records.
3. **Expand `reciters.ts`** (11 today) — a data problem with a known shape.
4. **EveryAyah attribution.** Its timings carry a disclaimer requiring a link back to
   VerseByVerseQuran.com. Likely owed and not rendered. Cheap. *(Also: EveryAyah is generally
   treated as CC-BY-NC — fine for a free app + donations, but re-examine before any paid tier.)*

---

## 9. Phase 6 — Mobile foundation

**D6: PWA (1–2 wk) → Capacitor (3–5 wk) when App Store presence matters. Never React Native.**

Why Capacitor fits *this* codebase unusually well: the standard blocker — COOP/COEP headers for
`SharedArrayBuffer` WASM threading, unfixable under `capacitor://` — **does not apply**. This app
already pins `ort.env.wasm.numThreads = 1` (`asr.ts:169`) and loads single-thread CDN cores
(`video-audio.ts:2-3`); zero `SharedArrayBuffer` in `src/`. iOS 26 WKWebView has full WebCodecs, so
`exportVideoFast` survives. Safari's `MediaRecorder` only emits MP4/H.264/AAC — already the first
entry in `MIME_PREFERENCE` (`export.ts:390`).

Why **not** React Native: throws away 10,744 LOC of TSX; `ffmpeg-kit-react-native` was **retired
Jan 2025** (binaries pulled); the only purpose-built Skia→MP4 library self-describes as "beta, very
unstable" with **no audio support** — for a recitation app. The honest path terminates in
hand-written AVAssetWriter/MediaCodec glue, at which point RN's value proposition has collapsed.
RN-Skia's Arabic shaper is also unverified, and mis-rendered Quranic text is a fatal bug class here.

### Do now (each fixes a live bug or removes a known blocker)

1. **Fix `browserLibraryMode()`** (`clip-library.ts:41-50`) — sniffs `window.location.hostname`.
   Capacitor serves from `capacitor://localhost` → `local = true` → routes clips to a disk API that
   doesn't exist in a bundled app. Switch to an explicit capability flag. One hour; guaranteed
   day-one bug.
2. **Guard export against backgrounding.** `export.ts:517`'s rAF loop stalls when backgrounded and
   `exportRealtime` is audio-clock-driven → corrupt file. Add `visibilitychange` + Wake Lock. Live
   bug today.
3. **Defend `store.ts` purity** with a lint rule/test failing on `window`/`document`/`Blob`. It is
   currently 100% DOM-free by discipline — 540 LOC of guaranteed reuse.
4. **Widen the `drawScene` seam.** `SceneMedia` (`render-core.ts:99-114`) hard-types
   `HTMLImageElement`/`HTMLVideoElement`, but they're only ever passed to `ctx.drawImage` — narrow to
   a `CanvasImageSource`-like alias. Move `getIntroCanvas()`'s `document.createElement`
   (`canvas-utils.ts:520`) out of the renderer.
5. **Storage interface** (~30 lines) over `idb-keyval` (`clip-library.ts:4`, `projects.ts:1`).
   Improves tests today.
6. **Isolate font registration** (`qcf-font-loader.ts:18-23`, `canvas-utils.ts:83-91`).

**Record, don't build:** the QCF path (`code_v2` PUA codepoints, `canvas-utils.ts:404`) needs **no
Arabic shaping engine** — it's a glyph blit. It's the portability escape hatch; a QCF-only mobile v1
removes the highest-risk unknown entirely. The `text_uthmani` path is the one needing HarfBuzz.

---

## 10. Out of scope (with reasons)

| Dropped | Why |
|---|---|
| Auth, multi-tenancy, cloud storage, quotas | D1 — single user |
| `save-export` auth, Host-header gate, CSP, HSTS, rate limiting | D2 — no public deploy |
| ASR model hosting (R2/S3), `NEXT_PUBLIC_ASR_MODEL_URL` | D2 — model is served locally from `public/asr/` and works |
| SEO, `opengraph-image.tsx`, `NEXT_PUBLIC_SITE_URL` | D2 |
| Stripe webhook / donation reconciliation | D2 — no public donations. Keep the route; it fails closed. |
| TikTok/Instagram downloader | D5 — §8 |
| React Native rewrite | D6 — §9 |
| 8-point star pattern | D4 |

`/api/asr-model` is **dead code** (referenced by nothing in `src/`, points at a private repo). Delete it.

---

## 11. Testing strategy

Today: 82 tests, 9 files, **all pure-function**, 291ms. Zero component tests, zero route tests, and
`export.ts` (~700 LOC, the product's core) has **zero coverage**.

Add, in order:
1. `timing-ops` invariants (P1.1) — pure, high-value, guards RC1.
2. **Preview/export parity** — the same `(timings, settings)` must yield identical text+audio spans
   from the preview path and the export path. This is the regression test for `feedback_preview_export_parity`
   and would have caught both P0.1 and P0.2.
3. Settings round-trip: `saveNow` → `restoreProject` → deep-equal (P1.4).
4. `library-server` guards (`safeId`, `canonicalVideoType`) — pure, dependency-free, currently
   untested despite being the security boundary.
5. Component tests for the timeline drag/undo state machine.

Add CI (`.github/workflows`) running `test` + `tsc --noEmit` + `lint` + `build`. None exists.

---

## 12. Sequencing

| Phase | Content | Rough size |
|---|---|---|
| **0** | Correctness — parity, persistence, data loss, atomic writes, commit | ~2 days |
| **1** | Single source of truth — timing-ops, undo, settings schema, leaks | ~4 days |
| **2** | Design system, de-slop, a11y, responsive | ~3 days |
| **3** | Timeline decomposition + UX | ~5 days |
| **4** | Library / post-production | ~5 days |
| **5** | Import surfacing, reciters, attribution | ~1 day |
| **6** | Mobile foundation (do-now items) → PWA | ~3 days |

Phases 0 and 1 are ordered dependencies. 2–6 are independent and may be reordered or parallelised.

**This spec is deliberately larger than one implementation plan.** Each phase gets its own
spec→plan→implement cycle; this document is the umbrella that keeps them coherent and records why
the scope is what it is. The immediate next artifact is a plan for **Phase 0 only**.

Per the project's model-routing convention, substantial implementation is delegated to Codex
(`codex:codex-rescue`); the main thread plans and reviews.

---

## 13. The single most important thing

If only one paragraph survives: **the editor currently lies about what it will export.** Trim a
verse to 4 words and preview shows 4 while export emits 40. Duplicate a verse and the editor shows
two rows while export silently emits one. Everything else in this document — the design system, the
calendar, the mobile port — is worth nothing until the preview tells the truth, because every
styling decision is made against a preview that isn't the artifact. Phase 0 first.
