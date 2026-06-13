"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { extractPresetStyle, stripBackgroundKeys } from "@/lib/style";
import {
  SavedStyle,
  getSavedStyles,
  saveStyle,
  deleteSavedStyle,
} from "@/lib/saved-styles";

export function StylePanel() {
  const applyStyle = useAppStore((s) => s.applyStyle);
  const [saved, setSaved] = useState<SavedStyle[]>(() => getSavedStyles());
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const handleSave = () => {
    setSaved(saveStyle(name, extractPresetStyle(useAppStore.getState())));
    setName("");
    setNaming(false);
  };

  return (
    <div className="space-y-4">
      {/* Saved layout presets — font size, position, spacing (no colors/bg) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-[var(--muted)]">My presets</p>
          {!naming && (
            <button
              onClick={() => setNaming(true)}
              className="text-xs text-gold-soft/80 transition-colors hover:text-gold"
            >
              + Save current
            </button>
          )}
        </div>

        {naming && (
          <div className="mb-2 flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") {
                  setNaming(false);
                  setName("");
                }
              }}
              placeholder="Preset name…"
              className="field flex-1 px-2 py-1.5 text-sm placeholder-[var(--muted-deep)]"
            />
            <button onClick={handleSave} className="btn-gold rounded-full px-3 py-1.5 text-xs">
              Save
            </button>
          </div>
        )}

        {saved.length === 0 ? (
          <p className="text-[11px] text-[var(--muted-deep)]">
            Save font sizes, spacing &amp; layout to reuse across clips.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {saved.map((s) => (
              <span
                key={s.id}
                className="group flex items-center gap-1 rounded-full border border-[var(--hairline-soft)] py-1 pl-3 pr-1 text-xs"
              >
                <button
                  onClick={() => applyStyle(stripBackgroundKeys(s.settings))}
                  className="text-parchment transition-colors hover:text-gold"
                  title="Apply this style"
                >
                  {s.name}
                </button>
                <button
                  onClick={() => setSaved(deleteSavedStyle(s.id))}
                  aria-label={`Delete ${s.name}`}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--muted-deep)] hover:text-red-400"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
