import { describe, it, expect } from "vitest";
import { normalizeTimings } from "../timing-ops";
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
