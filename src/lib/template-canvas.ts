import type { Background } from "@/types";
import type { TemplateMediaSlot } from "./template-model";

export const TEMPLATE_TEXT_POSITION_MIN = 10;
export const TEMPLATE_TEXT_POSITION_MAX = 90;

export const TEMPLATE_BACKGROUND_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  background: Background;
  swatch: string;
}> = [
  {
    id: "ink",
    label: "Ink",
    background: { type: "solid", value: "#08090d", label: "Ink" },
    swatch: "#08090d",
  },
  {
    id: "emerald",
    label: "Midnight emerald",
    background: {
      type: "gradient",
      value: "linear-gradient(145deg, #07110e 0%, #0b2a21 55%, #050507 100%)",
      label: "Midnight emerald",
    },
    swatch: "linear-gradient(145deg, #07110e 0%, #0b2a21 55%, #050507 100%)",
  },
  {
    id: "warm-black",
    label: "Warm black",
    background: {
      type: "gradient",
      value: "linear-gradient(160deg, #08090d 0%, #211a13 100%)",
      label: "Warm black",
    },
    swatch: "linear-gradient(160deg, #08090d 0%, #211a13 100%)",
  },
  {
    id: "reciter-fade",
    label: "Reciter fade",
    background: {
      type: "gradient",
      value: "linear-gradient(90deg, #050507 0%, #050507 48%, #26354a 100%)",
      label: "Reciter fade",
    },
    swatch: "linear-gradient(90deg, #050507 0%, #050507 48%, #26354a 100%)",
  },
];

export function clampTemplateTextPosition(value: number): number {
  return Math.round(
    Math.min(TEMPLATE_TEXT_POSITION_MAX, Math.max(TEMPLATE_TEXT_POSITION_MIN, value)),
  );
}

export function templateTextPositionFromPointer(
  clientY: number,
  canvasTop: number,
  canvasHeight: number,
): number {
  if (!Number.isFinite(canvasHeight) || canvasHeight <= 0) return 50;
  return clampTemplateTextPosition(((clientY - canvasTop) / canvasHeight) * 100);
}

export function templateTextPositionFromKey(
  current: number,
  key: string,
  step = 2,
): number {
  if (key === "ArrowUp") return clampTemplateTextPosition(current - step);
  if (key === "ArrowDown") return clampTemplateTextPosition(current + step);
  return current;
}

export function toggleBackgroundMediaSlot(
  slots: readonly TemplateMediaSlot[],
): TemplateMediaSlot[] {
  const hasBackground = slots.some((slot) => slot.id === "background");
  if (hasBackground) return slots.filter((slot) => slot.id !== "background");
  return [
    ...slots,
    {
      id: "background",
      accepts: "image-or-video",
      label: "Add image or video",
    },
  ];
}

export function reconcileSequenceMediaSlots(
  slots: readonly TemplateMediaSlot[],
  enabled: boolean,
  requestedCount: number,
): TemplateMediaSlot[] {
  const nonSequenceSlots = slots.filter((slot) => !slot.id.startsWith("scene:"));
  if (!enabled) return nonSequenceSlots;
  const count = Math.min(6, Math.max(2, Math.round(requestedCount)));
  return [
    ...nonSequenceSlots,
    ...Array.from({ length: count }, (_, index): TemplateMediaSlot => ({
      id: `scene:${index}`,
      accepts: "image-or-video",
      label: `B-roll ${index + 1}`,
    })),
  ];
}
