// Characterization tests for the Quran text helpers. These lock in behavior
// that is sacred for textual integrity: waqf/pause marks must never become
// their own wrap unit (a mark wrapping onto a new line corrupts the text),
// and sanitization must strip exactly the unsupported mark and nothing else.
import { describe, it, expect, vi } from "vitest";
import { arabicTextForFont, splitWords, strokeTextWithOutline } from "@/lib/canvas-utils";

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

describe("arabicTextForFont", () => {
  it("strips U+06DF only from the legacy Uthmanic fallback", () => {
    expect(arabicTextForFont("وَءَامَنُوا۟", "uthmanic-hafs")).toBe("وَءَامَنُوا");
    expect(arabicTextForFont("وَءَامَنُوا۟", "qcf")).toBe("وَءَامَنُوا");
  });

  it("preserves U+06DF in modern Arabic faces that support it", () => {
    const text = "وَءَامَنُوا۟";
    expect(arabicTextForFont(text, "amiri-quran")).toBe(text);
    expect(arabicTextForFont(text, "scheherazade-new")).toBe(text);
    expect(arabicTextForFont(text, "noto-naskh-arabic")).toBe(text);
  });

  it("leaves all other diacritics and waqf marks untouched", () => {
    const text = "قُلْ هُوَ ٱللَّهُ أَحَدٌ ۚ";
    expect(arabicTextForFont(text, "uthmanic-hafs")).toBe(text);
  });
});

describe("strokeTextWithOutline", () => {
  it("draws a scaled round outline without reusing the glow", () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      strokeText: vi.fn(),
      shadowColor: "white",
      shadowBlur: 12,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      strokeStyle: "",
      lineWidth: 0,
      lineJoin: "miter",
      miterLimit: 10,
    } as unknown as CanvasRenderingContext2D;

    strokeTextWithOutline(ctx, "ٱلْحَمْدُ", 120, 240, {
      enabled: true,
      color: "#050507",
      width: 1.25,
    }, 2);

    expect(ctx.strokeText).toHaveBeenCalledWith("ٱلْحَمْدُ", 120, 240);
    expect(ctx.strokeStyle).toBe("#050507");
    expect(ctx.lineWidth).toBe(2.5);
    expect(ctx.lineJoin).toBe("round");
  });

  it("does nothing when the outline is disabled", () => {
    const ctx = { strokeText: vi.fn() } as unknown as CanvasRenderingContext2D;
    strokeTextWithOutline(ctx, "ٱلْحَمْدُ", 0, 0, {
      enabled: false,
      color: "#050507",
      width: 1.25,
    });
    expect(ctx.strokeText).not.toHaveBeenCalled();
  });
});
