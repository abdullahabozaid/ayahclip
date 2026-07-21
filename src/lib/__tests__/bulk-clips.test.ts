import { describe, expect, it } from "vitest";
import {
  buildVerseCompleteCandidates,
  corroborateBulkAyahs,
  groupCandidatesBySurah,
  mergeBulkAyahs,
  rankBulkCandidates,
  scoreBulkCandidate,
  type BulkClipCandidate,
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

describe("corroborateBulkAyahs (item B: cross-window confidence accrual)", () => {
  it("promotes a low ayah pinned between two confident consecutive same-surah neighbours", () => {
    const input = [ayah(40, 0, 10), ayah(41, 10, 20, { confidence: "low" }), ayah(42, 20, 30)];
    const result = corroborateBulkAyahs(input);
    expect(result[1].confidence).toBe("medium");
    expect(result.map((a) => a.confidence)).toEqual(["high", "medium", "high"]);
  });

  it("does NOT promote a low ayah at the edge of a run (only one confident neighbour)", () => {
    const input = [ayah(41, 10, 20, { confidence: "low" }), ayah(42, 20, 30)];
    expect(corroborateBulkAyahs(input)[0].confidence).toBe("low");
  });

  it("does NOT promote when a neighbour is itself unverified (low)", () => {
    const input = [ayah(40, 0, 10, { confidence: "low" }), ayah(41, 10, 20, { confidence: "low" }), ayah(42, 20, 30)];
    expect(corroborateBulkAyahs(input)[1].confidence).toBe("low");
  });

  it("does NOT promote when verse numbers are not exactly consecutive", () => {
    const input = [ayah(40, 0, 10), ayah(42, 10, 20, { confidence: "low" }), ayah(44, 20, 30)];
    expect(corroborateBulkAyahs(input)[1].confidence).toBe("low");
  });

  it("does NOT promote across a different surah neighbour", () => {
    const input = [ayah(40, 0, 10, { surah: 3 }), ayah(41, 10, 20, { confidence: "low" }), ayah(42, 20, 30)];
    expect(corroborateBulkAyahs(input)[1].confidence).toBe("low");
  });

  it("does NOT promote when the time gap to a neighbour is too large", () => {
    const input = [ayah(40, 0, 10), ayah(41, 20, 30, { confidence: "low" }), ayah(42, 30, 40)];
    expect(corroborateBulkAyahs(input, 3)[1].confidence).toBe("low");
  });

  it("lets a corroborated passage auto-approve as one clip in buildVerseCompleteCandidates", () => {
    const input = [ayah(40, 0, 10), ayah(41, 10, 20, { confidence: "low" }), ayah(42, 20, 30)];
    const result = buildVerseCompleteCandidates({
      ayahs: input,
      requestedCount: 1,
      templateId: "clean-ink",
      groupingMode: "whole-passage",
    });
    expect(result).toHaveLength(1);
    expect(result[0].approved).toBe(true);
    expect(result[0].ayahStart).toBe(40);
    expect(result[0].ayahEnd).toBe(42);
  });
});

describe("scoreBulkCandidate / rankBulkCandidates (item F: review grid)", () => {
  const candidate = (over: Partial<BulkClipCandidate>): BulkClipCandidate => ({
    id: "c", order: 1, surah: 2, ayahStart: 1, ayahEnd: 2,
    start: 0, end: 40, duration: 40, timings: [], confidence: "high",
    templateId: "clean-ink", approved: true, ...over,
  });

  it("scores a confident, sweet-spot-length clip highest and a low, off-length clip lowest", () => {
    const great = scoreBulkCandidate(candidate({ confidence: "high", duration: 40 }));
    const weak = scoreBulkCandidate(candidate({ confidence: "low", duration: 4 }));
    expect(great).toBeGreaterThan(weak);
    expect(great).toBeLessThanOrEqual(1);
    expect(weak).toBeGreaterThanOrEqual(0);
  });

  it("prefers a duration nearer the ideal when confidence is equal", () => {
    const near = scoreBulkCandidate(candidate({ duration: 40 }));
    const far = scoreBulkCandidate(candidate({ duration: 120 }));
    expect(near).toBeGreaterThan(far);
  });

  it("ranks best-first and keeps chronological order for ties", () => {
    const a = candidate({ id: "a", order: 1, confidence: "high", duration: 40 });
    const b = candidate({ id: "b", order: 2, confidence: "low", duration: 5 });
    const c = candidate({ id: "c", order: 3, confidence: "high", duration: 40 });
    const ranked = rankBulkCandidates([b, a, c]);
    expect(ranked.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the input array", () => {
    const list = [candidate({ id: "a", order: 2, confidence: "low", duration: 5 }), candidate({ id: "b", order: 1 })];
    const snapshot = list.map((c) => c.id);
    rankBulkCandidates(list);
    expect(list.map((c) => c.id)).toEqual(snapshot);
  });
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

describe("review drafts from ambiguous windows", () => {
  const lowAyah = (verseNumber: number, start: number, end: number): BulkDetectedAyah =>
    ayah(verseNumber, start, end, { confidence: "low" });

  it("builds low-confidence clips UNAPPROVED so the creator verifies the range", () => {
    const result = buildVerseCompleteCandidates({
      ayahs: [lowAyah(1, 0, 12), lowAyah(2, 12, 30)],
      requestedCount: 5,
      templateId: "clean-ink",
      groupingMode: "whole-passage",
    });
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe("low");
    expect(result[0].approved).toBe(false);
  });

  it("keeps confident clips auto-approved", () => {
    const result = buildVerseCompleteCandidates({
      ayahs: [ayah(1, 0, 12), ayah(2, 12, 30)],
      requestedCount: 5,
      templateId: "clean-ink",
      groupingMode: "whole-passage",
    });
    expect(result[0].confidence).toBe("high");
    expect(result[0].approved).toBe(true);
  });

  it("a mixed clip stays unapproved (weakest confidence wins)", () => {
    const result = buildVerseCompleteCandidates({
      ayahs: [ayah(1, 0, 12), lowAyah(2, 12, 30)],
      requestedCount: 5,
      templateId: "clean-ink",
      groupingMode: "whole-passage",
    });
    expect(result[0].confidence).toBe("low");
    expect(result[0].approved).toBe(false);
  });

  it("a confident match overrides an overlapping low-confidence one on merge", () => {
    const merged = mergeBulkAyahs([
      lowAyah(5, 20, 30),
      ayah(5, 21, 31, { confidence: "high", sourceWindow: 1 }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ confidence: "high", start: 21, end: 31 });
  });
});

describe("groupCandidatesBySurah", () => {
  const clip = (id: string, surah: number, ayahStart: number, ayahEnd: number, start: number, end: number): BulkClipCandidate => ({
    id, order: Number(id), surah, ayahStart, ayahEnd, start, end, duration: end - start,
    timings: [], confidence: "high", templateId: "clean-ink", approved: true,
  });

  it("segments a multi-surah recitation into one section per surah", () => {
    const sections = groupCandidatesBySurah([
      clip("1", 1, 1, 4, 0, 40),
      clip("2", 1, 5, 7, 40, 70),
      clip("3", 2, 1, 5, 70, 140),
      clip("4", 2, 6, 12, 140, 210),
      clip("5", 112, 1, 4, 210, 230),
    ]);
    expect(sections.map((s) => s.surah)).toEqual([1, 2, 112]);
    expect(sections[0]).toMatchObject({ surah: 1, ayahStart: 1, ayahEnd: 7, clipCount: 2, start: 0, end: 70, firstCandidateId: "1" });
    expect(sections[1]).toMatchObject({ surah: 2, ayahStart: 1, ayahEnd: 12, clipCount: 2, firstCandidateId: "3" });
    expect(sections[2]).toMatchObject({ surah: 112, clipCount: 1, firstCandidateId: "5" });
  });

  it("keeps a surah that recurs after another as its own later section", () => {
    const sections = groupCandidatesBySurah([
      clip("1", 1, 1, 7, 0, 60),
      clip("2", 2, 1, 5, 60, 120),
      clip("3", 1, 1, 7, 120, 180),
    ]);
    expect(sections.map((s) => s.surah)).toEqual([1, 2, 1]);
    expect(sections[2].firstCandidateId).toBe("3");
  });

  it("returns an empty list for no candidates", () => {
    expect(groupCandidatesBySurah([])).toEqual([]);
  });
});
