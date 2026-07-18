import { afterEach, describe, expect, it, vi } from "vitest";

import {
  arabicTextForFont,
  ensureFontsReady,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Arabic rendering modes", () => {
  it("pairs the Uthmanic Hafs face with QPC Hafs text without deleting marks", () => {
    const source = "مِنۡ شَيۡءٖ ۟";
    const qpcWords: QcfWord[] = [
      { ...words[0], position: 1, text_uthmani: "مِنۡ", text_qpc_hafs: "مِنۡ" },
      { ...words[0], position: 2, text_uthmani: "شَىْءٍ", text_qpc_hafs: "شَيۡءٖ" },
      { ...words[0], position: 3, char_type_name: "end", text_uthmani: "١", text_qpc_hafs: "١" },
    ];

    expect(arabicTextForFont(source, "uthmanic-hafs", qpcWords)).toBe("مِنۡ شَيۡءٖ");
    expect(arabicTextForFont(source, "uthmanic-hafs")).toBe(source);
    expect(arabicTextForFont(source, "scheherazade-new", qpcWords)).toBe(source);
  });

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

  it("fails a strict export wait instead of silently drawing a fallback face", async () => {
    const load = vi.fn(() => new Promise<FontFace[]>(() => undefined));
    vi.stubGlobal("document", { fonts: { load } });
    vi.stubGlobal("window", { setTimeout });

    await expect(ensureFontsReady(
      "uthmanic-hafs",
      "serif",
      700,
      400,
      { timeoutMs: 1, throwOnTimeout: true },
    )).rejects.toThrow("selected Quran font did not finish loading");

    expect(load).toHaveBeenCalledWith(
      '400 32px "UthmanicHafs"',
      "بِسْمِ ٱللَّهِ ﴿١﴾",
    );
  });

  it("rejects an empty font-load result instead of recording a platform fallback", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.stubGlobal("document", { fonts: { load } });
    vi.stubGlobal("window", { setTimeout });

    await expect(ensureFontsReady(
      "uthmanic-hafs",
      "serif",
      400,
      400,
      { timeoutMs: 20, throwOnTimeout: true },
    )).rejects.toThrow("selected Quran font did not finish loading");
  });

  it("rejects a missing selected web translation face instead of recording a fallback", async () => {
    const arabicFace = {} as FontFace;
    const load = vi.fn()
      .mockResolvedValueOnce([arabicFace])
      .mockResolvedValueOnce([]);
    vi.stubGlobal("document", {
      fonts: { load },
      documentElement: {},
    });
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (property: string) => property === "--font-lora" ? '"Lora"' : "",
    }));
    vi.stubGlobal("window", { setTimeout });

    await expect(ensureFontsReady(
      "uthmanic-hafs",
      "lora",
      400,
      500,
      { timeoutMs: 20, throwOnTimeout: true },
    )).rejects.toThrow("selected translation font did not finish loading");

    expect(load).toHaveBeenNthCalledWith(2, '500 24px "Lora", sans-serif', "Aa");
  });

  it("allows intentional system translation fallbacks while keeping Quran fonts strict", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce([{} as FontFace])
      .mockResolvedValueOnce([]);
    vi.stubGlobal("document", { fonts: { load } });
    vi.stubGlobal("window", { setTimeout });

    await expect(ensureFontsReady(
      "uthmanic-hafs",
      "serif",
      400,
      400,
      { timeoutMs: 20, throwOnTimeout: true },
    )).resolves.toBeUndefined();
  });
});
