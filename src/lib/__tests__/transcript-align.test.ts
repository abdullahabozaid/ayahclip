import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/verse-match", () => ({
  getVersesText: (surah: number) => surah === 2
    ? {
        text: "aa bb cc dd",
        ranges: [
          { ayah: 1, start: 0, end: 5 },
          { ayah: 2, start: 6, end: 11 },
        ],
      }
    : {
        text: "abc def",
        ranges: [
          { ayah: 1, start: 0, end: 3 },
          { ayah: 2, start: 4, end: 7 },
        ],
      },
  normalizeArabicTimed: (text: string, times: number[]) => ({ text, times }),
}));

import { alignTranscriptVerses } from "@/lib/transcript-align";

describe("alignTranscriptVerses", () => {
  it("maps exact transcript character times onto verse starts", () => {
    const result = alignTranscriptVerses({
      text: "abc def",
      charTimes: [0, 1, 2, 3, 4, 5, 6],
      surah: 1,
      verseNumbers: [1, 2],
      audioDuration: 8,
    });

    expect(result?.similarity).toBe(1);
    expect(result?.timings.map((timing) => timing.start)).toEqual([0, 4]);
    expect(result?.recitedWordRangesByVerse).toEqual([{ from: 0, to: 0 }, { from: 0, to: 0 }]);
  });

  it("aligns a clip that starts and ends inside ayahs without inventing the missing words", () => {
    const result = alignTranscriptVerses({
      text: "bc de",
      charTimes: [0, 1, 2, 3, 4],
      surah: 1,
      verseNumbers: [1, 2],
      audioDuration: 5,
    });

    expect(result?.similarity).toBe(1);
    expect(result?.timings.map((timing) => timing.start)).toEqual([0, 3]);
    expect(result?.recitedWordRangesByVerse).toEqual([{ from: 0, to: 0 }, { from: 0, to: 0 }]);
  });

  it("reports only the recited word range at partial ayah edges", () => {
    const result = alignTranscriptVerses({
      text: "bb cc",
      charTimes: [0, 1, 2, 3, 4],
      surah: 2,
      verseNumbers: [1, 2],
      audioDuration: 5,
    });

    expect(result?.similarity).toBe(1);
    expect(result?.recitedWordRangesByVerse).toEqual([
      { from: 1, to: 1 },
      { from: 0, to: 0 },
    ]);
  });

  it("rejects transcript text and timestamp arrays that cannot correspond", () => {
    expect(alignTranscriptVerses({
      text: "abc",
      charTimes: [0, 1],
      surah: 1,
      verseNumbers: [1, 2],
      audioDuration: 8,
    })).toBeNull();
  });
});
