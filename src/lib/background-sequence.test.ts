import { describe, expect, it } from "vitest";
import {
  moveBackgroundScene,
  resolveBackgroundScene,
  sequenceDuration,
  type BackgroundScene,
} from "./background-sequence";

const scene = (id: string, duration: number, transition: "cut" | "crossfade" = "cut"): BackgroundScene => ({
  id,
  duration,
  transition,
  transitionDuration: 1,
  background: { type: "solid", value: `#${id}`, label: id },
  fit: "cover",
  backdrop: "blur",
  transform: { scale: 1, x: 0, y: 0 },
});

describe("background sequence", () => {
  it("loops through scenes using their durations", () => {
    const scenes = [scene("111111", 3), scene("222222", 2)];
    expect(sequenceDuration(scenes)).toBe(5);
    expect(resolveBackgroundScene(scenes, 0)?.scene.id).toBe("111111");
    expect(resolveBackgroundScene(scenes, 3.2)?.scene.id).toBe("222222");
    expect(resolveBackgroundScene(scenes, 5.2)?.scene.id).toBe("111111");
  });

  it("reports crossfade progress and the next scene", () => {
    const scenes = [scene("111111", 5, "crossfade"), scene("222222", 5)];
    const resolved = resolveBackgroundScene(scenes, 4.5);
    expect(resolved?.next?.id).toBe("222222");
    expect(resolved?.transitionProgress).toBeCloseTo(0.5);
  });

  it("moves scenes without mutating the original list", () => {
    const scenes = [scene("111111", 3), scene("222222", 2)];
    const moved = moveBackgroundScene(scenes, "222222", -1);
    expect(moved.map((item) => item.id)).toEqual(["222222", "111111"]);
    expect(scenes.map((item) => item.id)).toEqual(["111111", "222222"]);
  });
});
