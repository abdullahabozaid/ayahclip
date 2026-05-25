import { VideoFormat } from "@/types";

const formats: { value: VideoFormat; label: string; icon: string }[] = [
  { value: "16:9", label: "16:9", icon: "▬" },
  { value: "9:16", label: "9:16", icon: "▮" },
  { value: "1:1", label: "1:1", icon: "■" },
  { value: "4:5", label: "4:5", icon: "▯" },
];

interface FormatSelectorProps {
  value: VideoFormat;
  onChange: (format: VideoFormat) => void;
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  return (
    <div className="flex gap-2">
      {formats.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs transition-colors ${
            value === f.value
              ? "border-emerald-500 bg-emerald-500/10 text-white"
              : "border-white/10 text-gray-400 hover:bg-white/10"
          }`}
          aria-pressed={value === f.value}
          aria-label={`${f.label} format`}
        >
          <span className="text-lg">{f.icon}</span>
          {f.label}
        </button>
      ))}
    </div>
  );
}
