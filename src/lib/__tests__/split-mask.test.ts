import { describe, expect, it, vi } from "vitest";

import { drawSplitMask, normalizeSplitMask } from "@/lib/canvas-utils";

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
});
