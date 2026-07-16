import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/verse-match", () => ({
  getVersesText: () => ({
    text: "abc def",
    ranges: [
      { ayah: 1, start: 0, end: 3 },
      { ayah: 2, start: 4, end: 7 },
    ],
  }),
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
