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
