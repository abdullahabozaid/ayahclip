// Characterization tests for the timing/split logic that decides which words
// are on screen at a given moment — regressions here silently show the wrong
// part of a verse.
import { describe, it, expect } from "vitest";
import {
  verseTextAt,
  verseSegments,
  effectiveAudioBounds,
  proportionalTimings,
  type VerseTiming,
} from "@/lib/audio-import";
import {
  buildPartsFromBoundaries,
  findCurrentSegmentIndex,
  type VerseWord,
  type TextSegment,
} from "@/lib/playback-engine";

const TEXT = "w1 w2 w3 w4 w5 w6"; // 6 words

describe("verseTextAt", () => {
  const base: VerseTiming = { verseNumber: 1, start: 10, end: 22 };

  it("returns the full text when there are no splits", () => {
    expect(verseTextAt(base, TEXT, 15)).toBe(TEXT);
  });

  it("uses fixed word boundaries when splitWords is present", () => {
    const tm: VerseTiming = { ...base, splits: [16], splitWords: [3], splitWordTotal: 6 };
    expect(verseTextAt(tm, TEXT, 12)).toBe("w1 w2 w3"); // before the split
    expect(verseTextAt(tm, TEXT, 16)).toBe("w4 w5 w6"); // at/after the split
  });

  it("scales recorded boundaries when the word count changed", () => {
    // Recorded against 12 words, applied to 6 → boundary 6 scales to 3.
    const tm: VerseTiming = { ...base, splits: [16], splitWords: [6], splitWordTotal: 12 };
    expect(verseTextAt(tm, TEXT, 12)).toBe("w1 w2 w3");
  });

  it("respects wordRange when slicing split parts", () => {
    const tm: VerseTiming = {
      ...base,
      splits: [16],
      splitWords: [3],
      splitWordTotal: 6,
      wordRange: { from: 1, to: 4 }, // keep w2..w5
    };
    expect(verseTextAt(tm, TEXT, 12)).toBe("w2 w3");
    expect(verseTextAt(tm, TEXT, 16)).toBe("w4 w5");
  });

  it("falls back to time-proportional words without splitWords", () => {
    const tm: VerseTiming = { ...base, splits: [16] }; // split at half of 12s
    expect(verseTextAt(tm, TEXT, 12)).toBe("w1 w2 w3");
    expect(verseTextAt(tm, TEXT, 17)).toBe("w4 w5 w6");
  });
});

describe("verseSegments", () => {
  it("returns one segment when there are no splits", () => {
    expect(verseSegments({ verseNumber: 1, start: 0, end: 10 }, TEXT)).toEqual([TEXT]);
  });

  it("lists every part for fixed word boundaries", () => {
    const tm: VerseTiming = {
      verseNumber: 1,
      start: 0,
      end: 12,
      splits: [4, 8],
      splitWords: [2, 4],
      splitWordTotal: 6,
    };
    expect(verseSegments(tm, TEXT)).toEqual(["w1 w2", "w3 w4", "w5 w6"]);
  });
});

describe("effectiveAudioBounds", () => {
  it("passes through when no wordRange", () => {
    expect(effectiveAudioBounds({ verseNumber: 1, start: 5, end: 15 }, 10)).toEqual([5, 15]);
  });

  it("maps the word range proportionally onto the time span", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 10, end: 20, wordRange: { from: 5, to: 9 } };
    expect(effectiveAudioBounds(tm, 10)).toEqual([15, 20]);
  });
});

describe("proportionalTimings", () => {
  it("divides the span by text weight and stays monotonic", () => {
    const t = proportionalTimings([1, 2, 3], [1, 1, 2], 0, 8);
    expect(t.map((x) => x.verseNumber)).toEqual([1, 2, 3]);
    expect(t[0].start).toBe(0);
    expect(t[2].end).toBe(8);
    for (const x of t) expect(x.end).toBeGreaterThan(x.start);
    expect(t[0].end).toBeCloseTo(2, 5);
    expect(t[1].end).toBeCloseTo(4, 5);
  });

  it("never collapses a tiny verse to zero duration", () => {
    const t = proportionalTimings([1, 2], [0.0001, 100], 0, 10);
    expect(t[0].end - t[0].start).toBeGreaterThan(0);
  });
});

function word(i: number, startMs: number | null, endMs: number | null): VerseWord {
  return { position: i, text: `w${i}`, translation: `t${i}`, startMs, endMs };
}

describe("buildPartsFromBoundaries", () => {
  const words = [1, 2, 3, 4].map((i) => word(i, i * 1000, i * 1000 + 800));

  it("returns one whole-verse segment with no boundaries", () => {
    const segs = buildPartsFromBoundaries(words, []);
    expect(segs).toHaveLength(1);
    expect(segs[0].arabicText).toBe("w1 w2 w3 w4");
    expect(segs[0].startMs).toBe(1000);
    expect(segs[0].endMs).toBe(4800);
  });

  it("splits at the boundary and times each part from real word timestamps", () => {
    const segs = buildPartsFromBoundaries(words, [2]);
    expect(segs.map((s) => s.arabicText)).toEqual(["w1 w2", "w3 w4"]);
    expect(segs[0].endMs).toBe(2800);
    expect(segs[1].startMs).toBe(3000);
  });

  it("ignores out-of-range or duplicate boundaries", () => {
    const segs = buildPartsFromBoundaries(words, [0, 2, 4, 99]);
    expect(segs.map((s) => s.arabicText)).toEqual(["w1 w2", "w3 w4"]);
  });

  it("slices a verse-level translation proportionally", () => {
    const segs = buildPartsFromBoundaries(words, [2], "a b c d");
    expect(segs.map((s) => s.translationText)).toEqual(["a b", "c d"]);
  });
});

describe("findCurrentSegmentIndex", () => {
  const segs: TextSegment[] = [
    { arabicText: "a", translationText: "", startMs: 0, endMs: 1000 },
    { arabicText: "b", translationText: "", startMs: 1000, endMs: 2000 },
    { arabicText: "c", translationText: "", startMs: 2000, endMs: 3000 },
  ];

  it("returns the latest segment whose start has passed", () => {
    expect(findCurrentSegmentIndex(segs, 0)).toBe(0);
    expect(findCurrentSegmentIndex(segs, 1500)).toBe(1);
    expect(findCurrentSegmentIndex(segs, 99999)).toBe(2);
  });

  it("clamps to 0 before the first segment", () => {
    expect(findCurrentSegmentIndex(segs, -5)).toBe(0);
  });
});
