# Plan 009: Make the karaoke word-highlight match between preview and the exported MP4

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a "STOP condition"
> occurs, stop and report — do not improvise. When done, update the status row for
> this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d06dd5a..HEAD -- src/lib/export.ts src/lib/imported-player.ts src/components/StudioPreview.tsx`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, STOP.

## Status
- **Priority**: P1 (launch — Quran-text styling + the preview==export invariant)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (correctness / render parity)
- **Planned at**: commit `d06dd5a`, 2026-07-21

## Why this matters
The word-by-word karaoke highlight (`wordHighlight`) was added to the exporter (commits 88466c0, 463c645) and is correctly part of the run-length frame signature, so it no longer freezes. But three real gaps remain, all of which break the project's hard invariant that **the exported MP4 must show exactly what the preview showed**:

1. **BUG-09 (the important one)**: in the default fast/WebCodecs export the highlight silently vanishes on the **last verse of a clip — which for the very common single-verse karaoke clip is the whole clip**. The frame-plan passes a verse duration of `0` for the last verse, and `activeHighlightWord` returns `null` for a non-positive duration, so no word ever lights. The preview and the realtime fallback both show it.
2. **BUG-10**: the fast path lights words in **reciter mode**, where neither the preview nor the realtime export do (a guard is missing `options.importedAudio`). Unexpected highlight appears in the MP4.
3. **BUG-11**: the **preview** applies a full-verse word index onto a **split-verse partial segment**, lighting the wrong word (or one that isn't on screen), while export suppresses the highlight for partials.

## Current state
- `src/lib/export.ts`
  - `activeHighlightWord(text, localSeconds, verseSeconds)` (`:140-149`) returns `null` when `!(verseSeconds > 0)`.
  - Per-verse durations exist: `const { buffer: audioBuffer, verseDurations } = await assembleAudio(options);` (`:745`).
  - `cum[]` is built with **one entry per verse** (`:754-761`): `for (const d of verseDurations) { cum.push(acc); acc += d; }` → `cum.length === verseDurations.length`, so `cum[vi+1]` is `undefined` for the last verse.
  - Fast-path per-frame active word (`:908-910`):
    ```ts
    const activeWord = options.wordHighlight && audioVi === vi && segFast.ar === verse.text_uthmani
      ? activeHighlightWord(verse.text_uthmani, localT, (cum[vi + 1] ?? cum[vi]) - cum[vi])
      : null;
    ```
    Here `(cum[vi + 1] ?? cum[vi]) - cum[vi]` is `0` for the last verse → `activeHighlightWord` returns `null`.
  - Realtime path (the reference behavior) at `:585-588` guards with `options.wordHighlight && options.importedAudio && seg.ar === verse.text_uthmani` and uses the true slice duration `highlightVerseDur` (`:541`). Note it **includes** `options.importedAudio`; the fast path (`:908`) does **not**.
- `src/lib/imported-player.ts:127-139` computes `activeWordIndex` from the **full** verse word count whenever `wordHighlight` is on, without checking that the on-screen text is the full verse; the same frame can push a partial split segment via `setPlaybackSegment` (`:150-164`).
- `src/components/StudioPreview.tsx:507-509,544` applies `arabicEmphasis: [wordHi]` (the full-verse index) on top of `displayArabic`, which for a split verse is only a partial line (`:458`).
- Existing test: `src/lib/__tests__/export-word-highlight.test.ts` covers the pure `activeHighlightWord` formula (start/advance/end/clamp/empty). It does **not** exercise the fast-path `cum` math (that lives inside `exportVideoFast`, which is not unit-tested — see TEST-01).

## Commands you will need
| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Unit tests | `npm test` | all pass |
| Targeted | `npm test -- export-word-highlight` | pass |
| Lint | `npm run lint` | exit 0 |
| Quran-integrity gate | `npm run test:recognition && npm run test:detection && npm run test:alignment` | all pass (proves no text-integrity regression) |

## Scope
**In scope**:
- `src/lib/export.ts` (BUG-09, BUG-10)
- `src/components/StudioPreview.tsx` **or** `src/lib/imported-player.ts` (BUG-11 — one of them, see Step 3)
- `src/lib/__tests__/export-word-highlight.test.ts` (new regression assertions)

**Out of scope** (do NOT touch):
- `drawScene`/`render-core.ts` and any canvas composition — the fix is which index is passed, not how it's drawn. Do not add a second render path.
- `activeHighlightWord` itself — its formula is correct and tested.
- The run-length dedupe key (`export.ts:922`) — `w${activeWord}` already handles distinct lit words; leave it.

## Steps

### Step 1 — BUG-09: use the real per-verse duration in the fast path
In `src/lib/export.ts:909`, replace `(cum[vi + 1] ?? cum[vi]) - cum[vi]` with `verseDurations[vi]`:
```ts
const activeWord = options.wordHighlight && options.importedAudio && audioVi === vi && segFast.ar === verse.text_uthmani
  ? activeHighlightWord(verse.text_uthmani, localT, verseDurations[vi])
  : null;
