import { describe, expect, it } from "vitest";
import {
  clampTemplateTextPosition,
  reconcileSequenceMediaSlots,
  templateTextPositionFromKey,
  templateTextPositionFromPointer,
  toggleBackgroundMediaSlot,
} from "../template-canvas";

describe("template canvas interactions", () => {
  it("maps pointer movement into the supported vertical range", () => {
    expect(templateTextPositionFromPointer(500, 100, 800)).toBe(50);
    expect(templateTextPositionFromPointer(-100, 100, 800)).toBe(10);
    expect(templateTextPositionFromPointer(1200, 100, 800)).toBe(90);
    expect(clampTemplateTextPosition(48.6)).toBe(49);
  });

  it("supports keyboard positioning without escaping the canvas bounds", () => {
    expect(templateTextPositionFromKey(50, "ArrowUp")).toBe(48);
    expect(templateTextPositionFromKey(50, "ArrowDown", 5)).toBe(55);
    expect(templateTextPositionFromKey(10, "ArrowUp")).toBe(10);
    expect(templateTextPositionFromKey(90, "ArrowDown")).toBe(90);
    expect(templateTextPositionFromKey(50, "Enter")).toBe(50);
  });

  it("toggles a reusable background placeholder without duplicating it", () => {
    const added = toggleBackgroundMediaSlot([]);
    expect(added).toEqual([
      { id: "background", accepts: "image-or-video", label: "Add image or video" },
    ]);
    expect(toggleBackgroundMediaSlot(added)).toEqual([]);
  });

  it("keeps B-roll slot count in sync with the sequence structure", () => {
    const slots = reconcileSequenceMediaSlots(
      [{ id: "background", accepts: "video", label: "Reciter" }],
      true,
      4,
    );
    expect(slots.map((slot) => slot.id)).toEqual([
      "background",
      "scene:0",
      "scene:1",
      "scene:2",
      "scene:3",
    ]);
    expect(reconcileSequenceMediaSlots(slots, false, 4)).toHaveLength(1);
  });
});
