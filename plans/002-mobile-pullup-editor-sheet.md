# Plan 002: Turn the phone verse-editor dock into a draggable pull-up sheet

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5e086f1..HEAD -- src/app/studio/page.tsx src/components/FullscreenTimeline.tsx src/app/globals.css src/lib/timeline-gestures.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (direct user request)
- **Effort**: M–L
- **Risk**: MED
- **Depends on**: none (001 recommended first — same studio page, smaller diff lands first)
- **Category**: direction / mobile UX
- **Planned at**: commit `5e086f1`, 2026-07-20

## Why this matters

The owner edits on an iPhone and asked to "pull up the timeline/verse editor" in the studio. Today the phone editor is a fixed dock with exactly two sizes — a 48 px collapsed bar or `min(232px, 36dvh)` expanded — or a full-screen modal takeover (`FullscreenTimeline`) that hides the studio entirely. There is no in-between: on a phone you either edit captions in a cramped strip under the preview or lose the studio context completely. A draggable bottom sheet with snap points (peek / half / full) gives the timeline real vertical room while the preview stays visible, matching how CapCut-class mobile editors work — and PRODUCT.md principle 4 says "Touch is a first-class input, not an afterthought."

## Current state

No bottom-sheet library exists in `package.json` (no vaul/framer-motion/radix). The repo hand-rolls gestures and CSS transitions. Build the sheet from these existing pieces:

- `src/app/studio/page.tsx` — the studio shell.
  - Dock markup at lines 900–982. Key line 901:
    ```tsx
    <div data-testid="studio-timeline" className={`studio-timeline-dock relative z-20 flex shrink-0 flex-col overflow-hidden border-t border-[var(--hairline-soft)] bg-[var(--ink)] px-2 py-1 sm:px-3 lg:col-start-2 lg:row-start-3 lg:h-[188px] lg:py-0 ${timelineOpen ? "h-[min(232px,36dvh)]" : "h-12"}`}>
    ```
  - Dock header row (lines 902–966): collapse chevron + "Verse Editor" label, Captions/Timeline segmented toggle (imported mode only, lines 926–949), and an "Expand" button (lines 952–963) that sets `setTimelineFullscreen(true)`.
  - Editor branch (lines 972–980): imported+words → `<VerseCardEditor />`, imported+timeline → `<TimelineEditor compact />`, reciter → `<ReciterVerseEditor />`.
  - Comment at 968–971 (load-bearing constraint): **never two live TimelineEditors** — divergent undo histories and double audio decode. The dock editor unmounts while fullscreen is open.
  - "One surface at a time" on phones (lines 229–239): `openSettings(true)` closes the timeline and vice versa via `isDesktopWorkspace()`.
  - Overlays mount OUTSIDE the zoomed `<main>` (lines 1001–1009) because `<main>` gets CSS `zoom` and `.studio-shell-layout` has `contain: strict` (`src/app/globals.css:302-304`).
  - Mobile bottom nav `studio-mobile-tools` (lines 984–997), `lg:hidden`, height `calc(58px + env(safe-area-inset-bottom))`.
- `src/components/FullscreenTimeline.tsx` — the existing full-viewport editor takeover (175 lines): `fixed inset-0 z-50` dialog, focus trap + Escape (lines 31–71), a paused-playhead → `setPlaybackSegment` sync effect (lines 73–104), preview on top (`max-h-[42dvh]`, line 160) with the same editor branch below (lines 166–170).
- `src/lib/timeline-gestures.ts` — `timelinePointerTime` and `pinchZoom` helpers. Horizontal drags and pinch inside `TimelineEditor` are already consumed there; **no vertical-drag helper exists**.
- `src/app/globals.css:306-311` — `body.studio-active { height: 100dvh; overflow: hidden !important; }` — the page never scrolls; the sheet must own its gesture.
- Styling conventions: Tailwind classes with CSS variables (`var(--ink)`, `var(--hairline-soft)`, `text-gold-soft`), `dvh` units and `env(safe-area-inset-*)` for phone chrome (see dock and `FullscreenTimeline` header line 124). Reduced motion is respected globally (`globals.css:285-290`).

