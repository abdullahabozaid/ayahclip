import { describe, expect, it } from "vitest";

import { getArabicFontFamily, shouldUseQcf } from "@/lib/canvas-utils";
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
    expect(shouldUseQcf("qcf", [])).toBe(false);
  });

  it("keeps an explicit Amiri Quran fallback outside the browser", () => {
    expect(getArabicFontFamily("amiri-quran")).toContain("Amiri Quran");
  });
});
