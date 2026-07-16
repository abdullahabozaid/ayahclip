import { describe, expect, it } from "vitest";
import { pinchZoom, timelinePointerTime } from "../timeline-gestures";

describe("timeline gesture math", () => {
  it("maps a normal drag to absolute track time", () => {
    expect(timelinePointerTime({
      clientX: 300,
      trackLeft: 100,
      trackWidth: 400,
      duration: 20,
      precision: false,
      pointerStartX: 0,
      initialTargetTime: 0,
    })).toBe(10);
  });

  it("reduces precision drag gain and clamps to clip bounds", () => {
    expect(timelinePointerTime({
      clientX: 300,
      trackLeft: 100,
      trackWidth: 400,
      duration: 20,
      precision: true,
      pointerStartX: 200,
      initialTargetTime: 10,
    })).toBe(10.9);
    expect(timelinePointerTime({
      clientX: -5000,
      trackLeft: 100,
      trackWidth: 400,
      duration: 20,
      precision: true,
      pointerStartX: 200,
      initialTargetTime: 1,
    })).toBe(0);
  });

  it("scales pinch zoom and respects editor limits", () => {
    expect(pinchZoom({ startZoom: 2, startDistance: 100, currentDistance: 150 })).toBe(3);
    expect(pinchZoom({ startZoom: 20, startDistance: 100, currentDistance: 200 })).toBe(24);
    expect(pinchZoom({ startZoom: 2, startDistance: 100, currentDistance: 10 })).toBe(1);
  });
});