Desktop (`lg:`) is a fixed 3-zone grid where the dock is grid row 3 at 188px (globals.css:292-300 shrinks it to 164px on short screens). **Desktop behavior must not change.**

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`       | exit 0              |
| Unit tests| `npm test`               | all pass            |
| Lint      | `npm run lint`           | exit 0              |
| Deterministic e2e | `npm run test:ci:e2e` | all pass (starts its own server per `playwright.config.ts`) |
| Accessibility e2e | `npm run test:accessibility` | all pass |

## Suggested executor toolkit

- If a browser-driving skill/tool (Playwright MCP) is available, verify the sheet interactively at a 390×844 viewport before running suites.
- Read `docs/2026-07-18-market-readiness-roadmap.md` "Editor reliability" for the evidence bar this repo holds UI changes to.

## Scope

**In scope**:
- `src/app/studio/page.tsx`
- `src/components/EditorSheet.tsx` (create — the sheet container)
- `src/lib/sheet-gesture.ts` (create — vertical drag/snap logic, pure + unit-testable)
- `src/lib/__tests__/sheet-gesture.test.ts` (create)
- `src/app/globals.css` (only if a non-Tailwind rule is genuinely needed)
- `src/components/FullscreenTimeline.tsx` (only the wiring described in Step 5)
- e2e specs that assert on the dock (`grep -rn "studio-timeline" e2e/` first)

**Out of scope** (do NOT touch):
- `src/components/TimelineEditor.tsx`, `VerseCardEditor.tsx`, `ReciterVerseEditor.tsx` — the editors render inside whatever container they're given; do not modify them. (Their `compact`/`fullscreen` props may be *passed* differently, but their code stays.)
- The desktop `lg:` grid layout and the 188px/164px dock rows.
- `src/lib/timeline-gestures.ts` — the horizontal/pinch helpers stay as-is; the sheet gets its own module.
- `src/lib/imported-player.ts`, undo history (`timeline-history.ts`).

## Git workflow

- Branch: current working branch unless instructed otherwise.
- Commit style: plain imperative sentence (match `git log --oneline`), e.g. `Give phones a draggable pull-up verse editor`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build the pure snap/gesture model — `src/lib/sheet-gesture.ts`

A dependency-free module (mirrors the style of `timeline-gestures.ts`: pure functions, no React) implementing:

```ts
export type SheetSnap = "peek" | "half" | "full";
export interface SheetGeometry { viewportHeight: number; safeAreaBottom: number; }
// Heights in px for each snap given the viewport (peek = 48, half ≈ 45dvh, full ≈ viewport minus header/safe-area — final numbers tuned in Step 3)
export function snapHeight(snap: SheetSnap, geo: SheetGeometry): number
// Given drag start snap, total dy (px, +down), and velocity (px/ms), pick the landing snap:
// crossing the midpoint between two snaps moves to the neighbor; |velocity| > 0.5 px/ms flings one snap in the drag direction.
export function resolveSnap(start: SheetSnap, dy: number, velocityPxMs: number, geo: SheetGeometry): SheetSnap
// Dragging below peek by > 40px resolves to "closed"
export function resolveDismiss(start: SheetSnap, dy: number, velocityPxMs: number, geo: SheetGeometry): SheetSnap | "closed"
```

**Verify**: `npm test -- sheet-gesture` → the Step 2 tests pass (write tests first if following repo TDD habits — `src/lib/__tests__/` has the patterns).

### Step 2: Unit-test the model — `src/lib/__tests__/sheet-gesture.test.ts`

Model after `src/lib/__tests__/timing.test.ts` (plain vitest, table-driven). Cover: each snap's height for a 844px/34px-inset viewport; small drag returns to start snap; past-midpoint drag lands on neighbor; fling skips to next snap regardless of distance; drag-down from peek → "closed"; velocity sign vs dy sign disagreement (slow overshoot then flick back) resolves by velocity.

**Verify**: `npm test` → all pass including new file.

### Step 3: Create `src/components/EditorSheet.tsx`

A `"use client"` container rendered **outside `<main>`** (next to `FullscreenTimeline` at page.tsx:1003) on phones only:

- `fixed inset-x-0 bottom-0 z-40` panel, `bg-[var(--ink)]`, top border `border-[var(--hairline-soft)]`, rounded top corners, `translateY` positioned via inline style from the current snap height; `transition-transform duration-200` except while actively dragging; respect reduced motion (transition classes are already neutralized globally).
- A **drag handle header** (the only element that owns the vertical drag): reuse the dock's existing header row content — "Verse Editor" label + chevron, the Captions/Timeline segmented toggle for imported mode, and the Expand button. Attach Pointer Events (`onPointerDown/Move/Up` + `setPointerCapture`) on the handle strip only, feeding `resolveSnap`/`resolveDismiss`. **Do not** attach drag listeners on the editor body — `TimelineEditor` consumes horizontal drags and pinch there (`timeline-gestures.ts`), and vertical pans inside the body must scroll the editor's own `overflow-y-auto` content, not move the sheet.
- Content area: `overflow-y-auto overscroll-contain min-h-0 flex-1` hosting the SAME single editor branch the dock renders today (imported+words / imported+timeline / reciter). The branch is passed as `children` from the page so the sheet stays generic.
- Accessibility: `role="region"` `aria-label="Verse editor"`; handle is a `<button>` with `aria-expanded` and reachable snapping via keyboard (Enter cycles peek→half→full→peek). 44px minimum hit heights (the repo's standard, e.g. `min-h-11`).
- Bottom padding `env(safe-area-inset-bottom)`; when the sheet is at peek it must sit **above** the `studio-mobile-tools` nav (nav is `z-20`, height `calc(58px + env(safe-area-inset-bottom))` — offset the sheet's bottom by that height, or place the sheet below `z-20` and above the dock… simplest: `bottom: calc(58px + env(safe-area-inset-bottom))` so the tab bar stays tappable at every snap).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Wire it into `src/app/studio/page.tsx` (phones only)

- Add `const [sheetSnap, setSheetSnap] = useState<SheetSnap | null>(null)` alongside `timelineOpen`. On phones (`!isDesktopWorkspace()`), `openTimeline(true)` opens the sheet at `"half"` instead of expanding the dock; `openTimeline(false)` / drag-dismiss sets it to `null`. Keep the existing rule that opening settings closes the editor surface and vice versa (lines 229–239) — the sheet counts as the editor surface.
- Render the dock **only on desktop** (`hidden lg:flex` on the line-901 container) and render `<EditorSheet>` outside `<main>` for phones, hosting the same editor branch currently at lines 974–978. There must never be two live editors: dock is desktop-only, sheet is phone-only, and while `timelineFullscreen` is open the sheet's editor unmounts exactly as the dock's does today (comment at 968–971 — preserve this).
- Preserve `data-testid="studio-timeline"` on whichever container is visible (put it on both; only one renders per breakpoint) so existing e2e locators keep working.
- The collapsed 48 px bar today doubles as the *opener* on phones. Keep an equivalent affordance: when the sheet is closed, show the peek bar (the sheet at `"peek"` snap is the natural replacement for "collapsed"). Recommended: sheet is always mounted in studio on phones with snaps peek/half/full, and `openTimeline(false)` → peek rather than fully removed. This preserves discoverability and the accessibility scans' expectations of a visible "Verse Editor" control.

**Verify**: `npx tsc --noEmit` → exit 0; then run `npm run test:ci:e2e` — the deterministic suite includes phone-width accessibility scans of the expanded editor (see `e2e/accessibility.spec.ts`); all must pass.

### Step 5: Fold "Expand" into the sheet's full snap

The sheet's "full" snap should make the separate `FullscreenTimeline` takeover redundant *on phones*: at full height the preview above is mostly covered anyway. Keep it minimal: the sheet's Expand button (carried over in Step 3) still opens `FullscreenTimeline` — do NOT delete FullscreenTimeline in this plan. Only ensure: opening it from the sheet unmounts the sheet's editor (reuse the `timelineFullscreen` condition), and closing it restores the sheet at its previous snap.

**Verify**: `npm run test:accessibility` → pass (the fullscreen editor focus tests live here).

## Test plan

- New unit tests: `sheet-gesture.test.ts` (Step 2 cases).
- e2e: extend the existing studio timeline spec (locate via `grep -rn "studio-timeline" e2e/`) with a phone-viewport scenario: open Captions via the bottom nav → sheet appears at half → keyboard-cycle the handle to full → editor still shows the same verse content → Escape/close returns to peek. Model on the existing timeline-edit-safety spec's structure.
- Accessibility: `npm run test:accessibility` must stay green — it scans the expanded imported-audio studio at phone width.

## Done criteria

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` all exit 0 (incl. new sheet-gesture tests)
- [ ] `npm run test:ci:e2e` passes
- [ ] `npm run test:accessibility` passes
- [ ] On a 390px-wide viewport: the dock element with two fixed heights is gone; a draggable sheet with ≥3 snap heights exists (manual or Playwright check)
- [ ] Desktop `lg:` layout byte-identical in behavior: dock still fixed 188px grid row (visual check at 1280×800)
- [ ] Only one editor instance mounts at any time (no double `TimelineEditor` — assert via React devtools or a temporary `console.count` removed before commit)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The dock markup no longer matches the line-900–982 excerpt (drift).
- You cannot keep the phone accessibility scans green without modifying `e2e/accessibility.spec.ts` assertions themselves — report which assertion conflicts instead of weakening it.
- Preserving "one live editor" turns out to require changes inside `TimelineEditor.tsx` (out of scope) — e.g. undo-history state escaping the component.
- Sheet dragging measurably fights the timeline's horizontal gestures despite handle-only listeners (i.e. WebKit pointer-capture quirks) — report findings; do not ship a sheet that breaks scrubbing.

## Maintenance notes

- Compact-mode touch targets: audit finding MOBILE-UX-01 noted the dock's `compact` TimelineEditor buttons are 32 px (`TimelineEditor.tsx:1261,1301,1312,1417,1428`). The sheet's half/full snaps give more room — a follow-up may pass `compact={false}` at ≥half height, which fixes the target size without touching TimelineEditor. Deferred here to keep scope tight.
- If a future redesign retires `FullscreenTimeline` on phones, its paused-playhead sync effect (FullscreenTimeline.tsx:73–104) must move with it — the sheet-at-full experience depends on that behavior only via `StudioPreview`, which has its own subscription.
- Reviewer should scrutinize: iOS Safari rubber-banding and `dvh` behavior when the URL bar collapses (real device), and that `contain: strict` on `.studio-shell-layout` never clips the sheet (it mounts outside `<main>`, so it shouldn't).
