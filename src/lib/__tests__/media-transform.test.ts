import { describe, expect, it, vi } from "vitest";
import {
  drawBgImage,
  mediaTransformPositionLabel,
  nudgeMediaTransform,
  type MediaTransform,
} from "../canvas-utils";

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
const centered: MediaTransform = { scale: 1, x: 0, y: 0 };

describe("media transform rendering", () => {
  it("keeps the default contain fit centered", () => {
    const context = contextStub();
    drawBgImage(context, landscape, 1080, 1920, "contain", "black", centered);

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

describe("media framing helpers", () => {
  it("describes centered and offset framing in creator language", () => {
    expect(mediaTransformPositionLabel(centered)).toBe(
      "horizontally centered · vertically centered · 1.00× zoom",
    );
    expect(mediaTransformPositionLabel({ scale: 1.75, x: 0.34, y: -0.2 })).toBe(
      "34% right · 20% up · 1.75× zoom",
    );
  });

  it("nudges precisely, supports coarse movement, and clamps the range", () => {
    expect(nudgeMediaTransform(centered, "right")).toEqual({ scale: 1, x: 0.03, y: 0 });
    expect(nudgeMediaTransform(centered, "up", true)).toEqual({ scale: 1, x: 0, y: -0.1 });
    expect(nudgeMediaTransform({ scale: 2, x: 0.99, y: -0.99 }, "right", true)).toEqual({
      scale: 2,
      x: 1,
      y: -0.99,
    });
  });
});
