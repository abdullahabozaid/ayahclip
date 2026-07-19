import type { VerseTiming } from "./audio-import";

export const BULK_CLIP_COUNTS = [15, 20, 30, 40] as const;
export type BulkClipCount = (typeof BULK_CLIP_COUNTS)[number];
export const BULK_IDEAL_CLIP_SECONDS = [30, 45, 60, 90] as const;
export type BulkIdealClipSeconds = (typeof BULK_IDEAL_CLIP_SECONDS)[number];
export const BULK_ARABIC_LINE_LIMITS = [2, 3, 4] as const;
export type BulkArabicLineLimit = (typeof BULK_ARABIC_LINE_LIMITS)[number];
export const BULK_AYAHS_PER_CLIP = [1, 2, 3, 4] as const;
export type BulkAyahsPerClip = (typeof BULK_AYAHS_PER_CLIP)[number];
export type BulkGroupingMode = "duration" | "exact" | "whole-passage";

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
  /** Compact review frame persisted with the batch. Audio-only sources omit it. */
  thumbnail?: string;
}

const confidenceRank = { selected: 0, medium: 1, high: 2 } as const;

export function isCompleteDetectedAyah(ayah: BulkDetectedAyah): boolean {
  if (!ayah.wordRange) return true;
  const total = ayah.alignedWordStarts?.length ?? 0;
  return total > 0 && ayah.wordRange.from === 0 && ayah.wordRange.to >= total - 1;
}

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
    const existingComplete = isCompleteDetectedAyah(existing);
    const nextComplete = isCompleteDetectedAyah(ayah);
    if (nextComplete !== existingComplete) {
      if (nextComplete) merged[duplicateIndex] = { ...ayah };
      continue;
    }
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
  idealClipSeconds = 45,
  maxAyahsPerClip = 4,
  groupingMode = "duration",
  ayahsPerClip = 2,
  maxGapSeconds = 3,
}: {
  ayahs: readonly BulkDetectedAyah[];
  requestedCount: number;
  templateId: string;
  idealClipSeconds?: number;
  maxAyahsPerClip?: number;
  groupingMode?: BulkGroupingMode;
  ayahsPerClip?: BulkAyahsPerClip;
  maxGapSeconds?: number;
}): BulkClipCandidate[] {
  // A recognition window can start or end halfway through an ayah. Keep those
  // rows available for Studio review, but never advertise them as a complete,
  // upload-ready Bulk clip boundary. Overlapping windows normally supply the
  // complete copy, which mergeBulkAyahs deliberately prefers.
  const merged = mergeBulkAyahs(ayahs).filter(isCompleteDetectedAyah);
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

  const grouped: BulkDetectedAyah[][] = [];
  if (groupingMode === "whole-passage") {
    grouped.push(...runs);
  } else if (groupingMode === "exact") {
    const exactCount = Math.max(1, Math.min(4, Math.floor(ayahsPerClip)));
    for (const run of runs) {
      for (let cursor = 0; cursor + exactCount <= run.length; cursor += exactCount) {
        grouped.push(run.slice(cursor, cursor + exactCount));
      }
    }
  } else {
    const target = Math.max(5, idealClipSeconds);
    const maxAyahs = Math.max(1, Math.min(4, Math.floor(maxAyahsPerClip)));
    for (const run of runs) {
      const best = new Array<{ cost: number; groups: BulkDetectedAyah[][] } | undefined>(run.length + 1);
      best[run.length] = { cost: 0, groups: [] };
      for (let cursor = run.length - 1; cursor >= 0; cursor--) {
        const firstDuration = run[cursor].end - run[cursor].start;
        const finalEnd = firstDuration >= target * 1.15
          ? cursor
          : Math.min(run.length - 1, cursor + maxAyahs - 1);
        for (let endIndex = cursor; endIndex <= finalEnd; endIndex++) {
          const tail = best[endIndex + 1];
          if (!tail) continue;
          const duration = run[endIndex].end - run[cursor].start;
          const cost = Math.abs(duration - target) + tail.cost;
          const current = best[cursor];
          if (!current || cost < current.cost || (cost === current.cost && tail.groups.length + 1 < current.groups.length)) {
            best[cursor] = { cost, groups: [run.slice(cursor, endIndex + 1), ...tail.groups] };
          }
        }
      }
      grouped.push(...(best[0]?.groups ?? [run]));
    }
  }

  const chosen = grouped.length <= requestedCount
    ? grouped
    : Array.from({ length: requestedCount }, (_, index) => {
        const position = requestedCount === 1
          ? Math.floor((grouped.length - 1) / 2)
          : Math.round((index * (grouped.length - 1)) / (requestedCount - 1));
        return grouped[position];
      });

  return chosen.map((timings, index) => {
      const start = timings[0].start;
      const end = timings.at(-1)!.end;
      const order = index + 1;
      return {
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
      };
    });
}
