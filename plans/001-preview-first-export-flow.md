# Plan 001: Make every export flow through the in-app fullscreen preview (no forced download)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5e086f1..HEAD -- src/components/ExportButton.tsx src/components/Mp4Preview.tsx src/app/studio/page.tsx src/lib/clip-export.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (direct user complaint)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction / UX bug
- **Planned at**: commit `5e086f1`, 2026-07-20

## Why this matters

The product owner (editing on an iPhone) reports: "preview final MP4 makes me download it — let me press fullscreen on the phone and watch the preview in-app." The fullscreen in-app player **already exists** (`Mp4PreviewOverlay` plays the rendered blob inline via `<video playsInline>` — no download involved), but the flow hides it: the primary gold "Export video" button renders and immediately hands the file to the OS (share sheet / native Photos save / download) with no watch step, while the watch step sits behind a secondary button and behind a studio-header button confusingly labeled "Export". This plan makes preview-then-save the single canonical flow and fixes the labels, plus guards the one case where the preview genuinely cannot play (webm fallback on iOS WebKit).

## Current state

Relevant files:

- `src/components/ExportButton.tsx` — the inspector's export UI. `handleExport` (line 84) renders then immediately delivers; `handlePreview` (line 106) renders then opens the overlay. Two stacked buttons: "Export video" (line 154–177) and "Preview final MP4 first" (line 178–184).
- `src/components/Mp4Preview.tsx` — `Mp4PreviewOverlay`, the fullscreen player. Already has "Discard" (line 196), "Save to library" (line 201), and "Save this video" (line 216, calls `deliverFileInGesture` then `saveRenderedToLibrary`). Also exports `renderForPreview` (line 25).
- `src/app/studio/page.tsx` — studio header gold button (lines 759–784) has visible label **"Export"** (line 781) but `aria-label="Preview the final MP4"` (line 763) and calls `openMp4Preview` (line 284) which opens the overlay. The overlay mounts at line 1009, outside the zoomed `<main>`.
- `src/lib/clip-export.ts` — `renderClipFile` names the file `.webm` when the encoder fell back to webm (line 179: `const ext = blob.type.includes("mp4") ? "mp4" : "webm";`). `deliverFileInGesture` (line 250) is the delivery ladder: native iOS bridge → Web Share sheet → download. `sendNativeExport` in `src/lib/mobile-bridge.ts:206-210` **throws** on any non-mp4 file.
- Render cache: `renderClipFile` caches by settings key (`clip-export.ts:165-172`), so preview-then-save re-uses the encode — the second render is instant. This is why routing everything through preview costs no extra render time.

ExportButton excerpt as it exists today (`src/components/ExportButton.tsx:84-109`):

```tsx
const handleExport = () =>
  run("download", async (file) => {
    const savedToLibrary = await saveRenderedToLibrary(file);
    ...
    if (nativeExportBridgeAvailable()
      || (isTouch && navigator.canShare?.({ files: [file] }))) {
      setPendingFile(file);
    } else {
      const location = await saveFile(file);
      if (location) setSavedLocation(location);
    }
  });

// Render the MP4 and open it in a real player BEFORE saving anything.
const handlePreview = () =>
  run("preview", (file, fallbackReason) => {
    setPreview({ file, url: URL.createObjectURL(file), fallbackReason });
  });
```

Studio header button excerpt (`src/app/studio/page.tsx:759-784`, abbreviated):

```tsx
<button onClick={openMp4Preview} disabled={mp4Rendering}
  className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--gold)] ..."
  aria-label="Preview the final MP4"
  title="Render and watch the exact MP4 that export produces">
  ...
  <span>{mp4Rendering ? "" : "Export"}</span>
</button>
```

