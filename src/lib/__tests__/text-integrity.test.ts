// Characterization tests for the Quran text helpers. These lock in behavior
// that is sacred for textual integrity: waqf/pause marks must never become
// their own wrap unit (a mark wrapping onto a new line corrupts the text),
// and sanitization must strip exactly the unsupported mark and nothing else.
import { describe, it, expect } from "vitest";
import { splitWords, sanitizeArabic } from "@/lib/canvas-utils";

describe("splitWords (wrap units)", () => {
  it("splits plain words on spaces", () => {
    expect(splitWords("بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ")).toEqual([
      "بِسْمِ",
      "ٱللَّهِ",
      "ٱلرَّحْمَـٰنِ",
      "ٱلرَّحِيمِ",
    ]);
  });

  it("glues a standalone waqf mark to the preceding word", () => {
    // ۛ (U+06DB, small high three dots) appears as a space-separated token in
    // Uthmani text but must stay attached to its word.
    const units = splitWords("كَلَّآ ۛ سَوْفَ تَعْلَمُونَ");
    expect(units).toEqual(["كَلَّآ ۛ", "سَوْفَ", "تَعْلَمُونَ"]);
  });

  it("glues consecutive mark-only tokens", () => {
    const units = splitWords("ٱلْكِتَـٰبُ ۛ ۖ فِيهِ");
    expect(units).toEqual(["ٱلْكِتَـٰبُ ۛ ۖ", "فِيهِ"]);
  });

  it("ignores empty tokens from double spaces", () => {
    expect(splitWords("أَلْفُ  لَامْ")).toEqual(["أَلْفُ", "لَامْ"]);
  });

  it("keeps a leading mark-only token as its own unit (nothing to glue to)", () => {
    expect(splitWords("ۖ كَلِمَة")).toEqual(["ۖ", "كَلِمَة"]);
  });
});

describe("sanitizeArabic", () => {
  it("strips U+06DF (small high rounded zero, unsupported by the font)", () => {
    expect(sanitizeArabic("وَءَامَنُوا۟")).toBe("وَءَامَنُوا");
  });

  it("leaves all other diacritics and waqf marks untouched", () => {
    const text = "قُلْ هُوَ ٱللَّهُ أَحَدٌ ۚ";
    expect(sanitizeArabic(text)).toBe(text);
  });
});
