import type { VerseTiming } from "./audio-import";

export const BULK_CLIP_COUNTS = [15, 20, 30, 40] as const;
export type BulkClipCount = (typeof BULK_CLIP_COUNTS)[number];

export interface BulkDetectedAyah extends VerseTiming {
  surah: number;
  confidence: "high" | "medium" | "selected";
  sourceWindow: number;
}

export interface BulkClipCandidate {
  id: string;
  order: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  start: number;
  end: number;
  duration: number;
  timings: BulkDetectedAyah[];
  confidence: BulkDetectedAyah["confidence"];
  templateId: string;
  approved: boolean;
}

const confidenceRank = { selected: 0, medium: 1, high: 2 } as const;

/**
 * Merge duplicate ayahs produced by overlapping recognition windows. A duplicate
 * must agree on the Quran reference and overlap in source time. Higher-confidence
 * timing wins; otherwise the longer timing is retained.
 */
export function mergeBulkAyahs(input: readonly BulkDetectedAyah[]): BulkDetectedAyah[] {
  const sorted = [...input].sort((a, b) => a.start - b.start || a.surah - b.surah || a.verseNumber - b.verseNumber);
  const merged: BulkDetectedAyah[] = [];
  for (const ayah of sorted) {
    if (!(ayah.end > ayah.start)) continue;
    const duplicateIndex = merged.findIndex((existing) =>
      existing.surah === ayah.surah
      && existing.verseNumber === ayah.verseNumber
      && Math.min(existing.end, ayah.end) > Math.max(existing.start, ayah.start),
    );
    if (duplicateIndex < 0) {
      merged.push({ ...ayah });
      continue;
    }
    const existing = merged[duplicateIndex];
    const existingRank = confidenceRank[existing.confidence];
    const nextRank = confidenceRank[ayah.confidence];
    if (nextRank > existingRank || (
      nextRank === existingRank && ayah.end - ayah.start > existing.end - existing.start
    )) {
      merged[duplicateIndex] = { ...ayah };
    }
  }
  return merged.sort((a, b) => a.start - b.start);
}

function weakestConfidence(timings: readonly BulkDetectedAyah[]): BulkDetectedAyah["confidence"] {
  return timings.reduce<BulkDetectedAyah["confidence"]>((weakest, timing) =>
    confidenceRank[timing.confidence] < confidenceRank[weakest] ? timing.confidence : weakest,
  "high");
}

/**
 * Create up to `requestedCount` chronological candidates. The target duration is
 * only a soft balancing signal: every start and end is copied from a complete
 * detected ayah, and a candidate never crosses a surah or an unrecognised gap.
 */
export function buildVerseCompleteCandidates({
  ayahs,
  requestedCount,
  templateId,
  maxGapSeconds = 3,
}: {
  ayahs: readonly BulkDetectedAyah[];
  requestedCount: number;
  templateId: string;
  maxGapSeconds?: number;
}): BulkClipCandidate[] {
  const merged = mergeBulkAyahs(ayahs);
  if (merged.length === 0 || requestedCount <= 0) return [];

  const runs: BulkDetectedAyah[][] = [];
  for (const ayah of merged) {
    const run = runs.at(-1);
    const previous = run?.at(-1);
    const continues = previous
      && previous.surah === ayah.surah
      && ayah.verseNumber === previous.verseNumber + 1
      && ayah.start - previous.end <= maxGapSeconds;
    if (!continues) runs.push([ayah]);
    else run!.push(ayah);
  }

  const totalDuration = runs.reduce((sum, run) => sum + (run.at(-1)!.end - run[0].start), 0);
  const softTarget = totalDuration / Math.min(requestedCount, merged.length);
  const candidates: BulkClipCandidate[] = [];

  for (let runIndex = 0; runIndex < runs.length; runIndex++) {
    const run = runs[runIndex];
    let cursor = 0;
    while (cursor < run.length) {
      const clipsRemaining = requestedCount - candidates.length;
      if (clipsRemaining <= 0) break;
      const ayahsRemaining = run.length - cursor;
      const otherRunsMinimum = runs.slice(runIndex + 1).filter((item) => item.length > 0).length;
      const canSpend = Math.max(1, clipsRemaining - otherRunsMinimum);
      const idealAyahs = Math.max(1, Math.ceil(ayahsRemaining / canSpend));
      let endIndex = Math.min(run.length - 1, cursor + idealAyahs - 1);

      while (
        endIndex + 1 < run.length
        && run[endIndex].end - run[cursor].start < softTarget
        && run.length - (endIndex + 1) > Math.max(0, canSpend - 1)
      ) {
        endIndex += 1;
      }

      const timings = run.slice(cursor, endIndex + 1);
      const start = timings[0].start;
      const end = timings.at(-1)!.end;
      const order = candidates.length + 1;
      candidates.push({
        id: `bulk-${order}-${timings[0].surah}-${timings[0].verseNumber}-${timings.at(-1)!.verseNumber}`,
        order,
        surah: timings[0].surah,
        ayahStart: timings[0].verseNumber,
        ayahEnd: timings.at(-1)!.verseNumber,
        start,
        end,
        duration: end - start,
        timings: timings.map((timing) => ({ ...timing })),
        confidence: weakestConfidence(timings),
        templateId,
        approved: true,
      });
      cursor = endIndex + 1;
    }
  }
  return candidates;
}