Conventions: components are function components with Tailwind classes using the CSS-variable Midnight Mihrab palette (`var(--gold)`, `var(--ink)`, `btn-gold`). Telemetry events go through `trackProductEvent` (`src/lib/telemetry.ts`) — both flows already emit `export_started`/`export_succeeded`/`export_failed` with an `exportAction` field; keep those events firing with accurate `exportAction` values.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`       | exit 0              |
| Unit tests| `npm test`               | all pass            |
| Lint      | `npm run lint`           | exit 0              |
| Targeted e2e | `npx playwright test e2e/export-format-parity.spec.ts --project=chromium` | pass (requires `npm run build` first if the config serves a build; check `playwright.config.ts` `webServer` — it may start `next dev` automatically) |

## Scope

**In scope** (the only files you should modify):
- `src/components/ExportButton.tsx`
- `src/components/Mp4Preview.tsx`
- `src/app/studio/page.tsx` (ONLY the header button lines 759–784 — label/title text)
- Any e2e spec that asserts on the button text you change (search first: `grep -rn "Export video\|Preview final MP4\|Preview the final MP4" e2e/ src/`)

**Out of scope** (do NOT touch):
- `src/lib/clip-export.ts`, `src/lib/export.ts`, `src/lib/mobile-bridge.ts` — the render/delivery machinery is correct; this plan only re-routes UI flow.
- `src/components/bulk/**` — bulk delivery has its own flow (`deliverBulkFilesInGesture`); leave it.
- The overlay's Save-to-library / telemetry / first-export-feedback logic in `Mp4Preview.tsx` (lines 44–96, 163–193) — keep as is.

## Git workflow

- Branch: current working branch unless instructed otherwise (repo works on feature branches like `codex/...`).
- Commit style: plain imperative sentence, e.g. `Route every export through the fullscreen preview` (match `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make "Export video" open the preview overlay instead of delivering immediately

In `src/components/ExportButton.tsx`:

1. Change `handleExport` to do what `handlePreview` does — render and set `preview` — and delete the now-duplicate `handlePreview`. Keep telemetry: use `run("preview", ...)` semantics but keep a distinct `exportAction` so the funnel still distinguishes intent; simplest correct shape: one handler `const handleExport = () => run("preview", (file, fallbackReason) => setPreview({ file, url: URL.createObjectURL(file), fallbackReason }));`
2. Remove the secondary "Preview final MP4 first" button (lines 178–184). Keep the single gold button; relabel it from "Export video" to **"Preview & export"** (it renders, then the overlay offers Save).
3. The `pendingFile` / "Save to Photos" parking state (lines 33, 111–115, 124–150) becomes unreachable from this component's own flow — the overlay's "Save this video" button calls `deliverFileInGesture` from within the tap gesture, which is exactly what the parking state existed to arrange. Delete `pendingFile`, `saveToPhotos`, and the `if (pendingFile)` block. Also delete now-unused imports (`saveFile`, `deliverFileInGesture`, `nativeExportBridgeAvailable`) — verify with lint that nothing else in the file uses them.
4. Library saving: `handleExport` previously auto-saved to library; the overlay's "Save this video" also saves to library (Mp4Preview.tsx:77). Net behavior after this change: library save happens when the user confirms in the overlay, not on render. That is intended (discarded previews shouldn't clutter the library). Keep `libraryWarning`/`savedLocation` state only if still referenced; otherwise remove.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 2: Fix the studio header button label

In `src/app/studio/page.tsx` lines 759–784: the button opens the preview, so make the visible label say so. Change `<span>{mp4Rendering ? "" : "Export"}</span>` to `<span>{mp4Rendering ? "" : "Preview"}</span>` and keep `aria-label="Preview the final MP4"`. Do not change `openMp4Preview` logic.

**Verify**: `grep -n '"Export"' src/app/studio/page.tsx` → no match on the header button line (other matches unrelated are fine).

### Step 3: Guard the unplayable-webm case in the overlay

In `src/components/Mp4Preview.tsx` (`Mp4PreviewOverlay`): when `!clip.file.type.includes("mp4")` **and** the platform can't play webm (iOS WebKit — detect with `document.createElement("video").canPlayType("video/webm") === ""`), render a notice panel in place of the `<video>`: explain the clip was rendered in a fallback format this device can't play inline, and keep the action row. Additionally, "Save this video" must not crash: `sendNativeExport` throws on non-mp4 (`mobile-bridge.ts:206-210`), and `deliverFileInGesture` does NOT catch that throw — wrap the `save` handler's `deliverFileInGesture` call in try/catch and surface the error text in the overlay (a small `role="alert"` paragraph styled like the existing `fallbackReason` banner at lines 122–129) instead of an unhandled rejection.

**Verify**: `npx tsc --noEmit` → exit 0. Unit-testing this branch is optional; the canPlayType check must not run during SSR (component is `"use client"` and the check runs in an event/effect or render guarded by `typeof document !== "undefined"`).

### Step 4: Update any e2e assertions on the old button text

`grep -rn "Export video\|Preview final MP4" e2e/` and update matching locators/text to the new labels ("Preview & export", header "Preview"). Do not weaken assertions — same flows, new names. Note the e2e suites that render real MP4s (`export-format-parity`, `production-smoke`) drive export via UI text; run the deterministic suite to confirm.

**Verify**: `npm test` → pass; `npx playwright test e2e/export-format-parity.spec.ts --project=chromium` → pass. If the full CI browser suite is cheap to run: `npm run test:ci:e2e`.

## Test plan

- Update/extend the e2e spec that covers export (find via the Step 4 grep) to assert the new flow: click "Preview & export" → overlay with `aria-label="Final MP4 preview"` appears with a `<video>` → click "Save this video" → delivery occurs (existing specs already assert on download/share behavior; keep their assertions, inserting the overlay step).
- No new unit tests required; this is UI routing. The webm-guard branch may get a component test only if a pattern for component tests already exists (it does not today — vitest covers `src/lib` only; do NOT introduce a new test framework setup for this).

## Done criteria

- [ ] `npx tsc --noEmit` exits 0; `npm run lint` exits 0; `npm test` passes
- [ ] `grep -n "Preview final MP4 first" src/` → no matches (secondary button removed)
- [ ] In `ExportButton.tsx`, no code path calls `deliverFileInGesture`/`saveFile` outside the overlay (grep the file)
- [ ] Studio header button's visible text is no longer "Export"
- [ ] `npx playwright test e2e/export-format-parity.spec.ts --project=chromium` passes
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above don't match the live code (drift).
- Removing the `pendingFile` parking state breaks an e2e spec that specifically tests the share-sheet gesture path — that spec exists to protect the iOS save flow; report rather than deleting/weakening it.
- You find another component importing `ExportButton`'s removed exports (there are none today — it has a single named export).
- The overlay's "Save this video" on-touch path turns out to require the pre-render library save you removed (i.e. `saveRenderedToLibrary` inside the overlay is unreachable on some path).

## Maintenance notes

- The overlay is now the single point of delivery; any future export surface (bulk, library re-export) should reuse `Mp4PreviewOverlay` rather than adding a direct-deliver button.
- Reviewer should scrutinize: telemetry `exportAction` values still distinguish "user watched then saved" vs "user discarded" (funnel metrics feed `scripts/product-analytics-report.ts`).
- Deferred: a native AVPlayer fallback bridge message for the shell (only if QA shows WKWebView blob `<video>` playback failing on device — see plans/README.md "considered" notes).
