import { Background } from "@/types";
import { backgroundPresets } from "@/lib/backgrounds";

interface BackgroundPickerProps {
  value: Background;
  onChange: (bg: Background) => void;
}

export function BackgroundPicker({ value, onChange }: BackgroundPickerProps) {
  const solids = backgroundPresets.filter((b) => b.type === "solid");
  const gradients = backgroundPresets.filter((b) => b.type === "gradient");
  const images = backgroundPresets.filter((b) => b.type === "image");

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs text-gray-400">Solid Colors</p>
        <div className="flex flex-wrap gap-2">
          {solids.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-8 w-8 rounded-md border-2 transition-all ${
                value.value === bg.value
                  ? "border-emerald-500 scale-110"
                  : "border-transparent hover:border-white/30"
              }`}
              style={{ background: bg.value }}
              aria-label={bg.label}
              title={bg.label}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-gray-400">Gradients</p>
        <div className="flex flex-wrap gap-2">
          {gradients.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-8 w-8 rounded-md border-2 transition-all ${
                value.value === bg.value
                  ? "border-emerald-500 scale-110"
                  : "border-transparent hover:border-white/30"
              }`}
              style={{ background: bg.value }}
              aria-label={bg.label}
              title={bg.label}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-gray-400">Images</p>
        <div className="flex flex-wrap gap-2">
          {images.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-8 w-8 rounded-md border-2 transition-all overflow-hidden ${
                value.value === bg.value
                  ? "border-emerald-500 scale-110"
                  : "border-transparent hover:border-white/30"
              }`}
              aria-label={bg.label}
              title={bg.label}
            >
              <img
                src={bg.value}
                alt={bg.label}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
