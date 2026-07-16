import { describe, expect, it } from "vitest";
import { formatClipDuration, importedClipDurationSeconds } from "../clip-duration";

const verses = [
  { verse_number: 1, text_uthmani: "one two three four" },
  { verse_number: 2, text_uthmani: "one two" },
];

describe("imported clip duration", () => {
  it("sums exported rows instead of estimating five seconds per ayah", () => {
    expect(importedClipDurationSeconds([
      { verseNumber: 1, start: 0, end: 1.2 },
      { verseNumber: 2, start: 1.2, end: 2.5 },
    ], verses)).toBeCloseTo(2.5);
  });

  it("counts duplicate rows and applies word trims like the exporter", () => {
    expect(importedClipDurationSeconds([
      { verseNumber: 1, start: 0, end: 4, wordRange: { from: 1, to: 2 } },
      { verseNumber: 1, start: 4, end: 6 },
    ], verses)).toBeCloseTo(4);
  });

  it("formats imported durations as exact and reciter estimates as approximate", () => {
    expect(formatClipDuration(1.24)).toBe("1.2s");
    expect(formatClipDuration(65)).toBe("1m 5s");
    expect(formatClipDuration(10, true)).toBe("~10s");
  });
});
