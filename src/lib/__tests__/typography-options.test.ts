import { describe, expect, it } from "vitest";

import {
  ARABIC_FONT_WEIGHTS,
  TRANSLATION_FONTS,
} from "@/lib/canvas-utils";
import {
  ARABIC_FONT_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  TRANSLATION_FONT_OPTIONS,
} from "@/lib/typography-options";

describe("shared typography options", () => {
  it("exposes every renderable translation face, including the template default", () => {
    expect(new Set(TRANSLATION_FONT_OPTIONS.map((option) => option.value)))
      .toEqual(new Set(Object.keys(TRANSLATION_FONTS)));
    expect(TRANSLATION_FONT_OPTIONS.some((option) => option.value === "outfit")).toBe(true);
  });

  it("uses only genuine selectable Arabic weights as defaults", () => {
    for (const option of ARABIC_FONT_OPTIONS) {
      expect(ARABIC_FONT_WEIGHTS[option.value], option.label)
        .toContain(option.defaultWeight);
    }
  });

  it("keeps the common weight vocabulary ordered and bounded", () => {
    expect(FONT_WEIGHT_OPTIONS.map((option) => option.value))
      .toEqual([400, 500, 600, 700]);
  });
});
