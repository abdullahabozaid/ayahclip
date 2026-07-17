"use client";

import {
  type LinearGradientSpec,
} from "@/lib/canvas-utils";
import {
  canvasBackgroundForMode,
  canvasGradientFrom,
  canvasPickerColor,
  updateCanvasGradient,
  updateCanvasSolid,
} from "@/lib/canvas-background";
import type { Background } from "@/types";

export function BackgroundEditor({
  value,
  onChange,
}: {
  value: Background;
  onChange: (background: Background) => void;
}) {
  const gradient = canvasGradientFrom(value);
  const setGradient = (spec: LinearGradientSpec) => {
    onChange(updateCanvasGradient(value, spec));
  };

  const chooseMode = (mode: "solid" | "gradient") => {
    onChange(canvasBackgroundForMode(value, mode));
  };

  const updateStop = (
    index: number,
    patch: Partial<LinearGradientSpec["stops"][number]>,
  ) => {
    setGradient({
      ...gradient,
      stops: gradient.stops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, ...patch } : stop
      ),
    });
  };

  const addStop = () => {
    if (gradient.stops.length >= 5) return;
    const ordered = [...gradient.stops].sort((a, b) => a.offset - b.offset);
    let insertAfter = 0;
    let widestGap = -1;
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const gap = ordered[index + 1].offset - ordered[index].offset;
      if (gap > widestGap) {
        widestGap = gap;
        insertAfter = index;
      }
    }
    const left = ordered[insertAfter];
    const right = ordered[insertAfter + 1];
    const next = {
      color: left.color,
      offset: (left.offset + right.offset) / 2,
    };
    setGradient({ ...gradient, stops: [...ordered, next] });
  };

  return (
    <div className="space-y-4 rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)]/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-parchment">Custom canvas</p>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">Build a solid field or precise linear gradient.</p>
        </div>
        <div aria-label="Canvas treatment" className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1">
          {(["solid", "gradient"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => chooseMode(mode)}
              aria-pressed={value.type === mode}
              className={`min-h-9 rounded-md px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                value.type === mode
                  ? "bg-white/[0.09] text-parchment"
                  : "text-[var(--muted)] hover:text-parchment"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {value.type === "solid" && (
        <label className="flex min-h-11 items-center justify-between gap-3 text-xs text-[var(--muted)]">
          <span>Canvas color</span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase text-[var(--muted-deep)]">{canvasPickerColor(value.value)}</span>
            <input
              type="color"
              value={canvasPickerColor(value.value)}
              onChange={(event) => onChange(updateCanvasSolid(value, event.target.value))}
              className="h-10 w-12 cursor-pointer rounded-lg border border-[var(--hairline-soft)] bg-transparent p-1"
              aria-label="Canvas color"
            />
          </span>
        </label>
      )}

      {value.type === "gradient" && (
        <>
          <div className="h-10 rounded-lg border border-[var(--hairline-soft)] shadow-inner" style={{ background: value.value }} aria-label="Gradient preview" />
          <div className="space-y-3">
            {gradient.stops.map((stop, index) => (
              <div key={`${index}-${stop.color}`} className="grid grid-cols-[40px_1fr_42px_32px] items-center gap-2">
                <input
                  type="color"
                  value={canvasPickerColor(stop.color)}
                  onChange={(event) => updateStop(index, { color: event.target.value })}
                  className="h-10 w-10 cursor-pointer rounded-lg border border-[var(--hairline-soft)] bg-transparent p-1"
                  aria-label={`Gradient stop ${index + 1} color`}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(stop.offset * 100)}
                  onChange={(event) => updateStop(index, { offset: Number(event.target.value) / 100 })}
                  className="slider-gold w-full"
                  aria-label={`Gradient stop ${index + 1} position`}
                />
                <span className="text-right text-[10px] tabular-nums text-gold-soft">{Math.round(stop.offset * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setGradient({ ...gradient, stops: gradient.stops.filter((_, stopIndex) => stopIndex !== index) })}
                  disabled={gradient.stops.length <= 2}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-base text-[var(--muted)] hover:bg-white/[0.04] hover:text-parchment disabled:cursor-not-allowed disabled:opacity-30 sm:h-8 sm:w-8"
                  aria-label={`Remove gradient stop ${index + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <label className="block space-y-2">
              <span className="flex items-center justify-between text-xs text-[var(--muted)]">
                <span>Angle</span>
                <span className="tabular-nums text-gold-soft">{Math.round(gradient.angle)}°</span>
              </span>
              <input
                type="range"
                min={0}
                max={359}
                value={Math.round(gradient.angle)}
                onChange={(event) => setGradient({ ...gradient, angle: Number(event.target.value) })}
                className="slider-gold w-full"
              />
            </label>
            <button
              type="button"
              onClick={() => setGradient({
                ...gradient,
                stops: gradient.stops.map((stop) => ({ ...stop, offset: 1 - stop.offset })),
              })}
              className="mt-5 min-h-10 rounded-lg border border-[var(--hairline-soft)] px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] hover:border-[var(--hairline)] hover:text-parchment"
            >
              Reverse
            </button>
          </div>
          <button
            type="button"
            onClick={addStop}
            disabled={gradient.stops.length >= 5}
            className="min-h-10 w-full rounded-lg border border-dashed border-[var(--hairline)] text-[10px] font-semibold uppercase tracking-[0.1em] text-gold-soft hover:bg-white/[0.025] disabled:cursor-not-allowed disabled:opacity-35"
          >
            Add color stop
          </button>
        </>
      )}
    </div>
  );
}
