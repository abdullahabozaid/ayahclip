# Plan 006: Stop 60 fps React re-renders in the studio preview (mobile jank quick wins)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5e086f1..HEAD -- src/components/StudioPreview.tsx src/lib/imported-player.ts src/lib/clip-export.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (top mobile-feel win after the two P1 UX plans)
- **Effort**: M
- **Risk**: MED (the preview is the product's core surface; regressions are highly visible)
- **Depends on**: none, but land AFTER plans 001/002 to avoid rebase churn in the same files
- **Category**: perf
- **Planned at**: commit `5e086f1`, 2026-07-20

## Why this matters

The studio is mobile-first, and its hot path re-renders far more React than it needs to. Three compounding causes, all in the preview pipeline: (1) `StudioPreview` (a ~990-line component that subscribes to the ENTIRE Zustand store via bare `useAppStore()`) bumps a `previewTick` state on every `importedPlayer` emit — and the player emits from a `requestAnimationFrame` loop, so during playback/scrubbing the whole component re-renders ~60×/sec; (2) each of those renders rebuilds the full clip-row model via an unmemoized `buildClipRows` call in the render body; (3) the canvas itself doesn't need any of it — the draw loop already reads state via `useAppStore.getState()` and refs. Cutting the per-frame React work makes phone playback/scrubbing materially smoother without touching what's drawn. (The larger fix — selector-izing all 8 full-store subscribers and splitting god components — is deliberately out of scope; see plans/README.md backlog.)

## Current state

- `src/components/StudioPreview.tsx`:
  - Line 58: `const store = useAppStore();` — full-store subscription (every store write re-renders).
  - Line 69: `const rows = buildClipRows(store.verses, store.selectedVerseNumbers, importedTimings ?? undefined);` — computed in the render body, no `useMemo` (the file has zero `useMemo`).
  - Lines 229–237 (verbatim):
    ```tsx
    const [, setPreviewTick] = useState(0);
    useEffect(() => {
      return importedPlayer.subscribe((_t, isP) => {
        if (useAppStore.getState().audioSource.mode === "imported") {
          setIsPlaying(isP);
          setPreviewTick((n) => (n + 1) & 0xffff);
        }
      });
    }, []);
    ```
    Comment above it explains intent: keep the canvas in sync with the playhead **even when paused/editing**.
  - Lines 405–422: the draw function reads everything fresh via `useAppStore.getState()` and calls `buildClipRows` again itself — the draw path does NOT depend on the component re-rendering.
  - There is a `drawRef` holding the draw closure (the draw function assigns/uses refs; find with `grep -n "drawRef" src/components/StudioPreview.tsx`).
- `src/lib/imported-player.ts` — `frame()` rAF loop calls `emit()` every frame while playing (lines 172–173); listeners receive `(time, isPlaying)`. Subscribing is cheap; the cost is what listeners do.
- `src/lib/clip-export.ts` — included in drift check only because plans 001 lands nearby; not modified here.
- Store convention: writes are Zustand setters in `src/lib/store.ts`; several components already use `useAppStore.getState()` for imperative reads — that is the sanctioned pattern for non-reactive access.
- CRITICAL project rule (memory): all frame composition goes through `drawScene` (`src/lib/render-core.ts`); preview must equal export. This plan must not alter what is drawn or when the canvas repaints — only how much React work surrounds it.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`       | exit 0              |
| Unit tests| `npm test`               | all pass            |
| Lint      | `npm run lint`           | exit 0              |
| Deterministic e2e | `npm run test:ci:e2e` | all pass       |
| Perf budget (optional, live site) | `npm run test:production-performance` | within budgets |

## Scope

**In scope**:
- `src/components/StudioPreview.tsx`

**Out of scope**:
- `src/lib/imported-player.ts` — its emit cadence is correct (the canvas needs per-frame sync); do not throttle it.
- `src/lib/store.ts` — moving `activeWordIndex`/`playbackSegment*` out of the global store (audit finding ARCH-01) is a bigger refactor; deferred.
- Every other component's full-store subscription (PERF-01 backlog item) — one file at a time; this file is the hottest.
- `src/lib/render-core.ts` / anything that changes drawn output.

## Git workflow

- Branch: current working branch unless instructed otherwise.
- Commit style: plain imperative sentence, e.g. `Cut per-frame React re-renders in the studio preview`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Drive the canvas from the player subscription without React state

In the lines 229–237 effect: instead of `setPreviewTick` (state → full re-render), call the draw closure directly:

```tsx
useEffect(() => {
  return importedPlayer.subscribe((_t, isP) => {
    if (useAppStore.getState().audioSource.mode === "imported") {
      setIsPlaying((prev) => (prev === isP ? prev : isP));
      drawRef.current?.();
    }
  });
}, []);
```

Requirements: `drawRef` must be assigned before the first emit can fire (it is assigned in render/effect today — confirm ordering; if `drawRef` may be unset on first tick, optional-chain as shown). `setIsPlaying` keeps its role but with an identity-guard so it only re-renders on actual play/pause transitions, not every frame. Delete the `previewTick` state entirely.

Check for other consumers first: `grep -n "previewTick" src/components/StudioPreview.tsx` — if anything reads the tick value (the state var is destructured as `[, setPreviewTick]`, so nothing reads it), reassess.

**Verify**: `npx tsc --noEmit` → exit 0; `grep -n "previewTick" src/components/StudioPreview.tsx` → no matches.

### Step 2: Memoize the render-body row model

Replace line 69's bare call with:

```tsx
const rows = useMemo(
  () => buildClipRows(store.verses, store.selectedVerseNumbers, importedTimings ?? undefined),
  [store.verses, store.selectedVerseNumbers, importedTimings]
);
```

Leave the in-draw `buildClipRows` call (lines 415–419) EXACTLY as is — the draw closure runs outside React and must read fresh state (a stale memo captured in the closure would break duplicated-verse rendering; the comment at 413–414 explains why rows and segment must come from one source).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Manual + automated verification of preview behavior

The three behaviors the deleted tick protected (per the comment at 225–228):
1. Playing imported audio → canvas follows the playhead (Step 1 now calls `drawRef` directly — same repaint, no re-render).
2. **Paused scrubbing** in the timeline → canvas updates as the playhead moves (the player emits on seek while paused; confirm `importedPlayer` emits on seek — `grep -n "emit" src/lib/imported-player.ts` and check its seek path; if seek does NOT emit while paused, STOP: the tick was doing more than assumed).
3. Editing text/styles while paused → canvas repaints. This is driven by the redraw-on-settings effect (deps list around lines 672–745), NOT the tick — unaffected.

Run the app (`npm run dev`), import audio (or open a saved imported project), and check 1–3 at a phone viewport. Then `npm run test:ci:e2e` — the deterministic suite covers playback/seek budgets and caption editing.

**Verify**: all three behaviors intact; e2e suite green.

### Step 4 (bounded bonus): revoke replaced object URLs in this file only

`grep -n "createObjectURL" src/components/StudioPreview.tsx` — if this component mints object URLs and replaces them (background video swaps), add `URL.revokeObjectURL(previous)` after the consumer detaches. If StudioPreview turns out not to create any (the audit located leaks in `src/app/page.tsx` and `clip-export.ts`, both out of scope here), skip this step and note "no URLs minted here" in the commit message. Do not chase the leak into out-of-scope files.

**Verify**: `npm run lint` → exit 0.

## Test plan

- No new unit tests: the changed code is a React wiring detail in a component with no existing component-test harness (vitest covers `src/lib` only — do not introduce a new harness for this).
- Regression safety comes from the deterministic e2e suite (`npm run test:ci:e2e`): it exercises play/pause, seeking, caption splitting and preview correctness.
- Optional live check after deploy: `npm run test:production-performance` (playback-response and timeline-seek budgets, 3 repeats).

## Done criteria

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` all exit 0
- [ ] `grep -n "previewTick" src/components/StudioPreview.tsx` → no matches
- [ ] `rows` in the render body is memoized; the in-draw `buildClipRows` call is untouched (`git diff` shows no change at the 405–422 region beyond context)
- [ ] Manual check: play, paused-scrub, and paused-edit all repaint the canvas correctly
- [ ] `npm run test:ci:e2e` passes
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts don't match the live code (drift).
- `importedPlayer` does NOT emit during paused seeks (Step 3 check) — the tick had a second job; report before redesigning.
- After Step 1, any visible behavior differs (word-highlight timing, split-caption swaps, verse counter) — the counter ("n / N") and play icon are the component's only per-frame reactive outputs; if the counter stops updating during playback, it depended on the tick: derive it inside the player subscription via a dedicated `useState` updated only when the ROW INDEX changes (cheap, transition-frequency), and note it.
- `npm run test:ci:e2e` fails in any preview/timeline spec twice after a reasonable fix attempt.

## Maintenance notes

- This is the first slice of the bigger perf backlog (README: PERF-01 selector conversion across 8 components, ARCH-01 moving per-frame playback fields out of the global store, ARCH-02 god-component splits). Each is independently landable; do them file-by-file with e2e green between steps.
- Reviewer scrutiny: confirm no `useMemo` dependency was omitted (`store.verses` identity changes on translation reload — that MUST recompute rows).
- Anyone adding new per-frame state must route it through `importedPlayer` subscriptions or refs, never `useState` bumped inside the rAF loop.
