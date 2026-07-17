import { describe, expect, it } from "vitest";
import {
  canvasBackgroundForMode,
  updateCanvasGradient,
  updateCanvasSolid,
} from "../canvas-background";

describe("reversible canvas treatment", () => {
  it("keeps custom solid and gradient work while comparing modes", () => {
    const originalGradient = "linear-gradient(125deg, #223344 0%, #050507 100%)";
    const solid = canvasBackgroundForMode({
      type: "gradient",
      value: originalGradient,
      label: "Creator gradient",
    }, "solid");
    const editedSolid = updateCanvasSolid(solid, "#334455");
    const restoredGradient = canvasBackgroundForMode(editedSolid, "gradient");

    expect(restoredGradient.value).toBe(originalGradient);
    expect(canvasBackgroundForMode(restoredGradient, "solid").value).toBe("#334455");
  });

  it("persists an edited gradient alongside the active solid", () => {
    const solid = updateCanvasSolid({ type: "solid", value: "#111111", label: "Ink" }, "#112233");
    const gradient = updateCanvasGradient(canvasBackgroundForMode(solid, "gradient"), {
      angle: 90,
      stops: [
        { color: "#abcdef", offset: 0 },
        { color: "#123456", offset: 1 },
      ],
    });

    const activeSolid = canvasBackgroundForMode(gradient, "solid");
    expect(activeSolid.value).toBe("#112233");
    expect(canvasBackgroundForMode(activeSolid, "gradient").value).toBe(
      "linear-gradient(90deg, #abcdef 0%, #123456 100%)",
    );
  });
});
