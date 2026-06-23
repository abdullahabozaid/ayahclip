// The auto-thumbnail must grab a representative frame, NOT the first ~1s — which
// is now the clip-start fade (black) and, for video backgrounds, a black t=0
// frame. thumbnailSeekTime aims ~5s in, clamped to the clip.
import { describe, it, expect } from "vitest";
import { thumbnailSeekTime } from "@/lib/clip-library";

describe("thumbnailSeekTime", () => {
  it("aims ~5s into a normal-length clip", () => {
    expect(thumbnailSeekTime(13)).toBe(5);
    expect(thumbnailSeekTime(30)).toBe(5);
  });

  it("stays just shy of the end on a medium clip", () => {
    expect(thumbnailSeekTime(4)).toBeCloseTo(3.8, 5);
  });

  it("uses the midpoint for a very short clip (past the fade is impossible)", () => {
    expect(thumbnailSeekTime(1)).toBe(0.5);
    expect(thumbnailSeekTime(0.8)).toBeCloseTo(0.4, 5);
  });

  it("never lands in the first ~1s for clips longer than ~1.2s", () => {
    for (const d of [1.5, 2, 3, 5, 8, 20]) {
      expect(thumbnailSeekTime(d)).toBeGreaterThanOrEqual(1);
    }
  });

  it("falls back to ~5s when the duration is unknown (browser clamps if shorter)", () => {
    expect(thumbnailSeekTime(0)).toBe(5);
    expect(thumbnailSeekTime(NaN)).toBe(5);
    expect(thumbnailSeekTime(Infinity)).toBe(5);
    expect(thumbnailSeekTime(-3)).toBe(5);
  });
});
