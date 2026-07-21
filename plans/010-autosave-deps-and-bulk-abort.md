# Plan 010: Stop silently losing edits (autosave deps) and stop bulk from running after you leave

> **Executor instructions**: Follow step by step; run every verification command and
> confirm the expected result before moving on. On a "STOP condition", stop and
> report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d06dd5a..HEAD -- src/app/studio/page.tsx src/components/bulk/BulkCreateWorkspace.tsx`
> Compare the "Current state" excerpts against live code before proceeding; on a
> mismatch, STOP.

## Status
- **Priority**: P1 (launch — silent data loss + wasted mobile battery/compute)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (correctness)
- **Planned at**: commit `d06dd5a`, 2026-07-21

## Why this matters
Two independent correctness bugs, both cheap to fix:

- **BUG-01 (silent data loss)**: the studio's 2-second debounced autosave only reschedules its timer when a field **in its dependency array** changes. Several persisted fields are missing from that array, so if a creator changes *only* one of them — the Arabic line-highlight bar, the verse-intro animation, an Arabic/translation font weight, or a reciter-mode word-part split — and then **hard-refreshes or closes the tab**, the edit is never saved. Every *other* control autosaves, so the loss is silent and inconsistent. (SPA navigation is masked by an unmount flush and the manual Save button, which is why it hides in normal testing.)
- **BUG-02 (work after teardown)**: leaving `/bulk` while recognition or a link import is running never signals the `AbortController`, so ONNX inference keeps looping, IndexedDB checkpoint writes keep firing, and `setState` runs on a torn-down component.

## Current state
### BUG-01 — `src/app/studio/page.tsx`
- The **only** debounced autosave effect is at `:545-575`. The just-changed value is read live inside `saveNow` via `useAppStore.getState()` (`:354`), so data isn't stale — the effect simply never *reschedules* the 2s timer when a missing field changes alone.
- The dep array (`:563-575`) currently lists reciter/format/font-size/colors/layout/background/emphasis/etc. It **omits** these fields that `saveNow` persists:
  - `store.verseParts` (persisted at `:445`)
  - `store.arabicFontWeight` (`:451`)
  - `store.translationFontWeight` (`:461`)
  - `store.verseIntro` (`:484`), `store.verseIntroMs` (`:485`)
  - `store.highlightEnabled`, `store.highlightColor`, `store.highlightOpacity`, `store.highlightRadius`, `store.highlightPadding`, `store.highlightHeight` (`:494-499`)
- Unmount flush that masks it on SPA nav: `:579-581`. Manual Save: `:526-543`.

### BUG-02 — `src/components/bulk/BulkCreateWorkspace.tsx`
- `abortRef` (`:142`) is aborted only by `startNewBatch` (`:801`) and the on-screen Cancel button (`:1047`); `linkAbortRef` (`:162`) only by its Cancel button (`:928`).
- The effects that return cleanups (`:232`, `:244`, `:334`) do **not** abort either controller. There is no unmount effect of the form `useEffect(() => () => abortRef.current?.abort(), [])`.
- The in-flight work these gate: `recognizeQuranInWindows` (ONNX loop), `onWindowComplete` → `replaceJob` IndexedDB writes (`:468-475`), `onProgress: setProgress` (`:464`).

## Commands you will need
| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Unit tests | `npm test` | all pass |
| Targeted | `npm test -- restore-project-isolation settings` | pass |
| Lint | `npm run lint` | exit 0 |

## Scope
**In scope**:
- `src/app/studio/page.tsx` (BUG-01: the dep array at `:563-575` only)
- `src/components/bulk/BulkCreateWorkspace.tsx` (BUG-02: add one unmount effect)
- A test asserting the autosave-deps ⊇ persisted-fields invariant (see Test plan)

**Out of scope**:
- `saveNow` itself and what it persists — it is correct; only the *trigger* deps are wrong. Do not change save semantics.
- The clip-state-isolation logic (`beginNewProject`/surahId guard/`restoreProject`) — verified correct; don't touch.
- Any recognition/ASR logic — only add the abort call on unmount.

## Steps

### Step 1 — BUG-01: add the missing fields to the autosave dep array
Append to the dependency array at `src/app/studio/page.tsx:563-575`:
```
store.verseParts,
store.arabicFontWeight, store.translationFontWeight,
store.verseIntro, store.verseIntroMs,
store.highlightEnabled, store.highlightColor, store.highlightOpacity,
store.highlightRadius, store.highlightPadding, store.highlightHeight,
```
This only increases how often the already-idempotent `saveNow` is scheduled; it cannot corrupt anything.

**Verify**: `npx tsc --noEmit` → exit 0. `npm run lint` → exit 0 (the `react-hooks/exhaustive-deps` rule should now be satisfied for these fields).

### Step 2 — BUG-02: abort in-flight work on unmount
In `src/components/bulk/BulkCreateWorkspace.tsx`, add near the other effects:
```ts
useEffect(() => () => {
  abortRef.current?.abort();
  linkAbortRef.current?.abort();
}, []);
```
This mirrors how the on-screen Cancel buttons already abort; on unmount the ONNX loop and link import stop, and no post-teardown checkpoint writes / `setState` occur.

**Verify**: `npx tsc --noEmit` → exit 0; `npm test` → all pass (no hanging handles).

## Test plan
- **BUG-01 regression guard** (highest value): add a test that fails if a persisted field is missing from the autosave deps. Practical approach following the repo's existing `settings-roundtrip`/`restore-project-isolation` style: export (or derive) the list of keys `saveNow` writes and assert the autosave effect's dependency set is a superset. If the deps array isn't programmatically inspectable, instead add a `src/lib/__tests__` test that round-trips a project with only a `highlight*`/`verseIntro`/`verseParts`/font-weight change through `saveNow`→`restoreProject` and asserts the value survives (this at least locks the persist/restore half; note in a comment that the debounce-trigger half is guarded by lint's exhaustive-deps).
- **BUG-02**: no unit harness for React unmount here; verify by code review that the unmount effect calls both `.abort()`. (Optional: a Playwright step navigating away mid-analysis and asserting no console errors.)
- `npm test` → all pass including the new guard.

## Done criteria
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` all exit 0
- [ ] `grep -n "store.highlightEnabled" src/app/studio/page.tsx` → appears in the autosave dep array (`:563-575` region), not just where highlight settings are read
- [ ] `grep -n "linkAbortRef.current?.abort" src/components/bulk/BulkCreateWorkspace.tsx` → present inside an unmount effect (`[]` deps)
- [ ] New autosave-deps/persist guard test passes
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions
- The dep array or `saveNow` persisted-field lines don't match the excerpts (drift) — re-derive the exact missing set from the current `saveNow` before editing.
- Adding the deps causes an autosave loop (save state flicker) — that would mean one of the added values changes identity every render (it shouldn't; they're primitives/stable store refs). Report rather than removing the field.
- `abortRef`/`linkAbortRef` are not `useRef` holders of `AbortController` at the cited lines — reconcile with reality before adding the effect.

## Maintenance notes
- Any new persisted setting must be added to BOTH `saveNow` and this dep array. The guard test (Step, Test plan) is what stops this class of bug recurring — keep it green.
- If bulk recognition ever moves to a Web Worker or server (plan 007), the unmount abort must also post a cancel to that worker/endpoint, not only abort the local controller.
