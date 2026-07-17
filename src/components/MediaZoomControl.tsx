"use client";

interface MediaZoomControlProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

function formatZoom(value: number): string {
  return `${value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}×`;
}

/** A point-of-use framing control shared by both creator previews. */
export function MediaZoomControl({ value, onChange, className = "" }: MediaZoomControlProps) {
  return (
    <label
      className={`flex min-h-10 items-center gap-2 rounded-full border border-[var(--hairline-soft)] bg-white/[0.025] px-3 text-[10px] text-[var(--muted)] ${className}`}
    >
      <span className="shrink-0 font-medium text-parchment">Zoom</span>
      <input
        type="range"
        min={0.25}
        max={5}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Media zoom"
        className="slider-gold w-20 sm:w-24"
      />
      <output className="min-w-8 text-right font-medium tabular-nums text-gold-soft">
        {formatZoom(value)}
      </output>
    </label>
  );
}
