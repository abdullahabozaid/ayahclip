import { describe, expect, it } from "vitest";
import { activeHighlightWord } from "../export";

// Plan 008 item H. The exported MP4 must light the same word the live preview
// does; the shared formula is exercised here without a canvas.
describe("activeHighlightWord", () => {
  const text = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ"; // 4 words

  it("lights the first word at the very start", () => {
    expect(activeHighlightWord(text, 0, 4)).toBe(0);
  });

  it("advances one word per equal slice of the verse", () => {
    expect(activeHighlightWord(text, 1.0, 4)).toBe(1);
    expect(activeHighlightWord(text, 2.0, 4)).toBe(2);
    expect(activeHighlightWord(text, 3.0, 4)).toBe(3);
  });

  it("caps at the last word at (and past) the end, never out of range", () => {
    expect(activeHighlightWord(text, 4, 4)).toBe(3);
    expect(activeHighlightWord(text, 99, 4)).toBe(3);
  });

  it("clamps negative/early time to the first word", () => {
    expect(activeHighlightWord(text, -5, 4)).toBe(0);
  });

  it("returns null when the verse has no measurable duration", () => {
    expect(activeHighlightWord(text, 1, 0)).toBeNull();
    expect(activeHighlightWord(text, 1, -1)).toBeNull();
  });

  it("returns null for empty/whitespace text", () => {
    expect(activeHighlightWord("", 1, 4)).toBeNull();
    expect(activeHighlightWord("   ", 1, 4)).toBeNull();
  });

  it("ignores extra whitespace between words when counting", () => {
    expect(activeHighlightWord("one   two", 1.9, 2)).toBe(1);
    expect(activeHighlightWord("one   two", 0.1, 2)).toBe(0);
  });
});
