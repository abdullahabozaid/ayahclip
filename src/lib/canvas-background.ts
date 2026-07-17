import type { Background } from "@/types";
import {
  parseLinearGradient,
  serializeLinearGradient,
  type LinearGradientSpec,
} from "./canvas-utils";

export const DEFAULT_CANVAS_SOLID = "#08090d";
export const DEFAULT_CANVAS_GRADIENT: LinearGradientSpec = {
  angle: 160,
  stops: [
    { color: "#111319", offset: 0 },
    { color: "#050507", offset: 1 },
  ],
};

export function canvasPickerColor(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split("").map((value) => value + value).join("")}`;
  }
  return DEFAULT_CANVAS_SOLID;
}

export function canvasGradientFrom(background: Background): LinearGradientSpec {
  const source = background.type === "gradient"
    ? background.value
    : background.canvasAlternates?.gradient;
  if (!source) return DEFAULT_CANVAS_GRADIENT;
  const parsed = parseLinearGradient(source);
  return parsed.stops.length >= 2 ? parsed : DEFAULT_CANVAS_GRADIENT;
}

export function canvasBackgroundForMode(
  background: Background,
  mode: "solid" | "gradient",
): Background {
  const alternates = { ...background.canvasAlternates };
  if (background.type === "solid") alternates.solid = canvasPickerColor(background.value);
  if (background.type === "gradient") alternates.gradient = background.value;

  if (mode === "solid") {
    const firstGradientColor = canvasGradientFrom(background).stops[0]?.color;
    const value = alternates.solid ?? canvasPickerColor(firstGradientColor ?? DEFAULT_CANVAS_SOLID);
    return {
      type: "solid",
      value,
      label: "Custom solid",
      canvasAlternates: { ...alternates, solid: value },
    };
  }

  const value = alternates.gradient ?? serializeLinearGradient({
    angle: 160,
    stops: [
      { color: canvasPickerColor(alternates.solid ?? DEFAULT_CANVAS_GRADIENT.stops[0].color), offset: 0 },
      { color: "#050507", offset: 1 },
    ],
  });
  return {
    type: "gradient",
    value,
    label: "Custom gradient",
    canvasAlternates: { ...alternates, gradient: value },
  };
}

export function updateCanvasSolid(background: Background, color: string): Background {
  const value = canvasPickerColor(color);
  return {
    type: "solid",
    value,
    label: "Custom solid",
    canvasAlternates: { ...background.canvasAlternates, solid: value },
  };
}

export function updateCanvasGradient(
  background: Background,
  spec: LinearGradientSpec,
): Background {
  const value = serializeLinearGradient(spec);
  return {
    type: "gradient",
    value,
    label: "Custom gradient",
    canvasAlternates: { ...background.canvasAlternates, gradient: value },
  };
}
