"use client";

import { useId } from "react";
import { getReciter, reciters, RECITER_REGIONS, supportsWordTimings } from "@/lib/reciters";

interface ReciterSelectProps {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  showCatalogCount?: boolean;
}

export function ReciterSelect({
  value,
  onChange,
  label = "Reciter",
  showCatalogCount = false,
}: ReciterSelectProps) {
  const id = useId();
  const selected = getReciter(value) ?? reciters[0];
  const timed = supportsWordTimings(selected);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs text-[var(--muted)]">
          {label}
        </label>
        {showCatalogCount && (
          <span className="text-[11px] tabular-nums text-[var(--muted-deep)]">
            {reciters.length} verified voices
          </span>
        )}
      </div>
      <select
        id={id}
        value={selected.id}
        onChange={(event) => onChange(event.target.value)}
        className="field w-full px-3 py-2.5 text-sm"
      >
        {RECITER_REGIONS.map((region) => (
          <optgroup key={region.id} label={region.label} className="bg-[var(--surface)]">
            {reciters
              .filter((reciter) => reciter.region === region.id)
              .map((reciter) => (
                <option key={reciter.id} value={reciter.id} className="bg-[var(--surface)]">
                  {reciter.name} · {reciter.style}
                </option>
              ))}
          </optgroup>
        ))}
      </select>

      <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-[11px]">
        <span className="truncate font-arabic text-sm text-parchment" dir="rtl">
          {selected.arabicName}
        </span>
        <span className={timed ? "shrink-0 text-emerald-soft" : "shrink-0 text-[var(--muted-deep)]"}>
          {timed ? "Word-synced splitting" : "Whole-verse captions"}
        </span>
      </div>
    </div>
  );
}
