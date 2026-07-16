"use client";

import { useEffect, useState } from "react";
import { applyTemplate } from "@/lib/apply-template";
import { useAppStore } from "@/lib/store";
import { extractStyle } from "@/lib/style";
import { DEFAULT_TEMPLATE_STYLE, TEMPLATES } from "@/lib/templates";
import {
  deleteSavedTemplate,
  getSavedTemplates,
  saveTemplate,
} from "@/lib/saved-templates";
import type { SavedTemplate } from "@/lib/template-model";

export function StylePanel() {
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    Promise.resolve().then(() => setSaved(getSavedTemplates(DEFAULT_TEMPLATE_STYLE)));
  }, []);

  const handleSave = () => {
    const state = useAppStore.getState();
    const firstScene = state.backgroundScenes[0];
    setSaved(saveTemplate({
      name,
      description: "Saved from Studio",
      family: state.backgroundSequenceEnabled ? "broll" : "minimal",
      mediaPolicy: "use-template-media",
      settings: extractStyle(state),
      extras: {
        wordHighlight: state.wordHighlight,
        clipFadeMs: state.clipFadeMs,
        audioFadeIn: state.audioFadeIn,
        safeAreaTarget: state.safeAreaTarget,
        safePadding: state.safePadding,
        backgroundSequence: state.backgroundSequenceEnabled
          ? {
              enabled: true,
              sceneCount: Math.max(2, state.backgroundScenes.length),
              duration: firstScene?.duration ?? 5,
              transition: firstScene?.transition ?? "crossfade",
              transitionDuration: firstScene?.transitionDuration ?? 0.6,
            }
          : { enabled: false, sceneCount: 1, duration: 5, transition: "cut", transitionDuration: 0.1 },
      },
    }));
    setName("");
    setNaming(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-parchment">Composition presets</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">A starting point, every detail stays editable.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.slice(0, 4).map((template) => (
            <button
              key={template.id}
              onClick={() => applyTemplate(template)}
              className="group overflow-hidden rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] text-left transition-colors hover:border-[var(--hairline)] focus-visible:border-[var(--gold)]"
              title={`Apply ${template.name}`}
            >
              <span className="block aspect-[16/7]" style={{ background: template.swatch }} />
              <span className="block px-2.5 py-2 text-[11px] font-medium text-[var(--muted)] group-hover:text-parchment">
                {template.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Saved full templates — composition, typography, treatment and media structure. */}
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
            Save this complete visual composition to reuse across clips.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {saved.map((s) => (
              <span
                key={s.id}
                className="group flex items-center gap-1 rounded-full border border-[var(--hairline-soft)] py-1 pl-3 pr-1 text-xs"
              >
                <button
                  onClick={() => applyTemplate(s)}
                  className="text-parchment transition-colors hover:text-gold"
                  title="Apply this style"
                >
                  {s.name}
                </button>
                <button
                  onClick={() => setSaved(deleteSavedTemplate(s.id))}
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
