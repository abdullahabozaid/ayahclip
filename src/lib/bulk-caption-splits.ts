import type { VerseTiming } from "./audio-import";

const WAQF_MARK = /[ۖۗۚۛۜۙ]/u;

export interface CaptionSplitResult {
  timing: VerseTiming;
  segmentCount: number;
  aligned: boolean;
}

/**
 * Divide a long ayah into caption-only parts. Arabic wrapping determines each
 * text boundary; model-aligned word onsets determine when the screen changes.
 * The recitation and the ayah's outer audio boundaries are never changed.
 */
export function buildLineLimitedCaptionSplits({
  timing,
  arabicWords,
  maxLines,
  countLines,
}: {
  timing: VerseTiming;
  arabicWords: readonly string[];
  maxLines: number;
  countLines: (words: readonly string[], from: number, to: number) => number;
}): CaptionSplitResult {
  if (arabicWords.length < 2 || countLines(arabicWords, 0, arabicWords.length) <= maxLines) {
    return { timing: { ...timing }, segmentCount: 1, aligned: false };
  }
  const alignedStarts = timing.alignedWordStarts;
  if (!alignedStarts || Math.abs(alignedStarts.length - arabicWords.length) > 1) {
    return { timing: { ...timing }, segmentCount: 1, aligned: false };
  }

  const boundaries: number[] = [];
  let cursor = 0;
  while (cursor < arabicWords.length) {
    let end = cursor + 1;
    while (
      end < arabicWords.length
      && countLines(arabicWords, cursor, end + 1) <= maxLines
    ) {
      end += 1;
    }
    if (end >= arabicWords.length) break;

    const earliestNaturalCut = cursor + Math.max(1, Math.floor((end - cursor) * 0.55));
    for (let candidate = end; candidate >= earliestNaturalCut; candidate--) {
      if (WAQF_MARK.test(arabicWords[candidate - 1])) {
        end = candidate;
        break;
      }
    }
    if (arabicWords.length - end === 1 && end - cursor > 1) end -= 1;
    if (end <= cursor) return { timing: { ...timing }, segmentCount: 1, aligned: false };
    boundaries.push(end);
    cursor = end;
  }
  if (boundaries.length === 0) return { timing: { ...timing }, segmentCount: 1, aligned: false };

  const mapBoundaryToAlignedIndex = (boundary: number) => Math.max(
    1,
    Math.min(alignedStarts.length - 1, Math.round((boundary / arabicWords.length) * alignedStarts.length)),
  );
  const splits = boundaries.map((boundary) => alignedStarts[mapBoundaryToAlignedIndex(boundary)]);
  if (splits.some((time, index) =>
    !Number.isFinite(time)
    || time <= timing.start + 0.08
    || time >= timing.end - 0.08
    || (index > 0 && time <= splits[index - 1] + 0.08)
  )) {
    return { timing: { ...timing }, segmentCount: 1, aligned: false };
  }

  const totalCharacters = Math.max(1, arabicWords.join(" ").length);
  const splitCharFractions = boundaries.map((boundary) =>
    arabicWords.slice(0, boundary).join(" ").length / totalCharacters,
  );
  return {
    timing: {
      ...timing,
      splits,
      splitWords: boundaries,
      splitWordTotal: arabicWords.length,
      splitCharFractions,
    },
    segmentCount: boundaries.length + 1,
    aligned: true,
  };
}
