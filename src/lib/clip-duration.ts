import type { Verse } from "@/types";
import { effectiveAudioBounds, type VerseTiming } from "./audio-import";
import { verseWordCount } from "./clip-rows";

/** Duration the exporter will actually play for an imported timeline. */
export function importedClipDurationSeconds(
  timings: readonly VerseTiming[],
  verses: readonly Pick<Verse, "verse_number" | "text_uthmani">[],
): number {
  const wordCounts = new Map(
    verses.map((verse) => [verse.verse_number, verseWordCount(verse.text_uthmani)]),
  );
  return timings.reduce((total, timing) => {
    const [start, end] = effectiveAudioBounds(
      timing,
      wordCounts.get(timing.verseNumber) ?? 0,
    );
    // Matches export.ts, which protects every row with the same 50 ms floor.
    return total + Math.max(0.05, end - start);
  }, 0);
}

export function formatClipDuration(seconds: number, approximate = false): string {
  const safe = Math.max(0, seconds);
  const prefix = approximate ? "~" : "";
  if (safe < 60) {
    const rounded = safe < 10 ? Math.round(safe * 10) / 10 : Math.round(safe);
    return `${prefix}${rounded}s`;
  }
  const rounded = Math.round(safe);
  return `${prefix}${Math.floor(rounded / 60)}m ${rounded % 60}s`;
}
