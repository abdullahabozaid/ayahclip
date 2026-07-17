import { describe, expect, it, vi } from "vitest";
import {
  drawBgImage,
  mediaFrameRect,
  mediaTransformPositionLabel,
  normalizeMediaFrame,
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
    translate: vi.fn(),
    ellipse: vi.fn(),
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
    expect(call[1]).toBeCloseTo(810);
    expect(call[2]).toBeCloseTo(-1415.625);
    expect(call[3]).toBeCloseTo(1620);
    expect(call[4]).toBeCloseTo(911.25);
  });

  it("honours offsets beyond the frame instead of clamping them", () => {
    const context = contextStub();
    drawBgImage(context, landscape, 1080, 1920, "contain", "black", {
      scale: 1,
      x: 9,
      y: -9,
    });

    expect(context.drawImage).toHaveBeenLastCalledWith(
      landscape,
      9720,
      -16623.75,
      1080,
      607.5,
    );
  });
});

describe("media framing helpers", () => {
  it("creates a movable square container without changing the media transform", () => {
    const frame = normalizeMediaFrame({
      shape: "square",
      x: 25,
      y: 70,
      width: 80,
      height: 50,
      radius: 0,
    });
    expect(mediaFrameRect(1080, 1920, frame)).toEqual({
      x: -162,
      y: 912,
      w: 864,
      h: 864,
      radius: 0,
      shape: "square",
    });
  });

  it("clips media to a square and paints the unused canvas black", () => {
    const context = contextStub();
    drawBgImage(context, landscape, 1080, 1920, "cover", "black", centered, {
      shape: "square",
      x: 50,
      y: 50,
      width: 80,
      height: 50,
      radius: 0,
    });
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1920);
    expect(context.rect).toHaveBeenCalledWith(108, 528, 864, 864);
    expect(context.translate).toHaveBeenCalledWith(108, 528);
  });

  it("describes centered and offset framing in creator language", () => {
    expect(mediaTransformPositionLabel(centered)).toBe(
      "horizontally centered · vertically centered · 1.00× zoom",
    );
    expect(mediaTransformPositionLabel({ scale: 1.75, x: 0.34, y: -0.2 })).toBe(
      "34% right · 20% up · 1.75× zoom",
    );
  });

  it("nudges precisely, supports coarse movement, and keeps the range unrestricted", () => {
    expect(nudgeMediaTransform(centered, "right")).toEqual({ scale: 1, x: 0.03, y: 0 });
    expect(nudgeMediaTransform(centered, "up", true)).toEqual({ scale: 1, x: 0, y: -0.1 });
    expect(nudgeMediaTransform({ scale: 2, x: 0.99, y: -0.99 }, "right", true)).toEqual({
      scale: 2,
      x: 1.09,
      y: -0.99,
    });
  });
});
