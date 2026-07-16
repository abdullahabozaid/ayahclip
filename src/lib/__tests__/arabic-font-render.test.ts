import { describe, expect, it } from "vitest";

import {
  getArabicFontFamily,
  shouldUseQcf,
  supportedArabicFontWeight,
} from "@/lib/canvas-utils";
import type { QcfWord } from "@/types";

const words: QcfWord[] = [{
  position: 1,
  code_v2: "glyph",
  page_number: 1,
  line_number: 1,
  text_uthmani: "بِسْمِ",
  char_type_name: "word",
}];

describe("Arabic rendering modes", () => {
  it("uses QCF glyphs only when the saved rendering mode requests them", () => {
    expect(shouldUseQcf("qcf", words)).toBe(true);
    expect(shouldUseQcf("uthmanic-hafs", words)).toBe(false);
    expect(shouldUseQcf("amiri-quran", words)).toBe(false);
    expect(shouldUseQcf("scheherazade-new", words)).toBe(false);
    expect(shouldUseQcf("noto-naskh-arabic", words)).toBe(false);
    expect(shouldUseQcf("qcf", [])).toBe(false);
  });

  it("keeps an explicit Amiri Quran fallback outside the browser", () => {
    expect(getArabicFontFamily("amiri-quran")).toContain("Amiri Quran");
  });

  it("only permits genuine weights shipped by the selected Arabic face", () => {
    expect(supportedArabicFontWeight("qcf", 700)).toBe(400);
    expect(supportedArabicFontWeight("amiri-quran", 600)).toBe(400);
    expect(supportedArabicFontWeight("scheherazade-new", 600)).toBe(600);
    expect(supportedArabicFontWeight("scheherazade-new", 700)).toBe(700);
    expect(supportedArabicFontWeight("noto-naskh-arabic", 600)).toBe(600);
    expect(supportedArabicFontWeight("noto-naskh-arabic", 700)).toBe(700);
  });
});
