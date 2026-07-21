import type { VerseTiming } from "./audio-import";
import type { StyleSnapshot } from "./style-snapshot";

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
  // "low" = recovered from an ambiguous window; a reviewable draft, never
  // auto-approved. "selected" = a user-chosen range.
  confidence: "high" | "medium" | "low" | "selected";
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
  /**
   * This clip's own look, captured when the creator edits it in Studio.
   * Re-applied LAST when the clip is rebuilt (after the template and the
   * batch-wide styleOverride) so an individual clip's edits survive leaving
   * and reopening the collection. Media is included only when it is durable
   * (preset/stock URLs — blob: URLs cannot outlive the session).
   */
  styleOverride?: StyleSnapshot | null;
}

/**
 * A contiguous run of clips from one surah, for the multi-surah segmentation
 * overview. A 30-minute recitation that moves through several surahs becomes
 * one section per surah (Al-Fatihah, then Al-Baqarah, …), each spanning its
 * clips' combined ayah range and source-time span.
 */
export interface BulkSurahSection {
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  clipCount: number;
  start: number;
  end: number;
  candidateIds: string[];
  firstCandidateId: string;
}

/**
 * Group time-ordered candidates into per-surah sections. Candidates never cross
 * a surah (see buildVerseCompleteCandidates), and a surah's ayahs are recited
 * contiguously, so consecutive same-surah candidates form one section. A surah
 * that recurs after a different surah (e.g. a reader returns to it) yields a
 * separate later section, which is the honest reflection of the recitation.
 */
export function groupCandidatesBySurah(candidates: readonly BulkClipCandidate[]): BulkSurahSection[] {
  const sections: BulkSurahSection[] = [];
  for (const candidate of candidates) {
    const current = sections.at(-1);
    if (current && current.surah === candidate.surah) {
      current.ayahStart = Math.min(current.ayahStart, candidate.ayahStart);
      current.ayahEnd = Math.max(current.ayahEnd, candidate.ayahEnd);
      current.clipCount += 1;
      current.start = Math.min(current.start, candidate.start);
      current.end = Math.max(current.end, candidate.end);
      current.candidateIds.push(candidate.id);
    } else {
      sections.push({
        surah: candidate.surah,
        ayahStart: candidate.ayahStart,
        ayahEnd: candidate.ayahEnd,
        clipCount: 1,
        start: candidate.start,
        end: candidate.end,
        candidateIds: [candidate.id],
        firstCandidateId: candidate.id,
      });
    }
  }
  return sections;
}

const confidenceRank = { low: -1, selected: 0, medium: 1, high: 2 } as const;

/** A clip is auto-approved only when every ayah in it was a confident match.
 * Anything recovered from an ambiguous window ("low") stays unapproved so the
 * creator verifies the range before it renders. */
function isConfidentCandidate(timings: readonly BulkDetectedAyah[]): boolean {
  return timings.every((timing) => timing.confidence === "high" || timing.confidence === "medium");
}

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

/**
 * Cross-window confidence accrual (plan 008 item B). A single 4-min window can
 * mark an ayah "low" because accumulated ASR error dropped that window's score,
 * yet the same ayah may sit inside a longer continuous recitation whose
 * neighbours were recognised confidently. When a "low" ayah is bracketed on
 * BOTH sides by high/medium same-surah ayahs at exactly verseNumber∓1 with only
 * a small time gap, its verse number is *deductively pinned* — verse N is the
 * only ayah that can fall chronologically between a confident N-1 and a confident
 * N+1 of the same surah, and the Arabic shown is already verified corpus text
 * for N. Promoting such an interior ayah to "medium" lets a continuous passage
 * auto-approve as one clip instead of being withheld for a single soft window.
 *
 * Deliberately conservative: a "low" ayah with only one confident neighbour, or
 * that starts/ends a run, or whose neighbours are themselves unverified, is NEVER
 * promoted and stays a reviewable draft. This never invents a range; it only
 * resolves the attribution the surrounding confident sequence already fixes.
 */
export function corroborateBulkAyahs(
  merged: readonly BulkDetectedAyah[],
  maxGapSeconds = 3,
): BulkDetectedAyah[] {
  const isConfident = (ayah: BulkDetectedAyah | undefined): ayah is BulkDetectedAyah =>
    Boolean(ayah) && confidenceRank[ayah!.confidence] >= confidenceRank.medium;
  return merged.map((ayah, index) => {
    if (ayah.confidence !== "low") return ayah;
    const prev = merged[index - 1];
    const next = merged[index + 1];
    const pinned = isConfident(prev)
      && isConfident(next)
      && prev.surah === ayah.surah
      && next.surah === ayah.surah
      && prev.verseNumber === ayah.verseNumber - 1
      && next.verseNumber === ayah.verseNumber + 1
      && ayah.start - prev.end <= maxGapSeconds
      && next.start - ayah.end <= maxGapSeconds;
    return pinned ? { ...ayah, confidence: "medium" as const } : ayah;
  });
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
  // Merge overlapping-window duplicates, keep only complete ayahs, then let a
  // continuous confident sequence corroborate an interior "low" window (item B).
  const merged = corroborateBulkAyahs(
    mergeBulkAyahs(ayahs).filter(isCompleteDetectedAyah),
    maxGapSeconds,
  );
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
        approved: isConfidentCandidate(timings),
      };
    });
}

const CONFIDENCE_SCORE: Record<BulkDetectedAyah["confidence"], number> = {
  high: 1,
  selected: 0.9,
  medium: 0.75,
  low: 0.4,
};

export interface BulkClipScoreOptions {
  /** Sweet-spot duration in seconds; the score peaks here. */
  idealSeconds?: number;
  /** Soft band edges; clips outside are penalised but not discarded. */
  minSeconds?: number;
  maxSeconds?: number;
}

/**
 * A 0–1 quality score for review-grid ranking (plan 008 item F, Opus-Clip style).
 * Combines how much the creator should trust the clip (confidence) with how
 * shareable its length is (duration fit to the muted-autoplay sweet spot). It is
 * purely advisory ordering — it never approves a clip or changes its range, so it
 * is outside the Quran-integrity gate. Higher is better.
 */
export function scoreBulkCandidate(
  candidate: Pick<BulkClipCandidate, "confidence" | "duration">,
  { idealSeconds = 40, minSeconds = 15, maxSeconds = 90 }: BulkClipScoreOptions = {},
): number {
  const confidenceScore = CONFIDENCE_SCORE[candidate.confidence] ?? 0.4;
  const duration = candidate.duration;
  let durationScore = 0;
  if (duration > 0) {
    const spread = Math.max(1, (maxSeconds - minSeconds) / 2);
    const z = (duration - idealSeconds) / spread;
    durationScore = Math.exp(-0.5 * z * z);
    if (duration < minSeconds || duration > maxSeconds) durationScore *= 0.5;
  }
  return Number((0.55 * confidenceScore + 0.45 * durationScore).toFixed(4));
}

/**
 * Order candidates best-first for a skim-and-approve review grid. Stable: equal
 * scores keep their original chronological order (by `order`). Returns a new
 * array; inputs are untouched.
 */
export function rankBulkCandidates(
  candidates: readonly BulkClipCandidate[],
  options?: BulkClipScoreOptions,
): BulkClipCandidate[] {
  return [...candidates]
    .map((candidate) => ({ candidate, score: scoreBulkCandidate(candidate, options) }))
    .sort((a, b) => b.score - a.score || a.candidate.order - b.candidate.order)
    .map((entry) => entry.candidate);
}
