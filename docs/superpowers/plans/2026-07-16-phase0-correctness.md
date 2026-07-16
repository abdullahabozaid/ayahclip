# Phase 0 — Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the studio preview tell the truth about what export will produce, and stop the four ways the app silently loses user data.

**Architecture:** The two preview/export parity breaks share one root cause — preview and export each derive their own list of "what to render" from different arrays. We introduce a single `buildClipRows()` function producing the authoritative ordered row list, and route *both* preview and export through it. A clip row is `{ timing, verse }`: the timing is the clip row, the verse is a text lookup. This replaces the broken `verses.filter(...)` + `timings.find(...)` model that cannot represent a duplicated verse. The remaining tasks are independent data-loss fixes.

**Tech Stack:** Next.js 16.2.6, React 19.2, TypeScript 5, Zustand 5, Vitest 4, Tailwind v4.

## Global Constraints

- **Cardinal rule:** preview and export must produce identical text and audio spans for the same state. All frame composition goes through `drawScene` (`src/lib/render-core.ts`) — never add a second render path.
- **Quran text integrity is a fatal bug class.** Any change touching text slicing must keep `src/lib/__tests__/text-integrity.test.ts` green. Never let waqf marks detach from their word.
- **Never break the two-array invariant** knowingly: `audioSource.timings` drives the editor; `selectedVerseNumbers` drives preview/export. This plan makes `timings` authoritative for imported mode.
- Run `npx vitest run`, `npx tsc --noEmit`, and `npx eslint` before every commit. All three are currently clean — keep them clean.
- Existing test count baseline: **82 passing**. It must only go up.
- Do NOT reformat or restructure code beyond what a task requires.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/clip-rows.ts` | **Create.** `ClipRow`, `buildClipRows()`, `verseWordCount()`. The single source of truth for "what rows does this clip have". Pure, no DOM. |
| `src/lib/__tests__/clip-rows.test.ts` | **Create.** Row construction incl. duplicates. |
| `src/lib/__tests__/parity.test.ts` | **Create.** The regression guard: preview-path and export-path text/audio spans must match. |
| `src/lib/export.ts` | **Modify.** `segmentFor` (~L133), realtime loop (~L440), `assembleAudio` (~L562). Route through rows + `effectiveAudioBounds`. |
| `src/components/StudioPreview.tsx` | **Modify.** (~L368-392) Consume rows instead of index-aligned arrays. |
| `src/lib/clip-export.ts` | **Modify.** Build rows (~L88); surface `saveClip` result (~L201). |
| `src/types/index.ts` | **Modify.** Add 3 missing keys to `Project["settings"]`. |
| `src/app/studio/page.tsx` | **Modify.** Add the 3 keys to the `saveNow` literal. |
| `src/lib/__tests__/settings-roundtrip.test.ts` | **Create.** Fails if the settings declarations drift again. |
| `src/app/library/page.tsx` | **Modify.** Reconcile `selected` against `filtered`. |
| `src/lib/library-server.ts` | **Modify.** Atomic writes. |
| `src/app/api/library/route.ts` | **Modify.** Reject duplicate ids. |
| `src/components/ExportButton.tsx` | **Modify.** Report save failure. |

---

## Task 0: Commit the working tree

**Files:** none created; commits 44 existing modified files.

**Interfaces:**
- Consumes: nothing.
- Produces: a clean working tree so every later task's diff is reviewable.

The repo has 44 modified files / 1,543 insertions uncommitted, including all the library security hardening (`safeId`, `canonicalVideoType`, `originAllowed`). None of it is in git. Every task below assumes a clean baseline.

- [ ] **Step 1: Confirm the tree is green before committing**

Run:
```bash
npx vitest run && npx tsc --noEmit && npx eslint
```
Expected: `Tests 82 passed (82)`, no tsc output, no eslint output.

- [ ] **Step 2: Review what is about to be committed**

Run:
```bash
git status --short && git diff --stat | tail -3
```
Expected: ~44 modified files, 4 untracked (`src/app/opengraph-image.tsx`, `src/components/NewClipLink.tsx`, `src/lib/background-sequence.ts`, `src/lib/background-sequence.test.ts`).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: commit in-flight library hardening and studio work

Working-tree snapshot before the Phase 0 correctness work: library
security guards (safeId, canonicalVideoType, origin/local gates),
background sequences, studio zoom, and the browse redesign.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify clean**

Run: `git status --short`
Expected: empty output.

---

## Task 1: `clip-rows.ts` — the authoritative row model

**Files:**
- Create: `src/lib/clip-rows.ts`
- Test: `src/lib/__tests__/clip-rows.test.ts`

**Interfaces:**
- Consumes: `VerseTiming` from `src/lib/audio-import.ts`; `Verse` from `src/types`.
- Produces:
  - `interface ClipRow { verse: Verse; timing?: VerseTiming; }`
  - `buildClipRows(verses: Verse[], selectedVerseNumbers: number[], timings?: VerseTiming[]): ClipRow[]`
  - `verseWordCount(text: string): number`

**Why:** `export.ts:446` does `timings.find(t => t.verseNumber === verse.verse_number)` — it can never find the *second* copy of a duplicated verse, so duplicates are silently dropped from export. `StudioPreview.tsx:369/385` indexes `verses[i]` against `timings[i]`, which diverge after any duplicate. Iterating **timings** (one row per timing) fixes both. In reciter mode there are no timings, so rows come from the selected verses.

Note: `verseWordCount` exists because there are currently **two different word counts** for the same verse — `verseTextAt` (`audio-import.ts:100`) splits the raw text, while `store.ts:421` calls `sanitizeArabic()` first. `effectiveAudioBounds` must use the same count `wordRange` was recorded against, which is the raw split (`TimelineEditor` sets `wordRange` from `verseTextAt`'s word list). This helper pins it to one definition.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/clip-rows.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildClipRows, verseWordCount } from "../clip-rows";
import type { Verse } from "@/types";
import type { VerseTiming } from "../audio-import";

const verse = (n: number, text = "one two three"): Verse => ({
  id: n,
  verse_number: n,
  verse_key: `1:${n}`,
  text_uthmani: text,
});

const tm = (verseNumber: number, start: number, end: number): VerseTiming => ({
  verseNumber,
  start,
  end,
});

describe("buildClipRows", () => {
  it("reciter mode: one row per selected verse, no timings", () => {
    const rows = buildClipRows([verse(1), verse(2), verse(3)], [1, 3], undefined);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.verse.verse_number)).toEqual([1, 3]);
    expect(rows[0].timing).toBeUndefined();
  });

  it("imported mode: one row per timing, in timing order", () => {
    const rows = buildClipRows([verse(1), verse(2)], [1, 2], [tm(1, 0, 5), tm(2, 5, 9)]);
    expect(rows).toHaveLength(2);
    expect(rows[0].timing?.start).toBe(0);
    expect(rows[1].verse.verse_number).toBe(2);
  });

  it("imported mode: a duplicated verse produces TWO rows (the export bug)", () => {
    const rows = buildClipRows([verse(1), verse(2)], [1, 2], [
      tm(1, 0, 5),
      tm(1, 5, 8), // duplicate of verse 1
      tm(2, 8, 12),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.verse.verse_number)).toEqual([1, 1, 2]);
    expect(rows[0].timing?.start).toBe(0);
    expect(rows[1].timing?.start).toBe(5);
  });

  it("imported mode: drops timings whose verse text is missing", () => {
    const rows = buildClipRows([verse(1)], [1, 9], [tm(1, 0, 5), tm(9, 5, 9)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].verse.verse_number).toBe(1);
  });

  it("imported mode: ignores selectedVerseNumbers (timings are authoritative)", () => {
    const rows = buildClipRows([verse(1), verse(2)], [1], [tm(1, 0, 5), tm(2, 5, 9)]);
    expect(rows).toHaveLength(2);
  });

  it("imported mode with empty timings falls back to selection", () => {
    const rows = buildClipRows([verse(1), verse(2)], [2], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].verse.verse_number).toBe(2);
  });
});

describe("verseWordCount", () => {
  it("counts whitespace-separated words", () => {
    expect(verseWordCount("one two three")).toBe(3);
  });

  it("ignores repeated and trailing whitespace", () => {
    expect(verseWordCount("  one   two  ")).toBe(2);
  });

  it("returns 0 for empty text", () => {
    expect(verseWordCount("")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/clip-rows.test.ts`
