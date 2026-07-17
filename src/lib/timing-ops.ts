// Pure operations over the imported-audio verse timeline. Kept DOM-free and
// side-effect-free so they can be unit-tested and shared by every editor.
//
// The one wired into the store today is `normalizeTimings` — the chokepoint that
// enforces the timeline invariants that `setVerseTimings` previously accepted
// any array without checking (the RC1 bug class: a split escaping its verse's
// bounds made verseTextAt overrun and show the wrong words).

import type { VerseTiming } from "./audio-import";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Enforce the timeline invariants without ever changing structure:
 *
 * - Rows are neither reordered nor dropped — a duplicated verse (two rows with
 *   the same verseNumber) must survive, so this maps 1:1.
 * - Each split time is clamped inside its verse's [start, end] and kept
 *   monotonically non-decreasing. The `splits` array length is preserved, so the
 *   parallel `splitWords` / `splitCharFractions` (word/char indices, NOT times)
 *   stay in sync — dropping or reordering a split would desync them and corrupt
 *   the word-part mapping (a text-integrity fatal bug).
 * - `start`/`end` are clamped into [0, duration] only when a duration is known
 *   (the store doesn't track it, so callers without it skip that part).
 *
 * Returns the same array reference semantics as `.map` — a new array of the same
 * length. Safe to call on every timing update.
 */
export function normalizeTimings(
  timings: VerseTiming[],
  duration?: number
): VerseTiming[] {
  return timings.map((t) => {
    let start = t.start;
    let end = t.end;
    if (duration != null) {
      start = clamp(start, 0, duration);
      end = clamp(end, start, duration);
    } else if (end < start) {
      end = start;
    }

    if (!t.splits || t.splits.length === 0) {
      return start === t.start && end === t.end ? t : { ...t, start, end };
    }

    // Clamp each split into (start, end) and keep the sequence non-decreasing,
    // WITHOUT changing the array length or touching splitWords.
    let prev = start;
    const splits = t.splits.map((sp) => {
      const inBounds = clamp(sp, start, end);
      const monotonic = Math.max(prev, inBounds);
      prev = monotonic;
      return monotonic;
    });

    const unchanged =
      start === t.start &&
      end === t.end &&
      splits.every((v, i) => v === t.splits![i]);
    return unchanged ? t : { ...t, start, end, splits };
  });
}

/**
 * Return the contiguous Quran reference rows that recognition/alignment should
 * operate on. Editor rows are deliberately not the reference: a user can split
 * one ayah into several duplicate rows, so passing the raw row list to
 * autoSegment creates a verse/weight length mismatch.
 */
export function verseNumbersForAlignment(timings: readonly VerseTiming[]): number[] {
  return [...new Set(timings.map((timing) => timing.verseNumber))].sort((a, b) => a - b);
}

/** Mark one real internal ayah boundary as creator-checked without rewriting the
 * model's original confidence. Index 0 is the clip trim, not an internal cut. */
export function markAlignmentBoundaryReviewed(
  timings: readonly VerseTiming[],
  boundaryRowIndex: number,
): VerseTiming[] {
  if (boundaryRowIndex <= 0 || boundaryRowIndex >= timings.length) {
    return timings.map((timing) => ({ ...timing }));
  }
  const boundary = timings[boundaryRowIndex];
  if (boundary.alignmentConfidence !== "medium" && boundary.alignmentConfidence !== "low") {
    return timings.map((timing) => ({ ...timing }));
  }
  return timings.map((timing, index) => index === boundaryRowIndex
    ? { ...timing, alignmentReviewed: true }
    : { ...timing });
}

/**
 * Project one aligned timing per ayah back onto the user's current editor rows.
 *
 * Alignment engines work on a unique Quran range, while the editor can contain
 * duplicated rows, word trims, and intra-ayah caption splits. Replacing the
 * editor array with the engine result silently erased that structure. This
 * function instead rescales every existing row and split inside the newly
 * aligned ayah span, preserving row order and all word/text metadata.
 */
export function applyAlignedTimingsToRows(
  current: readonly VerseTiming[],
  aligned: readonly VerseTiming[],
): VerseTiming[] {
  const alignedByVerse = new Map<number, VerseTiming>();
  for (const timing of aligned) {
    if (!alignedByVerse.has(timing.verseNumber)) alignedByVerse.set(timing.verseNumber, timing);
  }

  const rowsByVerse = new Map<number, { indexes: number[]; start: number; end: number }>();
  current.forEach((timing, index) => {
    const group = rowsByVerse.get(timing.verseNumber);
    if (group) {
      group.indexes.push(index);
      group.start = Math.min(group.start, timing.start);
      group.end = Math.max(group.end, timing.end);
    } else {
      rowsByVerse.set(timing.verseNumber, {
        indexes: [index],
        start: timing.start,
        end: timing.end,
      });
    }
  });

  return current.map((timing, rowIndex) => {
    const target = alignedByVerse.get(timing.verseNumber);
    const group = rowsByVerse.get(timing.verseNumber);
    if (!target || !group) return { ...timing };

    const oldDuration = group.end - group.start;
    const newDuration = Math.max(0, target.end - target.start);
    let mapTime: (time: number) => number;
    let start: number;
    let end: number;

    if (oldDuration > 1e-6) {
      mapTime = (time) => target.start +
        ((time - group.start) / oldDuration) * newDuration;
      start = mapTime(timing.start);
      end = mapTime(timing.end);
    } else {
      // Degenerate legacy data: distribute duplicate rows evenly rather than
      // stacking every row at the same timestamp.
      const position = group.indexes.indexOf(rowIndex);
      const count = Math.max(1, group.indexes.length);
      start = target.start + (position / count) * newDuration;
      end = target.start + ((position + 1) / count) * newDuration;
      const oldRowDuration = Math.max(1e-6, timing.end - timing.start);
      mapTime = (time) => start +
        ((time - timing.start) / oldRowDuration) * Math.max(0, end - start);
    }

    // The diagnostic describes the boundary before the ayah, not every editor
    // row carrying that ayah. Duplicate rows are intra-ayah edits and must not
    // display extra model-review markers.
    const carriesAyahBoundary = group.indexes[0] === rowIndex;
    return {
      ...timing,
      start,
      end,
      splits: timing.splits?.map(mapTime),
      splitWords: timing.splitWords ? [...timing.splitWords] : undefined,
      splitCharFractions: timing.splitCharFractions
        ? [...timing.splitCharFractions]
        : undefined,
      wordRange: timing.wordRange ? { ...timing.wordRange } : undefined,
      alignmentMethod: carriesAyahBoundary ? target.alignmentMethod : undefined,
      alignmentConfidence: carriesAyahBoundary ? target.alignmentConfidence : undefined,
      alignmentAgreementSeconds: carriesAyahBoundary
        ? target.alignmentAgreementSeconds
        : undefined,
      alignmentReviewed: carriesAyahBoundary ? false : undefined,
    };
  });
}
