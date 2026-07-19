import { describe, expect, it } from "vitest";
import {
  buildVerseCompleteCandidates,
  mergeBulkAyahs,
  type BulkDetectedAyah,
} from "../bulk-clips";

const ayah = (verseNumber: number, start: number, end: number, extra: Partial<BulkDetectedAyah> = {}): BulkDetectedAyah => ({
  surah: 2,
  verseNumber,
  start,
  end,
  confidence: "high",
  sourceWindow: 0,
  ...extra,
});

describe("buildVerseCompleteCandidates", () => {
  it("only uses complete ayah boundaries, including a long ayah", () => {
    const input = [ayah(1, 0, 12), ayah(2, 12, 76), ayah(3, 76, 91), ayah(4, 91, 108)];
    const result = buildVerseCompleteCandidates({ ayahs: input, requestedCount: 3, templateId: "clean-ink", idealClipSeconds: 45 });
    expect(result).toHaveLength(2);
    expect(result.flatMap((candidate) => candidate.timings.map((timing) => timing.verseNumber))).toEqual([1, 2, 3, 4]);
    const longAyahCandidate = result.find((candidate) => candidate.timings.some((timing) => timing.verseNumber === 2));
    expect(longAyahCandidate?.end).toBe(76);
    for (const candidate of result) {
      expect(candidate.start).toBe(candidate.timings[0].start);
      expect(candidate.end).toBe(candidate.timings.at(-1)?.end);
    }
  });

  it("groups one to four complete ayahs around the creator's ideal duration", () => {
    const input = Array.from({ length: 9 }, (_, index) => ayah(index + 1, index * 10, (index + 1) * 10));
    const result = buildVerseCompleteCandidates({
      ayahs: input,
      requestedCount: 15,
      templateId: "clean-ink",
      idealClipSeconds: 35,
    });
    expect(result.map((candidate) => candidate.timings.length)).toEqual([3, 3, 3]);
    expect(result.map((candidate) => candidate.duration)).toEqual([30, 30, 30]);
  });

  it.each([2, 3] as const)("creates exactly %i ayahs per clip when requested", (ayahsPerClip) => {
    const input = Array.from({ length: 7 }, (_, index) => ayah(index + 1, index * 10, (index + 1) * 10));
    const result = buildVerseCompleteCandidates({
      ayahs: input,
      requestedCount: 15,
      templateId: "clean-ink",
      groupingMode: "exact",
      ayahsPerClip,
    });
    expect(result.every((candidate) => candidate.timings.length === ayahsPerClip)).toBe(true);
    expect(result).toHaveLength(Math.floor(input.length / ayahsPerClip));
  });

  it("keeps a complete detected surah passage together when requested", () => {
    const input = Array.from({ length: 7 }, (_, index) => ayah(index + 1, index * 8, (index + 1) * 8, { surah: 1 }));
    const result = buildVerseCompleteCandidates({
      ayahs: input,
      requestedCount: 15,
      templateId: "clean-ink",
      groupingMode: "whole-passage",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ surah: 1, ayahStart: 1, ayahEnd: 7 });
  });

  it("never promotes a window-edge partial ayah into an upload-ready draft", () => {
    const result = buildVerseCompleteCandidates({
      ayahs: [
        ayah(1, 0, 8, { wordRange: { from: 3, to: 7 }, alignedWordStarts: Array.from({ length: 8 }, (_, i) => i) }),
        ayah(2, 8, 18),
        ayah(3, 18, 28),
      ],
      requestedCount: 15,
      templateId: "clean-ink",
      groupingMode: "exact",
      ayahsPerClip: 2,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ ayahStart: 2, ayahEnd: 3 });
  });

  it("keeps a long single ayah whole even when it exceeds the ideal", () => {
    const result = buildVerseCompleteCandidates({
      ayahs: [ayah(1, 0, 76), ayah(2, 76, 88)],
      requestedCount: 15,
      templateId: "clean-ink",
      idealClipSeconds: 30,
    });
    expect(result[0]).toMatchObject({ ayahStart: 1, ayahEnd: 1, duration: 76 });
  });

  it("never combines different surahs or crosses an unrecognised gap", () => {
    const input = [ayah(1, 0, 10), ayah(2, 10, 20), ayah(1, 50, 60, { surah: 3 }), ayah(2, 65, 75, { surah: 3 })];
    const result = buildVerseCompleteCandidates({ ayahs: input, requestedCount: 2, templateId: "clean-ink" });
    expect(result).toHaveLength(2);
    expect(result.map((candidate) => candidate.surah)).toEqual([2, 3]);
  });

  it("deduplicates overlapping window results using confidence", () => {
    const result = mergeBulkAyahs([
      ayah(5, 20, 30, { confidence: "medium", sourceWindow: 0 }),
      ayah(5, 21, 31, { confidence: "high", sourceWindow: 1 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ start: 21, end: 31, confidence: "high", sourceWindow: 1 });
  });

  it("prefers a complete overlapping ayah over a longer partial edge", () => {
    const result = mergeBulkAyahs([
      ayah(5, 20, 34, { confidence: "high", wordRange: { from: 4, to: 9 }, alignedWordStarts: Array.from({ length: 10 }, (_, i) => i) }),
      ayah(5, 21, 31, { confidence: "medium" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].wordRange).toBeUndefined();
    expect(result[0]).toMatchObject({ start: 21, end: 31 });
  });
});