Expected: FAIL — `Failed to resolve import "../clip-rows"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/clip-rows.ts`:

```ts
import type { Verse } from "@/types";
import type { VerseTiming } from "./audio-import";

/**
 * One row of the clip — the unit that preview and export both iterate.
 *
 * The timing IS the row; the verse is a text lookup. This matters because a
 * verse can legitimately appear TWICE (duplicateVerse splits a long ayah into
 * two rows), so a verse number is not a key. The old model — filter verses by
 * selection, then `timings.find(byVerseNumber)` — could not represent that, and
 * silently dropped the second copy from export.
 */
export interface ClipRow {
  verse: Verse;
  /** Absent in reciter mode, where per-verse audio comes from the CDN. */
  timing?: VerseTiming;
}

/**
 * Word count for a verse's text, using the same split as `verseTextAt` in
 * audio-import.ts. `wordRange` indices are recorded against THIS count, so
 * anything resolving a wordRange must use this and not a sanitized count.
 */
export function verseWordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * The authoritative ordered rows for the current clip.
 *
 * Imported mode: one row per timing, in timing order — `timings` is
 * authoritative and `selectedVerseNumbers` is ignored, because a duplicated
 * verse contributes two timings but only one verse number. Timings whose verse
 * text isn't loaded are dropped rather than rendered blank.
 *
 * Reciter mode (or no timings yet): one row per selected verse.
 */
export function buildClipRows(
  verses: Verse[],
  selectedVerseNumbers: number[],
  timings?: VerseTiming[]
): ClipRow[] {
  if (timings && timings.length > 0) {
    const byNumber = new Map(verses.map((v) => [v.verse_number, v]));
    const rows: ClipRow[] = [];
    for (const timing of timings) {
      const verse = byNumber.get(timing.verseNumber);
      if (verse) rows.push({ verse, timing });
    }
    return rows;
  }
  return verses
    .filter((v) => selectedVerseNumbers.includes(v.verse_number))
    .map((verse) => ({ verse }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/clip-rows.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Verify nothing else broke**

Run: `npx vitest run && npx tsc --noEmit`
Expected: `Tests 91 passed (91)`, no tsc output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/clip-rows.ts src/lib/__tests__/clip-rows.test.ts
git commit -m "$(cat <<'EOF'
feat(clip): add buildClipRows — one row per timing

A verse can appear twice (duplicateVerse splits a long ayah), so a verse
number is not a key. Iterating timings instead of verses is what lets a
duplicated verse survive to preview and export.

Not yet wired up.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `segmentFor` must honour `wordRange` (parity fix, text)

**Files:**
- Modify: `src/lib/export.ts:133-152`
- Test: `src/lib/__tests__/parity.test.ts` (create)

**Interfaces:**
- Consumes: `verseTextAt`, `VerseTiming` (`src/lib/audio-import.ts`).
- Produces: no signature change. `segmentFor(verse, tm, sourceTime)` keeps its shape.

**The bug:** `export.ts:138` short-circuits `if (!tm?.splits?.length) return { ar: verse.text_uthmani, ... }`. A verse with a `wordRange` but **no splits** therefore exports the *full* verse text, while `StudioPreview.tsx:387` calls `verseTextAt(...)` which honours `wordRange` (`audio-import.ts:101`). Trim a verse to 4 words → preview shows 4, export shows 40.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/parity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { verseTextAt, effectiveAudioBounds, type VerseTiming } from "../audio-import";
import { verseWordCount } from "../clip-rows";
import { __test__segmentFor as segmentFor } from "../export";
import type { Verse } from "@/types";

const TEXT = "w1 w2 w3 w4 w5 w6 w7 w8 w9 w10";

const verse: Verse = {
  id: 1,
  verse_number: 1,
  verse_key: "2:1",
  text_uthmani: TEXT,
  translation: "t1 t2 t3 t4 t5 t6 t7 t8 t9 t10",
};

describe("preview/export text parity", () => {
  it("a wordRange with NO splits must trim the exported text", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 0, end: 10, wordRange: { from: 0, to: 3 } };

    const preview = verseTextAt(tm, TEXT, 0);
    const exported = segmentFor(verse, tm, 0).ar;

    expect(preview).toBe("w1 w2 w3 w4");
    expect(exported).toBe(preview);
  });

  it("a wordRange with NO splits must trim the exported translation", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 0, end: 10, wordRange: { from: 2, to: 4 } };

    const preview = verseTextAt(tm, verse.translation!, 0);
    const exported = segmentFor(verse, tm, 0).tr;

    expect(exported).toBe(preview);
  });

  it("no wordRange and no splits still exports the whole verse", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 0, end: 10 };
    expect(segmentFor(verse, tm, 0).ar).toBe(TEXT);
    expect(segmentFor(verse, tm, 0).isLast).toBe(true);
  });

  it("no timing at all exports the whole verse", () => {
    expect(segmentFor(verse, undefined, 0).ar).toBe(TEXT);
  });

  it("splits still drive segment text at each split time", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 0, end: 10, splits: [5] };
    expect(segmentFor(verse, tm, 0).ar).toBe(verseTextAt(tm, TEXT, 0));
    expect(segmentFor(verse, tm, 6).ar).toBe(verseTextAt(tm, TEXT, 6));
    expect(segmentFor(verse, tm, 0).isLast).toBe(false);
    expect(segmentFor(verse, tm, 6).isLast).toBe(true);
  });
});

describe("preview/export audio parity", () => {
  it("a wordRange must trim the exported audio span", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 0, end: 10, wordRange: { from: 0, to: 3 } };
    const [lo, hi] = effectiveAudioBounds(tm, verseWordCount(TEXT));
    expect(lo).toBe(0);
    expect(hi).toBe(4);
  });

  it("no wordRange means the full span", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 2, end: 10 };
    expect(effectiveAudioBounds(tm, verseWordCount(TEXT))).toEqual([2, 10]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/parity.test.ts`
