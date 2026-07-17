import { describe, expect, it, vi } from "vitest";

import { drawBgImage } from "../canvas-utils";

function contextStub() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillStyle: "",
    filter: "none",
  } as unknown as CanvasRenderingContext2D;
}

const landscape = { width: 1600, height: 900 } as HTMLImageElement;

describe("media transform rendering", () => {
  it("keeps the default contain fit centered", () => {
    const context = contextStub();
    drawBgImage(context, landscape, 1080, 1920, "contain", "black", {
      scale: 1,
      x: 0,
      y: 0,
    });

    expect(context.drawImage).toHaveBeenLastCalledWith(
      landscape,
      0,
      656.25,
      1080,
      607.5,
    );
  });

  it("applies zoom and positioning to contain just like the export controls promise", () => {
    const context = contextStub();
    drawBgImage(context, landscape, 1080, 1920, "contain", "black", {
      scale: 1.5,
      x: 1,
      y: -1,
    });

    // 1.5× zoom creates horizontal overflow. Positive X moves the media right
    // to reveal its left edge; negative Y aligns it to the frame top.
    const call = vi.mocked(context.drawImage).mock.calls.at(-1)!;
    expect(call[0]).toBe(landscape);
    expect(call[1]).toBeCloseTo(0);
    expect(call[2]).toBeCloseTo(0);
    expect(call[3]).toBeCloseTo(1620);
    expect(call[4]).toBeCloseTo(911.25);
  });

  it("clamps persisted offsets before drawing", () => {
    const context = contextStub();
    drawBgImage(context, landscape, 1080, 1920, "contain", "black", {
      scale: 1,
      x: 9,
      y: -9,
    });

    expect(context.drawImage).toHaveBeenLastCalledWith(
      landscape,
      0,
      0,
      1080,
      607.5,
    );
  });
});
