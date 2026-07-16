import { describe, expect, it } from "vitest";

import { gradientLineForAngle, parseGradientAngle, parseGradientStops } from "@/lib/canvas-utils";

describe("canvas gradient parsing", () => {
  it("preserves CSS gradient angles instead of forcing every gradient diagonal", () => {
    expect(parseGradientAngle("linear-gradient(90deg, #000 0%, #fff 100%)")).toBe(90);
    expect(parseGradientAngle("linear-gradient(180deg, #000 0%, #fff 100%)")).toBe(180);
    expect(parseGradientAngle("linear-gradient(#000 0%, #fff 100%)")).toBe(180);

    const horizontal = gradientLineForAngle(90, 200, 100);
    expect(horizontal.x0).toBeCloseTo(0);
    expect(horizontal.y0).toBeCloseTo(50);
    expect(horizontal.x1).toBeCloseTo(200);
    expect(horizontal.y1).toBeCloseTo(50);
    const vertical = gradientLineForAngle(180, 200, 100);
    expect(vertical.x0).toBeCloseTo(100);
    expect(vertical.y0).toBeCloseTo(0);
    expect(vertical.x1).toBeCloseTo(100);
    expect(vertical.y1).toBeCloseTo(100);
  });

  it("keeps decimal stop positions", () => {
    expect(parseGradientStops("linear-gradient(90deg, #000 12.5%, rgba(1,2,3,.5) 80%)"))
      .toEqual([
        { color: "#000", offset: 0.125 },
        { color: "rgba(1,2,3,.5)", offset: 0.8 },
      ]);
  });
});