Expected: FAIL — `__test__segmentFor` is not exported from `../export`.

- [ ] **Step 3: Implement**

In `src/lib/export.ts`, replace the body of `segmentFor` (currently lines 133-152):

```ts
// Pick the slice of a verse's text + translation to show at `sourceTime` based
// on its intra-verse splits and word trim. No splits and no wordRange → the
// full verse text passes through.
//
// verseTextAt honours BOTH splits and wordRange, so it must be called whenever
// either is set. Short-circuiting on `splits` alone made a word-trimmed verse
// export its full text while the preview showed the trim.
function segmentFor(
  verse: Verse,
  tm: VerseTiming | undefined,
  sourceTime: number
): { ar: string; tr: string | null | undefined; isLast: boolean } {
  if (!tm || (!tm.splits?.length && !tm.wordRange)) {
    return { ar: verse.text_uthmani, tr: verse.translation, isLast: true };
  }
  let segIdx = 0;
  for (const sp of tm.splits ?? []) { if (sourceTime >= sp) segIdx++; else break; }
  const isLast = segIdx === (tm.splits?.length ?? 0);
  return {
    ar: verseTextAt(tm, verse.text_uthmani, sourceTime),
    tr:
      verse.translation != null
        ? verseTextAt(tm, verse.translation, sourceTime)
        : verse.translation,
    isLast,
  };
}

/** Test-only export. Not part of the public API. */
export const __test__segmentFor = segmentFor;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/parity.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Verify nothing else broke**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: `Tests 98 passed (98)`, clean tsc, clean eslint.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export.ts src/lib/__tests__/parity.test.ts
git commit -m "$(cat <<'EOF'
fix(export): honour wordRange when a verse has no splits

segmentFor short-circuited on `splits`, so a word-trimmed verse with no
splits exported its FULL text while the preview showed the trim. Trim to
4 words: preview showed 4, export emitted 40.

Adds the preview/export parity test that guards this.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Export audio must honour `wordRange` (parity fix, audio)

**Files:**
- Modify: `src/lib/export.ts:469-475` (realtime path), `src/lib/export.ts:573-578` (fast path `assembleAudio`)

**Interfaces:**
- Consumes: `effectiveAudioBounds` (`src/lib/audio-import.ts:44`), `verseWordCount` (Task 1).
- Produces: no signature changes.

**The bug:** `effectiveAudioBounds` is imported by exactly one file — `imported-player.ts:8`. `export.ts` never calls it. Both export paths slice `tm.start..tm.end`, so trimmed words are **audible in the export** but silent in the preview.

- [ ] **Step 1: Add the failing assertion**

Append to `src/lib/__tests__/parity.test.ts`:

```ts
describe("effectiveAudioBounds is the shared audio-span rule", () => {
  it("maps a mid-verse trim proportionally", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 10, end: 20, wordRange: { from: 5, to: 9 } };
    const [lo, hi] = effectiveAudioBounds(tm, 10);
    expect(lo).toBe(15);
    expect(hi).toBe(20);
  });

  it("a zero-length verse is left alone", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 5, end: 5, wordRange: { from: 0, to: 1 } };
    expect(effectiveAudioBounds(tm, 10)).toEqual([5, 5]);
  });
});
```

- [ ] **Step 2: Run to confirm the helper behaves as assumed**

Run: `npx vitest run src/lib/__tests__/parity.test.ts`
Expected: PASS — 9 tests. (This pins `effectiveAudioBounds`'s contract before we depend on it in two more call sites.)

- [ ] **Step 3: Import the helpers in export.ts**

In `src/lib/export.ts`, extend the existing import from `./audio-import` to include `effectiveAudioBounds`, and add the `clip-rows` import:

```ts
import { effectiveAudioBounds, verseTextAt, type VerseTiming } from "./audio-import";
import { verseWordCount } from "./clip-rows";
```

(Keep whatever else that import line already pulls in; only add the missing names.)

- [ ] **Step 4: Fix the realtime path**

In `src/lib/export.ts`, replace lines 469-475 (`if (importedBuffer && options.importedAudio) { ... }` through `scheduleAudioRamp();`):

```ts
      if (importedBuffer && options.importedAudio) {
        // Word-trimmed verses must play only their kept span — the same span
        // imported-player.ts uses for preview. Slicing start..end here is what
        // made the export re-include trimmed words.
        const [lo, hi] = tm
          ? effectiveAudioBounds(tm, verseWordCount(verse.text_uthmani))
          : [0, importedBuffer.duration];
        const start = lo;
        const dur = Math.max(0.05, hi - lo);
        source.buffer = importedBuffer;
        source.connect(master);
        source.start(0, start, dur);
        scheduleAudioRamp();
```

Then, immediately below, the existing `bgVideo` seek must use the same `start`. It already reads `bgVideo.currentTime = start;` — verify it still refers to this `start` and not `sourceStart`.

- [ ] **Step 5: Fix the fast path**

In `src/lib/export.ts`, replace lines 573-578 inside `assembleAudio`:

```ts
      for (const verse of options.verses) {
        const tm = options.importedAudio.timings.find((t) => t.verseNumber === verse.verse_number);
        const [lo, hi] = tm
          ? effectiveAudioBounds(tm, verseWordCount(verse.text_uthmani))
          : [0, full.duration];
        const start = Math.max(0, lo);
        const end = Math.min(full.duration, hi);
        slices.push({ buf: full, offset: start, dur: Math.max(0.05, end - start) });
      }
```

- [ ] **Step 6: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: `Tests 100 passed (100)`, clean tsc, clean eslint.

- [ ] **Step 7: Manual verification (required — this is the parity rule)**

1. `npm run dev`, open <http://localhost:3000/import>, upload any recitation audio.
2. In the studio, open the Timeline editor and set a word trim on a verse that has **no splits** (use the word-trim dialog).
3. Note the trimmed text in the preview and play it — note where the audio stops.
4. Click **Final MP4** and watch the rendered file.
5. Expected: the MP4's text and audio match the preview exactly. Before this task, the MP4 showed the full verse and played the untrimmed audio.

- [ ] **Step 8: Commit**

```bash
git add src/lib/export.ts src/lib/__tests__/parity.test.ts
git commit -m "$(cat <<'EOF'
fix(export): honour wordRange in both audio paths

effectiveAudioBounds was imported only by imported-player.ts, so preview
trimmed the audio and export did not — trimmed words were audible in the
exported file. Route the realtime loop and assembleAudio through it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Export iterates rows, so duplicated verses survive

**Files:**
- Modify: `src/lib/clip-export.ts:88-95`, `src/lib/export.ts:440-448`, `src/lib/export.ts:562-585`

**Interfaces:**
- Consumes: `buildClipRows`, `ClipRow`, `verseWordCount` (Task 1); `effectiveAudioBounds` (Task 3).
- Produces: `ExportOptions` gains `rows: ClipRow[]`. `options.verses` is retained for the reciter path and all styling code that reads it — do NOT remove it.

**The bug:** `export.ts:446` `timings.find(t => t.verseNumber === verse.verse_number)` never finds the second copy of a duplicated verse, so `duplicateVerse` — the whole "split a long ayah into two cards" feature — does not survive export.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/clip-rows.test.ts`:

```ts
describe("duplicated verses reach export", () => {
  it("three timings over two verses yield three rows with distinct spans", () => {
    const rows = buildClipRows([verse(1), verse(2)], [1, 2], [
      tm(1, 0, 5),
      tm(1, 5, 8),
      tm(2, 8, 12),
    ]);
    const spans = rows.map((r) => [r.timing!.start, r.timing!.end]);
    expect(spans).toEqual([[0, 5], [5, 8], [8, 12]]);
  });

  it("the old find-by-verse-number model collapses duplicates (regression witness)", () => {
    const timings = [tm(1, 0, 5), tm(1, 5, 8)];
    const found = [verse(1)].map((v) => timings.find((t) => t.verseNumber === v.verse_number));
    expect(found).toHaveLength(1);
    expect(buildClipRows([verse(1)], [1], timings)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/clip-rows.test.ts`
Expected: FAIL — the first test fails because `buildClipRows` is fine, but confirm both run. If both already pass, that's expected (Task 1 built the model) — this test documents the contract export must now satisfy. Proceed.

- [ ] **Step 3: Add `rows` to ExportOptions**

In `src/lib/export.ts`, add to the `ExportOptions` interface (alongside `verses`):

```ts
  /**
   * The authoritative row list. One entry per timing in imported mode (so a
   * duplicated verse appears twice), one per selected verse in reciter mode.
   * `verses` is retained for the reciter audio path and styling lookups.
   */
  rows: ClipRow[];
```

And import the type:

```ts
import { buildClipRows, verseWordCount, type ClipRow } from "./clip-rows";
```

- [ ] **Step 4: Build rows in clip-export.ts**

In `src/lib/clip-export.ts`, after the `selectedVerses` block (~line 88-91), add:

```ts
  const rows = buildClipRows(
    s.verses,
    s.selectedVerseNumbers,
    s.audioSource.mode === "imported" ? s.audioSource.timings : undefined
  );
  if (rows.length === 0 || !s.surah) return null;
```

and add `rows,` to the `exportOptions` object literal, immediately after `verses: selectedVerses,`.

Import at the top of `clip-export.ts`:

```ts
import { buildClipRows } from "./clip-rows";
```

- [ ] **Step 5: Switch the realtime loop to rows**

In `src/lib/export.ts`, replace the loop header (lines 440-448):

```ts
  for (let i = 0; i < options.rows.length; i++) {
    const { verse, timing: tm } = options.rows[i];
    options.onProgress(i + 1, options.rows.length);

    // The row's own timing — NOT a lookup by verse number, which cannot
    // distinguish a duplicated verse's two rows.
    const sourceStart = tm?.start ?? 0;
    const vSegs = reciterSegs.get(verse.verse_number);
```

Delete the now-dead `const tm = options.importedAudio?.timings.find(...)` line.

- [ ] **Step 6: Switch assembleAudio to rows**

In `src/lib/export.ts`, replace the imported branch of `assembleAudio` (lines 573-578, as rewritten in Task 3):

```ts
      for (const { verse, timing: tm } of options.rows) {
        const [lo, hi] = tm
          ? effectiveAudioBounds(tm, verseWordCount(verse.text_uthmani))
          : [0, full.duration];
        const start = Math.max(0, lo);
        const end = Math.min(full.duration, hi);
        slices.push({ buf: full, offset: start, dur: Math.max(0.05, end - start) });
      }
```

And the reciter branch (lines 580-584):

```ts
      for (const { verse } of options.rows) {
        const r = await fetch(getAudioUrl(options.reciterFolder, options.surahNumber, verse.verse_number));
        const b = await ac.decodeAudioData(await r.arrayBuffer());
        slices.push({ buf: b, offset: 0, dur: b.duration });
      }
```

- [ ] **Step 7: Fix remaining `options.verses` iterations in the frame loop**

Run: `grep -n "options\.verses" src/lib/export.ts`

For every hit that is **iterating rows to render** (loop bounds, per-verse progress, per-verse frame counts), switch it to `options.rows`. Leave hits that are genuine *verse* lookups (e.g. `buildReciterSegments`, translation resource loading) on `options.verses`.

Expected after this step: no loop in `export.ts` derives its row count from `options.verses`.

- [ ] **Step 8: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: all green. tsc will flag any caller of `exportVideo`/`renderClipFile` missing `rows` — fix those call sites by passing `rows`.

- [ ] **Step 9: Manual verification (required)**

1. `npm run dev` → `/import`, upload audio, open the Timeline editor.
2. Select a verse and click **Duplicate**. You now have two rows for one ayah.
3. Give each row a distinct span by dragging their boundary.
4. Click **Final MP4**.
5. Expected: the MP4 contains **both** rows, back to back. Before this task, the second row was silently dropped and only the first timing's slice was emitted.

- [ ] **Step 10: Commit**

```bash
git add src/lib/export.ts src/lib/clip-export.ts src/lib/__tests__/clip-rows.test.ts
git commit -m "$(cat <<'EOF'
fix(export): iterate clip rows so duplicated verses survive

export.ts looked timings up with find(byVerseNumber), which can never
find the second copy of a duplicated verse — so duplicateVerse worked in
the editor and silently emitted one row on export.

Rows are now built once by buildClipRows and iterated directly.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Preview iterates rows

**Files:**
- Modify: `src/components/StudioPreview.tsx:368-392`

**Interfaces:**
- Consumes: `buildClipRows` (Task 1).
- Produces: nothing new.

**The bug:** `StudioPreview.tsx:369` reads `verses[currentVerseIndex]` and `:385` reads `timings[currentVerseIndex]` — two arrays assumed index-aligned. After a duplicate they are not, so the preview shows the *wrong verse text against the duplicate's audio*. `TimelineEditor.tsx:764` sets `currentVerseIndex = verseIdx + 1`, which is an index into **timings**, making the preview's verse lookup wrong by one from that point on.

`currentVerseIndex` is therefore a **row index**. Rows make that explicit.

- [ ] **Step 1: Read the current code**

Run: `sed -n '360,400p' src/components/StudioPreview.tsx`

Confirm it derives `selectedVerses` by filtering and indexes both arrays by `currentVerseIndex`.

- [ ] **Step 2: Replace the derivation**

In `src/components/StudioPreview.tsx`, replace the `selectedVerses`/`timings` index-aligned lookup with:

```ts
  // currentVerseIndex is a ROW index — TimelineEditor sets it from the timings
  // array. Filtering verses and indexing that by the same number breaks the
  // moment a verse is duplicated (two timings, one verse number).
  const rows = buildClipRows(
    s.verses,
    s.selectedVerseNumbers,
    s.audioSource.mode === "imported" ? s.audioSource.timings : undefined
  );
  const row = rows[s.currentVerseIndex];
  const verse = row?.verse;
  const tm = row?.timing;
```

Then update the downstream references in that block from `selectedVerses[s.currentVerseIndex]` → `verse` and `timings[s.currentVerseIndex]` → `tm`.

Add the import:

```ts
import { buildClipRows } from "@/lib/clip-rows";
```

- [ ] **Step 3: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: all green.

- [ ] **Step 4: Manual verification (required — the parity rule)**

1. `npm run dev` → `/import`, upload audio, Timeline editor.
2. Duplicate a verse, then drag the two rows to different spans.
3. Click each row and scrub the playhead across both.
4. Expected: the preview shows the correct verse text for **both** rows, and matches the Final MP4 from Task 4.
5. Specifically check the row *after* the duplicate — that's where the old off-by-one showed the wrong text.

- [ ] **Step 5: Commit**

```bash
git add src/components/StudioPreview.tsx
git commit -m "$(cat <<'EOF'
fix(preview): index clip rows, not two arrays assumed aligned

currentVerseIndex is a row index (TimelineEditor sets it from timings),
but the preview used it to index a filtered verse list too. After a
duplicate the two diverge and every later row showed the wrong text.

Preview and export now derive rows from the same buildClipRows call.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Settings that never persist

**Files:**
- Modify: `src/types/index.ts:76-124`, `src/app/studio/page.tsx:184-230`
- Test: `src/lib/__tests__/settings-roundtrip.test.ts` (create)

**Interfaces:**
- Consumes: `Project` (`src/types`), `AppState` (`src/lib/store.ts`).
- Produces: nothing new.

**The bug:** every setting must be declared in four places — `AppState`, `Project["settings"]`, the `saveNow` literal, and `restoreProject`. Three fell through: `translationVerseNumber`, `wordHighlight`, `backgroundVideoSync`. All three are live toggles (`StudioSettings.tsx:539`, `:450`, `:875`). Toggle one, reload the project, it silently reverts.

`restoreProject` needs no change — it spreads `...settings`, so the keys apply once they exist.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/settings-roundtrip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * Guards the four-place settings duplication that silently dropped
 * translationVerseNumber, wordHighlight and backgroundVideoSync. Until the
 * declarations are unified (Phase 1), this test is what keeps them in sync.
 */
function appStateSettingFields(): Set<string> {
  const src = read("src/lib/store.ts");
  const block = src.slice(src.indexOf("interface AppState"), src.indexOf("  setSurah:"));
  const fields = new Set(
    [...block.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1])
  );
  // Runtime/session state that is deliberately not persisted.
  for (const t of [
    "surah", "verses", "selectedVerseNumbers", "currentVerseIndex", "projectId",
    "playbackSegmentArabic", "playbackSegmentTranslation", "playbackSegmentIsLast",
    "activeWordIndex", "audioSource", "verseParts", "activePartIndex",
  ]) fields.delete(t);
  return fields;
}

function projectSettingsFields(): Set<string> {
  const src = read("src/types/index.ts");
  const start = src.indexOf("  settings: {");
  const block = src.slice(start, src.indexOf("\n  };", start));
  return new Set([...block.matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]));
}

function saveNowFields(): Set<string> {
  const src = read("src/app/studio/page.tsx");
  const start = src.indexOf("      settings: {");
  const block = src.slice(start, src.indexOf("\n      },", start));
  return new Set([...block.matchAll(/(\w+):\s*state\./g)].map((m) => m[1]));
}

describe("settings persistence round-trip", () => {
  it("every persistable store field is declared in Project['settings']", () => {
    const missing = [...appStateSettingFields()].filter((f) => !projectSettingsFields().has(f));
    expect(missing).toEqual([]);
  });

  it("every persistable store field is written by saveNow", () => {
    const missing = [...appStateSettingFields()].filter((f) => !saveNowFields().has(f));
    expect(missing).toEqual([]);
  });

  it("saveNow writes nothing that Project['settings'] does not declare", () => {
    const extra = [...saveNowFields()].filter((f) => !projectSettingsFields().has(f));
    expect(extra).toEqual([]);
  });

  it("the three previously-dropped toggles are covered", () => {
    for (const f of ["translationVerseNumber", "wordHighlight", "backgroundVideoSync"]) {
      expect(projectSettingsFields()).toContain(f);
      expect(saveNowFields()).toContain(f);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/settings-roundtrip.test.ts`
Expected: FAIL — missing `["backgroundVideoSync", "translationVerseNumber", "wordHighlight"]`.

- [ ] **Step 3: Add the keys to the type**

In `src/types/index.ts`, inside `Project["settings"]`, add beside the related keys:

```ts
    translationVerseNumber?: boolean;
    wordHighlight?: boolean;
    backgroundVideoSync?: boolean;
```

All three are optional — clips saved before this change simply lack them, and `restoreProject`'s spread leaves the store default in place.

- [ ] **Step 4: Add the keys to saveNow**

In `src/app/studio/page.tsx`, inside the `settings: { ... }` literal:

```ts
        translationVerseNumber: state.translationVerseNumber,
        wordHighlight: state.wordHighlight,
        backgroundVideoSync: state.backgroundVideoSync,
```

- [ ] **Step 5: Add them to the autosave dependency array**

The autosave effect (`src/app/studio/page.tsx:261-272`) lists every setting it watches. Add to that array:

```ts
    store.translationVerseNumber, store.wordHighlight, store.backgroundVideoSync,
```

Without this, toggling them saves only when some *other* setting changes.

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run src/lib/__tests__/settings-roundtrip.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 7: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: `Tests 106 passed (106)`, clean.

- [ ] **Step 8: Manual verification**

1. `npm run dev`, open a clip in the studio.
2. Open Style → toggle **verse number on translation** ON and **word highlight** ON.
3. Wait ~3s for autosave (or click Save).
4. Reload the page and reopen the same project from the dashboard.
5. Expected: both toggles are still ON. Before this task they silently reverted.

- [ ] **Step 9: Commit**

```bash
git add src/types/index.ts src/app/studio/page.tsx src/lib/__tests__/settings-roundtrip.test.ts
git commit -m "$(cat <<'EOF'
fix(studio): persist translationVerseNumber, wordHighlight, backgroundVideoSync

Settings are declared in four places (AppState, Project['settings'],
saveNow, restoreProject). These three were missing from two of them, so
the toggles silently reverted on reload.

Adds a test that fails if the four declarations drift again.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: The library deletes clips you cannot see

**Files:**
- Modify: `src/app/library/page.tsx:125-149`, `:399-410`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

**The bug:** `selected` (a `Set` of ids) is never reconciled against `filtered`. Select 5 clips → change the reciter filter → **Delete** removes all 5 including the 4 now off-screen, and the confirm says only "Delete 5 clip(s)?". Separately, "Select All" compares `selected.size === filtered.length` — **counts, not membership** (`:403`, `:408`) — so selecting 3 in folder A then filtering to folder B (also 3) shows "Deselect All" while nothing visible is selected.

- [ ] **Step 1: Read the current code**

Run: `sed -n '124,150p;399,412p' src/app/library/page.tsx`

- [ ] **Step 2: Derive the effective selection**

In `src/app/library/page.tsx`, immediately after `filtered` is computed (~line 217-223), add:

```ts
  // Bulk actions must only ever touch what the user can SEE. `selected` is
  // keyed by id and survives filter changes, so intersect it with `filtered`
  // before any action reads it — otherwise "Delete 3" silently deletes clips
  // scrolled out of existence by a filter change.
  const filteredIds = new Set(filtered.map((c) => c.id));
  const visibleSelected = useMemo(
    () => [...selected].filter((id) => filteredIds.has(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, filtered]
  );
```

- [ ] **Step 3: Route every bulk action through it**

Replace the bodies of the bulk handlers (~lines 134-204) so each iterates `visibleSelected` rather than `selected`. For the delete handler:

```ts
  const deleteSelected = async () => {
    if (visibleSelected.length === 0) return;
    if (!confirm(`Delete ${visibleSelected.length} clip(s)? This cannot be undone.`)) return;
    for (const id of visibleSelected) await removeClip(id);
    setSelected(new Set());
  };
```

Apply the same `visibleSelected` substitution to the bulk move-to-folder and bulk share handlers.

- [ ] **Step 4: Fix Select All to compare membership**

Replace the count comparisons at `:403` and `:408`:

```ts
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleSelectAll = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((c) => c.id)));
  };
```

Use `allVisibleSelected` for the button label and `visibleSelected.length` for every displayed count.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: all green.

- [ ] **Step 6: Manual verification (required — this is data loss)**

1. `npm run dev` → <http://localhost:3000/library>.
2. Select 3 clips from reciter A.
3. Change the reciter filter to B (so none of the 3 are visible).
4. Expected: the bulk bar shows **0 selected**, Delete is unavailable, and the Select All button reads "Select All" (not "Deselect All").
5. Switch back to A — the 3 are still selected. Delete now says "Delete 3 clip(s)?" and deletes exactly those 3.

- [ ] **Step 7: Commit**

```bash
git add src/app/library/page.tsx
git commit -m "$(cat <<'EOF'
fix(library): bulk actions must only touch visible clips

`selected` survived filter changes, so selecting 5 clips then changing
the filter and pressing Delete removed all 5 — including the 4 no longer
on screen — while the confirm said only "Delete 5 clip(s)?".

Also fixes Select All comparing selection COUNT to filtered count rather
than membership, which mislabelled the button across filter changes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Silent export loss

**Files:**
- Modify: `src/lib/clip-export.ts:185-205`, `src/components/ExportButton.tsx:45-60`

**Interfaces:**
- Consumes: `saveClip` (`src/lib/clip-library.ts`), which returns `Promise<boolean>`.
- Produces: `saveRenderedToLibrary` changes from `Promise<void>` to `Promise<boolean>` — `true` when the clip is in the library.

**The bug:** `saveRenderedToLibrary` calls `await saveClip(meta, file)` and **discards the boolean** (`clip-export.ts:201`); the catch only `console.warn`s. `ExportButton.tsx:52` shows nothing either way. Disk full → the user sees a successful export and the clip was never saved. Success and total loss are visually identical.

- [ ] **Step 1: Return the result from saveRenderedToLibrary**

In `src/lib/clip-export.ts`, change the signature and return the outcome:

```ts
/** Save a rendered clip to the library. Returns false if it was NOT stored —
 *  the caller must tell the user, because the exported file itself is fine and
 *  the failure is otherwise invisible. */
export async function saveRenderedToLibrary(file: File): Promise<boolean> {
  try {
    // ... existing meta construction, unchanged ...
    return await saveClip(meta, file);
  } catch (err) {
    console.warn("Could not save clip to library:", err);
    return false;
  }
}
```

- [ ] **Step 2: Surface it in ExportButton**

In `src/components/ExportButton.tsx`, replace the fire-and-forget call (~line 52):

```ts
      const savedToLibrary = await saveRenderedToLibrary(file);
      if (!savedToLibrary) {
        setLibraryWarning(
          "Exported — but this clip could not be saved to your library. Check free disk space."
        );
      }
```

Add the state near the component's other state:

```ts
  const [libraryWarning, setLibraryWarning] = useState<string | null>(null);
```

And render it below the button (use the existing error-message pattern in this file):

```tsx
      {libraryWarning && (
        <p role="alert" className="mt-2 text-xs text-[var(--muted)]">
          {libraryWarning}
        </p>
      )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: all green. tsc flags any other caller of `saveRenderedToLibrary` — check `grep -rn "saveRenderedToLibrary" src/` and handle the boolean at each.

- [ ] **Step 4: Manual verification**

1. `npm run dev`, export any clip normally → no warning, clip appears in `/library`.
2. Simulate failure: temporarily edit `src/lib/clip-library.ts`'s `saveClip` to `return false;` at the top.
3. Export again.
4. Expected: the file still downloads AND the warning appears.
5. Revert the temporary edit.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clip-export.ts src/components/ExportButton.tsx
git commit -m "$(cat <<'EOF'
fix(export): tell the user when a clip is not saved to the library

saveRenderedToLibrary discarded saveClip's boolean and ExportButton
showed nothing either way, so a disk-full save failure looked exactly
like a successful export.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Atomic library writes

**Files:**
- Modify: `src/lib/library-server.ts:77-80`, `:109-112`
- Test: `src/lib/__tests__/library-server.test.ts` (create)

**Interfaces:**
- Consumes: `node:fs/promises`.
- Produces: `writeMeta`/`writeFolders` keep their signatures. Adds `safeId` and `canonicalVideoType` coverage.

**The bug:** `library-server.ts:79` and `:111` are bare `fs.writeFile`. A crash or ENOSPC mid-write truncates the JSON; `listMeta` (`:60-64`) then **silently skips** the corrupt entry — the clip vanishes from the UI while its ~36MB video leaks on disk forever, with no way to notice. Temp-file + `rename` makes the write atomic (rename is atomic within a filesystem).

Also: `safeId` and `canonicalVideoType` are the entire security boundary, they are pure dependency-free functions, and they have zero tests.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/library-server.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canonicalVideoType } from "../library-server";

describe("canonicalVideoType", () => {
  it("accepts the two known-safe video types", () => {
    expect(canonicalVideoType("video/mp4")).toBe("video/mp4");
    expect(canonicalVideoType("video/webm")).toBe("video/webm");
  });

  it("ignores a codecs suffix", () => {
    expect(canonicalVideoType('video/mp4; codecs="avc1.640028"')).toBe("video/mp4");
    expect(canonicalVideoType("video/webm;codecs=vp9")).toBe("video/webm");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(canonicalVideoType("  VIDEO/MP4  ")).toBe("video/mp4");
  });

  it("rejects anything else — this is what stops stored XSS", () => {
    for (const bad of ["text/html", "image/svg+xml", "video/quicktime", "", "application/json"]) {
      expect(canonicalVideoType(bad)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `npx vitest run src/lib/__tests__/library-server.test.ts`
Expected: PASS — 4 tests. (`canonicalVideoType` is already correct; this pins it before we touch the file.)

- [ ] **Step 3: Make writeMeta atomic**

In `src/lib/library-server.ts`, replace `writeMeta` (lines 77-80):

```ts
/**
 * Write metadata atomically. A bare writeFile that is interrupted (crash, disk
 * full) leaves truncated JSON, which listMeta then silently skips — the clip
 * disappears from the UI while its video leaks on disk forever. rename() within
 * a filesystem is atomic, so a reader sees either the old file or the new one.
 */
export async function writeMeta(meta: LibraryClip): Promise<void> {
  await ensureDirs();
  const target = join(META, `${safeId(meta.id)}.json`);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(meta));
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp).catch(() => {});
    throw err;
  }
}
```

- [ ] **Step 4: Make writeFolders atomic**

Replace `writeFolders` (lines 109-112):

```ts
export async function writeFolders(folders: string[]): Promise<void> {
  await ensureDirs();
  const tmp = `${FOLDERS_FILE}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(folders));
    await fs.rename(tmp, FOLDERS_FILE);
  } catch (err) {
    await fs.rm(tmp).catch(() => {});
    throw err;
  }
}
```

- [ ] **Step 5: Skip temp files when listing**

In `listMeta` (line 59), the `.json` filter already excludes `.tmp` files (they end `.json.<pid>.tmp`). Confirm with:

Run: `sed -n '54,67p' src/lib/library-server.ts`
Expected: the loop guards `if (!f.endsWith(".json")) continue;` — no change needed.

- [ ] **Step 6: Reject duplicate ids on POST**

In `src/app/api/library/route.ts`, before `writeVideo`/`writeMeta` (~line 68), add:

```ts
  // POST accepts a client-supplied id. Without this check a colliding id
  // silently destroys an existing clip AND its video.
  if (await readMeta(meta.id)) {
    return NextResponse.json({ error: "clip id already exists" }, { status: 409 });
  }
```

Add `readMeta` to the existing import from `@/lib/library-server`.

- [ ] **Step 7: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: `Tests 110 passed (110)`, clean.

- [ ] **Step 8: Manual verification**

1. `npm run dev` → `/library`. Export a clip; confirm it appears.
2. Create a folder, rename the filter, reload — the folder persists.
3. Run `ls ~/Documents/AyahClip/Library/meta/` — expect only `.json` files, no `.tmp` leftovers.

- [ ] **Step 9: Commit**

```bash
git add src/lib/library-server.ts src/app/api/library/route.ts src/lib/__tests__/library-server.test.ts
git commit -m "$(cat <<'EOF'
fix(library): atomic metadata writes; reject duplicate ids

A bare writeFile interrupted by a crash or a full disk left truncated
JSON, which listMeta silently skipped — the clip vanished from the UI
while its ~36MB video leaked on disk with no way to notice. Write to a
temp file and rename.

POST also accepted a client-supplied id with no existence check, so a
collision silently destroyed an existing clip and its video.

Adds the first tests for canonicalVideoType, which is the guard that
stops a stored clip carrying an arbitrary Content-Type.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Phase 0 verification

**Files:** none modified.

**Interfaces:**
- Consumes: everything above.
- Produces: a verified baseline for Phase 1.

- [ ] **Step 1: Full green check**

Run:
```bash
npx vitest run && npx tsc --noEmit && npx eslint && npm run build
```
Expected: ~110 tests pass, clean tsc, clean eslint, successful build.

- [ ] **Step 2: End-to-end parity walkthrough (the point of the whole phase)**

1. `npm run dev` → `/import`, upload a recitation with 3+ verses.
2. Timeline editor: **duplicate** one verse, drag the copies to distinct spans, and **word-trim** a different verse that has no splits.
3. Note exactly what the preview shows and plays for every row.
4. Click **Final MP4** and watch it end to end.
5. **Expected: the MP4 matches the preview exactly** — both duplicate rows present, the trimmed verse showing only its kept words and playing only its kept audio.
6. Reload the project from the dashboard; confirm the trim, the duplicate, and the Style toggles all survive.

- [ ] **Step 3: Record the outcome**

If any step 2 expectation fails, STOP and report — the phase is not done. Do not proceed to Phase 1 with a lying preview.

- [ ] **Step 4: Tag the baseline**

```bash
git tag phase-0-correctness
git log --oneline phase-0-correctness~10..phase-0-correctness
```

---

## Self-review notes

**Spec coverage:** P0.1 → Tasks 2, 3. P0.2 → Tasks 1, 4, 5. P0.3 → Task 6. P0.4 → Task 7. P0.5 → Task 8. P0.6 → Task 9. P0.7 → Task 0. Spec §11 items 1–4 partially seeded (parity test, settings round-trip, `canonicalVideoType`); `timing-ops` invariants and CI are Phase 1.

**Deliberately deferred to Phase 1** (in the spec, not this plan): the `timing-ops.ts` chokepoint and `normalizeTimings`, unified undo history, unmounting the dock editor when fullscreen, the leak fixes, and the `verseTextAt`/`sanitizeArabic` word-count inconsistency (`verseWordCount` pins the definition used by `wordRange`; reconciling `store.ts:421` to it belongs with the chokepoint work).

**Known risk:** Task 4 step 7 (`grep options.verses`) is the least mechanical step — it requires judging which iterations are row loops and which are verse lookups. `assembleAudio`'s `verseDurations` feeds the fast path's per-row frame counts, so it MUST become row-length or the fast export desyncs audio from video. Review that one closely.
