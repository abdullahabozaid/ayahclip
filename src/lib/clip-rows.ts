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
