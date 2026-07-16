import { describe, it, expect } from "vitest";
import { buildClipRows, verseWordCount } from "../clip-rows";
import type { Verse } from "@/types";
import type { VerseTiming } from "../audio-import";

const verse = (n: number, text = "one two three"): Verse => ({
  id: n,
  verse_number: n,
  verse_key: `1:${n}`,
  text_uthmani: text,
});

const tm = (verseNumber: number, start: number, end: number): VerseTiming => ({
  verseNumber,
  start,
  end,
});

describe("buildClipRows", () => {
  it("reciter mode: one row per selected verse, no timings", () => {
    const rows = buildClipRows([verse(1), verse(2), verse(3)], [1, 3], undefined);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.verse.verse_number)).toEqual([1, 3]);
    expect(rows[0].timing).toBeUndefined();
  });

  it("imported mode: one row per timing, in timing order", () => {
    const rows = buildClipRows([verse(1), verse(2)], [1, 2], [tm(1, 0, 5), tm(2, 5, 9)]);
    expect(rows).toHaveLength(2);
    expect(rows[0].timing?.start).toBe(0);
    expect(rows[1].verse.verse_number).toBe(2);
  });

  it("imported mode: a duplicated verse produces TWO rows (the export bug)", () => {
    const rows = buildClipRows([verse(1), verse(2)], [1, 2], [
      tm(1, 0, 5),
      tm(1, 5, 8), // duplicate of verse 1
      tm(2, 8, 12),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.verse.verse_number)).toEqual([1, 1, 2]);
    expect(rows[0].timing?.start).toBe(0);
    expect(rows[1].timing?.start).toBe(5);
  });

  it("imported mode: drops timings whose verse text is missing", () => {
    const rows = buildClipRows([verse(1)], [1, 9], [tm(1, 0, 5), tm(9, 5, 9)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].verse.verse_number).toBe(1);
  });

  it("imported mode: ignores selectedVerseNumbers (timings are authoritative)", () => {
    const rows = buildClipRows([verse(1), verse(2)], [1], [tm(1, 0, 5), tm(2, 5, 9)]);
    expect(rows).toHaveLength(2);
  });

  it("imported mode with empty timings falls back to selection", () => {
    const rows = buildClipRows([verse(1), verse(2)], [2], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].verse.verse_number).toBe(2);
  });
});

describe("verseWordCount", () => {
  it("counts whitespace-separated words", () => {
    expect(verseWordCount("one two three")).toBe(3);
  });

  it("ignores repeated and trailing whitespace", () => {
    expect(verseWordCount("  one   two  ")).toBe(2);
  });

  it("returns 0 for empty text", () => {
    expect(verseWordCount("")).toBe(0);
  });
});
