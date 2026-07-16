import { describe, expect, it, vi } from "vitest";

import {
  analyzeArabicTextFit,
  drawSplitMask,
  normalizeSplitMask,
  splitTextRegion,
} from "@/lib/canvas-utils";

describe("split mask rendering", () => {
  it("clamps solid and fade widths to the frame", () => {
    expect(normalizeSplitMask({ solidWidth: 80, fadeWidth: 60 })).toMatchObject({
      solidWidth: 80,
      fadeWidth: 20,
    });
  });

  it("falls back from malformed colors before canvas rendering", () => {
    expect(normalizeSplitMask({ color: "#12345" }).color).toBe("#050507");
    expect(normalizeSplitMask({ color: "#abc" }).color).toBe("#abc");
  });

  it("renders a right-side solid region with an inward fade", () => {
    const stops: Array<[number, string]> = [];
    const gradient = { addColorStop: vi.fn((offset: number, color: string) => stops.push([offset, color])) };
    const context = {
      createLinearGradient: vi.fn(() => gradient),
      fillRect: vi.fn(),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;

    drawSplitMask(context, 1000, 600, {
      side: "right",
      color: "#000000",
      opacity: 0.8,
      solidWidth: 30,
      fadeWidth: 20,
    });

    expect(context.createLinearGradient).toHaveBeenCalledWith(500, 0, 1000, 0);
    expect(stops).toEqual([
      [0, "rgba(0, 0, 0, 0)"],
      [0.4, "rgba(0, 0, 0, 0.8)"],
      [1, "rgba(0, 0, 0, 0.8)"],
    ]);
    expect(context.fillRect).toHaveBeenCalledWith(500, 0, 500, 600);
  });

  it("moves and resizes the reading region with the creator's solid panel", () => {
    const left = splitTextRegion(1000, { side: "left", solidWidth: 50 });
    const right = splitTextRegion(1000, { side: "right", solidWidth: 30 });

    expect(left.centerX).toBe(250);
    expect(left.maxWidth).toBe(410);
    expect(right.centerX).toBe(850);
    expect(right.maxWidth).toBe(216);
  });

  it("recommends a smaller real font size when a short split caption over-wraps", () => {
    let currentFont = "";
    const context = {
      get font() {
        return currentFont;
      },
      set font(value: string) {
        currentFont = value;
      },
      measureText(text: string) {
        const size = Number(/([\d.]+)px/.exec(currentFont)?.[1] ?? 16);
        return { width: Array.from(text).length * size * 0.45 };
      },
    } as unknown as CanvasRenderingContext2D;

    const fit = analyzeArabicTextFit(
      context,
      "بسم الله الرحمن الرحيم",
      {
        arabicFont: "noto-naskh-arabic",
        arabicFontWeight: 700,
        arabicFontSize: 42,
        splitMask: { solidWidth: 50, fadeWidth: 20 },
      },
    );

    expect(fit.targetLines).toBe(2);
    expect(fit.cramped).toBe(true);
    expect(fit.recommendedFontSize).toBeLessThan(42);
  });
});
