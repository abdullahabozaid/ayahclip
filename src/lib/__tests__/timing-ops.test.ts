import { describe, it, expect } from "vitest";
import {
  applyAlignedTimingsToRows,
  normalizeTimings,
  verseNumbersForAlignment,
} from "../timing-ops";
import type { VerseTiming } from "../audio-import";

const t = (over: Partial<VerseTiming>): VerseTiming => ({
  verseNumber: 1,
  start: 0,
  end: 10,
  ...over,
});

describe("normalizeTimings", () => {
  it("leaves a clean timing untouched", () => {
    const input = [t({ start: 0, end: 5, splits: [2, 3] })];
    expect(normalizeTimings(input)).toEqual(input);
  });

  it("clamps a split that escaped past the verse end into bounds", () => {
    const [out] = normalizeTimings([t({ start: 0, end: 5, splits: [3, 7] })]);
    expect(out.splits![0]).toBe(3);
    expect(out.splits![1]).toBeLessThanOrEqual(5);
    expect(out.splits![1]).toBeGreaterThan(0);
  });

  it("clamps a split before the verse start up to the start", () => {
    const [out] = normalizeTimings([t({ start: 2, end: 8, splits: [-1] })]);
    expect(out.splits![0]).toBeGreaterThanOrEqual(2);
    expect(out.splits![0]).toBeLessThanOrEqual(8);
  });

  it("NEVER changes the splits array length (keeps splitWords parallel)", () => {
    const [out] = normalizeTimings([
      t({ start: 0, end: 5, splits: [7, 8, 9], splitWords: [2, 4, 6], splitWordTotal: 8 }),
    ]);
    expect(out.splits).toHaveLength(3);
    expect(out.splitWords).toEqual([2, 4, 6]); // word indices untouched
    expect(out.splitWordTotal).toBe(8);
  });

  it("keeps splits monotonically non-decreasing after clamping", () => {
    const [out] = normalizeTimings([t({ start: 0, end: 6, splits: [5, 2, 8] })]);
    const s = out.splits!;
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1]);
    for (const v of s) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it("does not reorder or drop verse rows (duplicates preserved)", () => {
    const input = [
      t({ verseNumber: 1, start: 0, end: 5 }),
      t({ verseNumber: 1, start: 5, end: 8 }), // duplicate of verse 1
      t({ verseNumber: 2, start: 8, end: 12 }),
    ];
    const out = normalizeTimings(input);
    expect(out.map((r) => [r.verseNumber, r.start])).toEqual([
      [1, 0],
      [1, 5],
      [2, 8],
    ]);
  });

  it("clamps start/end into [0, duration] when a duration is given", () => {
    const [out] = normalizeTimings([t({ start: -2, end: 99 })], 10);
    expect(out.start).toBe(0);
    expect(out.end).toBe(10);
  });

  it("leaves start/end alone when no duration is given", () => {
    const [out] = normalizeTimings([t({ start: 3, end: 20 })]);
    expect(out.start).toBe(3);
    expect(out.end).toBe(20);
  });

  it("handles a timing with no splits", () => {
    const [out] = normalizeTimings([t({ start: 1, end: 4 })]);
    expect(out.splits).toBeUndefined();
    expect(out).toEqual(t({ start: 1, end: 4 }));
  });
});

describe("alignment row projection", () => {
  it("deduplicates and sorts the Quran reference range", () => {
    expect(verseNumbersForAlignment([
      t({ verseNumber: 3 }),
      t({ verseNumber: 2 }),
      t({ verseNumber: 2 }),
    ])).toEqual([2, 3]);
  });

  it("preserves duplicate rows, splits, and word metadata", () => {
    const current = [
      t({
        verseNumber: 1,
        start: 0,
        end: 4,
        splits: [2],
        splitWords: [3],
        splitWordTotal: 8,
        splitCharFractions: [0.42],
        wordRange: { from: 0, to: 3 },
      }),
      t({
        verseNumber: 1,
        start: 4,
        end: 10,
        wordRange: { from: 4, to: 7 },
      }),
      t({ verseNumber: 2, start: 10, end: 15 }),
    ];
    const aligned = [
      t({
        verseNumber: 1,
        start: 20,
        end: 30,
        alignmentMethod: "hybrid",
        alignmentConfidence: "medium",
        alignmentAgreementSeconds: 0.55,
      }),
      t({ verseNumber: 2, start: 30, end: 38 }),
    ];

    const result = applyAlignedTimingsToRows(current, aligned);

    expect(result).toHaveLength(3);
    expect(result.map((row) => row.verseNumber)).toEqual([1, 1, 2]);
    expect(result[0]).toMatchObject({ start: 20, end: 24, splits: [22] });
    expect(result[1]).toMatchObject({ start: 24, end: 30 });
    expect(result[2]).toMatchObject({ start: 30, end: 38 });
    expect(result[0].splitWords).toEqual([3]);
    expect(result[0].splitCharFractions).toEqual([0.42]);
    expect(result[0].wordRange).toEqual({ from: 0, to: 3 });
    expect(result[1].wordRange).toEqual({ from: 4, to: 7 });
    expect(result[0]).toMatchObject({
      alignmentMethod: "hybrid",
      alignmentConfidence: "medium",
      alignmentAgreementSeconds: 0.55,
    });
    expect(result[1]).toMatchObject({
      alignmentMethod: "hybrid",
      alignmentConfidence: "medium",
      alignmentAgreementSeconds: 0.55,
    });
  });

  it("distributes degenerate duplicate rows across the aligned span", () => {
    const current = [
      t({ verseNumber: 5, start: 2, end: 2 }),
      t({ verseNumber: 5, start: 2, end: 2 }),
    ];
    const result = applyAlignedTimingsToRows(current, [
      t({ verseNumber: 5, start: 10, end: 14 }),
    ]);
    expect(result.map(({ start, end }) => [start, end])).toEqual([
      [10, 12],
      [12, 14],
    ]);
  });

  it("leaves rows without an aligned reference intact", () => {
    const current = [t({ verseNumber: 9, start: 1, end: 3 })];
    expect(applyAlignedTimingsToRows(current, [])).toEqual(current);
  });
});
