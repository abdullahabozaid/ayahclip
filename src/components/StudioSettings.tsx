"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { ARABIC_FONTS } from "@/lib/canvas-utils";
import { FormatSelector } from "./FormatSelector";
import { BackgroundPicker } from "./BackgroundPicker";
import { ExportButton } from "./ExportButton";

const ARABIC_FONT_OPTIONS = [
  { value: "amiri", label: "Amiri" },
  { value: "scheherazade", label: "Scheherazade New" },
  { value: "noto-naskh", label: "Noto Naskh Arabic" },
  { value: "reem-kufi", label: "Reem Kufi" },
  { value: "aref-ruqaa", label: "Aref Ruqaa" },
  { value: "lateef", label: "Lateef" },
];

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/5 pb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-2"
      >
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
          {title}
        </span>
        <span className="text-xs text-gray-500">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="space-y-4 pt-1">{children}</div>}
    </div>
  );
}

export function StudioSettings() {
  const store = useAppStore();
  const selectedCount = store.selectedVerseNumbers.length;
  const estimatedDuration = selectedCount * 5;
  const durationLabel =
    estimatedDuration < 60
      ? `~${estimatedDuration}s`
      : `~${Math.floor(estimatedDuration / 60)}m ${estimatedDuration % 60}s`;

  return (
    <div className="space-y-2 overflow-y-auto p-6">
      {/* Info - always visible */}
      <div className="pb-4 border-b border-white/5">
        <p className="text-xs text-gray-400">Surah {store.surah?.id}</p>
        <h2 className="text-xl font-bold">{store.surah?.name_simple ?? "—"}</h2>
        <p className="text-sm text-gray-400">
          {selectedCount} verses selected
          {selectedCount > 0 && (
            <span className="ml-2 text-emerald-400">{durationLabel}</span>
          )}
        </p>
      </div>

      {/* Audio */}
      <Section title="Audio">
        <div>
          <label className="mb-2 block text-xs text-gray-500">Reciter</label>
          <select
            value={store.reciterId}
            onChange={(e) => store.setReciterId(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
          >
            {reciters.map((r) => (
              <option key={r.id} value={r.id} className="bg-[#1a1a1a]">
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </Section>

      {/* Format */}
      <Section title="Format">
        <FormatSelector value={store.videoFormat} onChange={store.setVideoFormat} />

        {store.videoFormat === "9:16" && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Letterbox (16:9 in 9:16)</span>
              <button
                onClick={() =>
                  store.setLetterbox({ ...store.letterbox, enabled: !store.letterbox.enabled })
                }
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  store.letterbox.enabled ? "bg-emerald-500" : "bg-white/20"
                }`}
                role="switch"
                aria-checked={store.letterbox.enabled}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    store.letterbox.enabled ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
            {store.letterbox.enabled && (
              <>
                <div>
                  <p className="mb-2 text-xs text-gray-500">Bar Style</p>
                  <div className="flex gap-2">
                    {(["solid", "blur", "gradient"] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() =>
                          store.setLetterbox({ ...store.letterbox, barStyle: style })
                        }
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs capitalize ${
                          store.letterbox.barStyle === style
                            ? "border-emerald-500 text-white"
                            : "border-white/10 text-gray-400"
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
                {store.letterbox.barStyle === "solid" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={store.letterbox.barColor}
                      onChange={(e) =>
                        store.setLetterbox({ ...store.letterbox, barColor: e.target.value })
                      }
                      className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent"
                    />
                    <span className="text-xs text-gray-400">Bar Color</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Section>

      {/* Typography */}
      <Section title="Typography">
        <div>
          <label className="mb-2 block text-xs text-gray-500">Arabic Font</label>
          <select
            value={store.arabicFont}
            onChange={(e) => store.setArabicFont(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
          >
            {ARABIC_FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value} className="bg-[#1a1a1a]">
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-xs text-gray-500">
            Arabic Size — {store.arabicFontSize}px
          </label>
          <input
            type="range"
            min={24}
            max={120}
            value={store.arabicFontSize}
            onChange={(e) => store.setArabicFontSize(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400">English Translation</label>
          <button
            onClick={() => store.setTranslationEnabled(!store.translationEnabled)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              store.translationEnabled ? "bg-emerald-500" : "bg-white/20"
            }`}
            role="switch"
            aria-checked={store.translationEnabled}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                store.translationEnabled ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>

        {store.translationEnabled && (
          <>
            <div>
              <label className="mb-2 block text-xs text-gray-500">
                Translation Size — {store.translationFontSize}px
              </label>
              <input
                type="range"
                min={12}
                max={64}
                value={store.translationFontSize}
                onChange={(e) => store.setTranslationFontSize(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs text-gray-500">Translation Font</label>
              <select
                value={store.translationFont}
                onChange={(e) => store.setTranslationFont(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
              >
                {[
                  { value: "serif", label: "Georgia (Serif)" },
                  { value: "sans-serif", label: "Arial (Sans)" },
                  { value: "cinzel", label: "Cinzel" },
                  { value: "times-new-roman", label: "Times New Roman" },
                  { value: "lora", label: "Lora" },
                  { value: "playfair-display", label: "Playfair Display" },
                ].map((f) => (
                  <option key={f.value} value={f.value} className="bg-[#1a1a1a]">
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="mb-2 block text-xs text-gray-500">Text Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={store.textColor}
              onChange={(e) => store.setTextColor(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent"
            />
            <span className="text-sm text-gray-400">{store.textColor}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400">Text Shadow</label>
          <button
            onClick={() =>
              store.setTextShadow({ ...store.textShadow, enabled: !store.textShadow.enabled })
            }
            className={`relative h-6 w-11 rounded-full transition-colors ${
              store.textShadow.enabled ? "bg-emerald-500" : "bg-white/20"
            }`}
            role="switch"
            aria-checked={store.textShadow.enabled}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                store.textShadow.enabled ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>

        {store.textShadow.enabled && (
          <div>
            <label className="mb-2 block text-xs text-gray-500">
              Shadow Blur — {store.textShadow.blur}px
            </label>
            <input
              type="range"
              min={0}
              max={20}
              value={store.textShadow.blur}
              onChange={(e) =>
                store.setTextShadow({
                  ...store.textShadow,
                  blur: Number(e.target.value),
                })
              }
              className="w-full accent-emerald-500"
            />
          </div>
        )}
      </Section>

      {/* Background */}
      <Section title="Background">
        <div>
          <label className="mb-2 block text-xs text-gray-500">
            Dark Overlay — {store.overlayOpacity}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={store.overlayOpacity}
            onChange={(e) => store.setOverlayOpacity(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
        </div>

        <BackgroundPicker value={store.background} onChange={store.setBackground} />
      </Section>

      {/* Export */}
      <div className="pt-4">
        <ExportButton />
      </div>
    </div>
  );
}