```
`verseDurations[vi]` is already in scope (`:745`) and equals `cum[vi+1]-cum[vi]` for every non-last verse, so this changes behavior **only** for the previously-broken last/single verse. (This line also picks up Step 2.)

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2 — BUG-10: add the `importedAudio` guard (folded into Step 1)
Confirm the guard now reads `options.wordHighlight && options.importedAudio && audioVi === vi && segFast.ar === verse.text_uthmani`, matching the realtime path at `:586`. This stops the fast path lighting words in reciter mode.

**Verify**: `grep -n "options.importedAudio" src/lib/export.ts` → matches at both the realtime (~`:586`) and fast (~`:908`) guards.

### Step 3 — BUG-11: suppress the preview highlight on partial (split) segments
Make the preview match export, which only highlights when the full verse is shown. Prefer the localized guard in `src/components/StudioPreview.tsx`: where `wordHi` / `arabicEmphasis: [wordHi]` is applied (`:507-509,544`), only apply it when the displayed Arabic is the full verse (e.g. `displayArabic === currentVerse.text_uthmani`); otherwise fall back to the stored manual emphasis. Do not change what text is displayed — only whether the traveling highlight index is applied.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 4 — Regression test
In `src/lib/__tests__/export-word-highlight.test.ts`, add assertions that lock BUG-09's root cause at the unit level: `activeHighlightWord(text, localT, verseDurations[last])` returns a real index for a representative single-verse duration, and returns `null` only for a genuinely zero/negative duration. If you can cheaply expose the fast-path duration lookup (a tiny exported helper `verseDurationForRow(verseDurations, vi)` returning `verseDurations[vi]`), test that it never yields `0` for an in-range `vi`. Do NOT try to stand up the full `VideoEncoder` pipeline here (that's the release-only exact-MP4 e2e's job).

**Verify**: `npm test -- export-word-highlight` → pass, including the new cases.

## Test plan
- New unit cases in `export-word-highlight.test.ts` (pattern: the existing cases in that file): last/single-verse duration → non-null index; reciter-mode path is not exercised by `activeHighlightWord` but is covered by the guard grep in Step 2.
- Manual/e2e (record in the PR, not required to gate): export a **single-verse** imported clip with `wordHighlight` on → the MP4 shows the traveling highlight (previously absent). Export a reciter clip with `wordHighlight` toggled on → no highlight in the MP4 (matches preview).
- `npm run test:recognition && npm run test:detection && npm run test:alignment` → all pass (proves Arabic text integrity untouched).

## Done criteria
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` all exit 0
- [ ] `grep -n "verseDurations\[vi\]" src/lib/export.ts` → present in the fast-path activeWord line
- [ ] `grep -n "(cum\[vi + 1\] ?? cum\[vi\]) - cum\[vi\]" src/lib/export.ts` → **no match** (old math gone)
- [ ] Fast + realtime activeWord guards both include `options.importedAudio`
- [ ] New regression assertions in `export-word-highlight.test.ts` pass
- [ ] Recognition/detection/alignment benchmarks pass
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions
- The excerpts at the cited lines don't match live code (drift).
- `verseDurations` turns out NOT to be one-entry-per-row/verse aligned with `cum` (re-derive the correct per-row duration before changing the call; do not guess).
- Suppressing the preview highlight on partials (Step 3) also removes it on the full verse in a normal single-verse clip — that means the full-verse condition is wrong; report instead of loosening it.

## Maintenance notes
- If `assembleAudio`/`cum` are ever changed to be row-indexed differently (e.g. duplicated verses), re-check that `verseDurations[vi]` still maps to the frame's display row `vi`.
- The real gap behind BUG-09 is that `exportVideoFast` has no unit coverage (TEST-01). When a headless-canvas or encoder harness lands, add a fast-path frame-plan test that asserts a single-verse clip produces at least one non-null `activeWord`.
- Reviewer should confirm no third code path computes the highlight — preview (`imported-player`/`StudioPreview`), realtime export (`export.ts:585`), and fast export (`export.ts:908`) must share the same guard shape.
