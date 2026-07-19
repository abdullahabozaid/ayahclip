import { describe, expect, it } from "vitest";
import { buildLineLimitedCaptionSplits } from "../bulk-caption-splits";

const words = ["one", "two", "three", "four", "five", "six", "seven", "eight"];
const countEveryThree = (_words: readonly string[], from: number, to: number) => Math.ceil((to - from) / 3);

describe("line-limited bulk captions", () => {
  it("uses Arabic line capacity for text boundaries and aligned word onsets for time", () => {
    const result = buildLineLimitedCaptionSplits({
      timing: {
        verseNumber: 1,
        start: 10,
        end: 26,
        alignedWordStarts: [10, 12, 14, 16, 18, 20, 22, 24],
      },
      arabicWords: words,
      maxLines: 1,
      countLines: countEveryThree,
    });
    expect(result.aligned).toBe(true);
    expect(result.segmentCount).toBe(3);
    expect(result.timing.splitWords).toEqual([3, 6]);
    expect(result.timing.splits).toEqual([16, 22]);
    expect(result.timing.start).toBe(10);
    expect(result.timing.end).toBe(26);
  });

  it("does not guess caption times when model word alignment is unavailable", () => {
    const result = buildLineLimitedCaptionSplits({
      timing: { verseNumber: 1, start: 0, end: 20 },
      arabicWords: words,
      maxLines: 1,
      countLines: countEveryThree,
    });
    expect(result.aligned).toBe(false);
    expect(result.timing.splits).toBeUndefined();
  });
});
