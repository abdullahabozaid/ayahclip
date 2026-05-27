import { VideoFormat } from "@/types";

const formats: { value: VideoFormat; label: string; w: number; h: number }[] = [
  { value: "9:16", label: "9:16", w: 16, h: 28 },
  { value: "16:9", label: "16:9", w: 28, h: 16 },
  { value: "1:1", label: "1:1", w: 22, h: 22 },
  { value: "4:5", label: "4:5", w: 20, h: 25 },
];

interface FormatSelectorProps {
  value: VideoFormat;
  onChange: (format: VideoFormat) => void;
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {formats.map((f) => {
        const active = value === f.value;
        return (
          <button
            key={f.value}
            onClick={() => onChange(f.value)}
            className={`flex flex-col items-center gap-2 rounded-xl border py-3 text-xs transition-colors ${
              active
                ? "border-[var(--gold)] bg-[var(--gold)]/10 text-parchment"
                : "border-[var(--hairline-soft)] text-[var(--muted)] hover:border-[var(--hairline)]"
            }`}
            aria-pressed={active}
            aria-label={`${f.label} format`}
          >
            <span
              className="rounded-sm border"
              style={{
                width: f.w,
                height: f.h,
                borderColor: active ? "var(--gold)" : "var(--muted)",
                background: active ? "rgba(201,162,75,0.15)" : "transparent",
              }}
            />
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
