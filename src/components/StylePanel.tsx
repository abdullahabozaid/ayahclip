"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { TemplatePreview } from "./templates/TemplatePreview";

const PRESET_GUIDANCE: Record<string, { eyebrow: string; result: string }> = {
  "ayahclip-gold-line": { eyebrow: "Signature", result: "Centered · gold line · dark media" },
  "reciter-split-fade": { eyebrow: "Reciter", result: "Text left · reciter right · soft fade" },
  "nature-reflection": { eyebrow: "B-roll", result: "Centered · white glow · nature media" },
  "clean-ink": { eyebrow: "Minimal", result: "Black canvas · crisp white text" },
  "translation-led": { eyebrow: "English first", result: "Large translation · Arabic context" },
  "broll-rotation": { eyebrow: "Sequence", result: "Three scenes · steady captions" },
};

export function StylePanel() {
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [appliedId, setAppliedId] = useState<string | null>(null);

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
            <p className="text-xs font-medium text-parchment">Choose a composition</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--muted)]">Each card changes layout, type treatment, and media behaviour. You can edit everything after.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((template) => {
            const guidance = PRESET_GUIDANCE[template.id];
            const selected = appliedId === template.id;
            return (
            <button
              key={template.id}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                applyTemplate(template);
                setAppliedId(template.id);
              }}
              className={`group overflow-hidden rounded-xl border bg-[var(--ink-deep)] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${selected ? "border-gold" : "border-[var(--hairline-soft)] hover:border-[var(--hairline)]"}`}
              title={`Apply ${template.name}`}
            >
              <span className="relative block aspect-[9/16] overflow-hidden bg-black">
                <TemplatePreview
                  style={template.settings}
                  extras={template.extras}
                  previewMedia={template.mediaSlots.length > 0}
                  renderWidth={180}
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/70 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-white/70 backdrop-blur-sm">
                  {guidance?.eyebrow ?? template.family}
                </span>
                {selected && (
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-xs font-bold text-[var(--ink-deep)]" aria-hidden="true">✓</span>
                )}
              </span>
              <span className="block px-2.5 py-2.5">
                <span className={`block text-[11px] font-medium ${selected ? "text-gold-soft" : "text-parchment"}`}>
                  {template.name}
                </span>
                <span className="mt-1 block text-[9px] leading-3 text-[var(--muted)]">
                  {guidance?.result ?? template.description}
                </span>
              </span>
            </button>
            );
          })}
        </div>
        <Link href="/styles" className="mt-3 flex min-h-10 items-center justify-center rounded-lg border border-[var(--hairline-soft)] text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--hairline)] hover:text-parchment">
          Open Template Studio to edit presets
        </Link>
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
