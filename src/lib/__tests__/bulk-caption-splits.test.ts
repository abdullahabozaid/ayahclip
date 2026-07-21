import { describe, expect, it } from "vitest";
import { buildLineLimitedCaptionSplits } from "../bulk-caption-splits";
import { splitWords, isMarkOnlyToken } from "../canvas-utils";
import { verseTextAt } from "../audio-import";

const words = ["one", "two", "three", "four", "five", "six", "seven", "eight"];
const countEveryThree = (_words: readonly string[], from: number, to: number) => Math.ceil((to - from) / 3);
const countEveryTwo = (_words: readonly string[], from: number, to: number) => Math.ceil((to - from) / 2);

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

  it("stores split boundaries in the same token space verseTextAt slices with (waqf marks)", () => {
    // A standalone waqf-mark token: splitWords() glues it onto the preceding
    // word (fewer wrap units than raw whitespace tokens), but every consumer of
    // splitWords/splitWordTotal (verseTextAt, the editors, export) indexes
    // against text_uthmani.split(/\s+/). If the boundaries are stored in the
    // glued space, verseTextAt mistakes the Arabic for a translation and shifts
    // the on-screen words to the WRONG Quranic words. Regression guard.
    const textUthmani = "w1 w2 ۖ w3 w4 w5 w6";
    const arabicWords = splitWords(textUthmani); // ["w1", "w2 ۖ", "w3", "w4", "w5", "w6"]
    expect(arabicWords).toHaveLength(6);

    const result = buildLineLimitedCaptionSplits({
      timing: {
        verseNumber: 1,
        start: 0,
        end: 12,
        alignedWordStarts: [0, 2, 4, 6, 8, 10],
      },
      arabicWords,
      maxLines: 1,
      countLines: countEveryTwo,
    });

    expect(result.aligned).toBe(true);
    // Boundaries + total are in RAW text_uthmani token space (7 tokens), not the
    // 6 glued wrap units.
    expect(result.timing.splitWordTotal).toBe(7);
    expect(result.timing.splitWords).toEqual([3, 5]);

    // End-to-end: what verseTextAt draws for each part must be the correct words.
    const tm = result.timing;
    const splits = tm.splits ?? [];
    const partAt = (t: number) => verseTextAt(tm, textUthmani, t);
    expect(partAt(splits[0] - 0.01)).toBe("w1 w2 ۖ");
    expect(partAt(splits[0] + 0.01)).toBe("w3 w4");
    expect(partAt(splits[1] + 0.01)).toBe("w5 w6");
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

describe("waqf-mark tokens", () => {
  it("identifies a standalone waqf mark so a caption part never starts with one", () => {
    const tokens = "w1 w2 ۖ w3".split(/\s+/).filter(Boolean);
    expect(tokens).toHaveLength(4);
    expect(isMarkOnlyToken(tokens[2])).toBe(true);
    expect(isMarkOnlyToken(tokens[1])).toBe(false);
    expect(isMarkOnlyToken(tokens[3])).toBe(false);
  });
});
