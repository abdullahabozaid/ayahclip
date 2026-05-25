"use client";

import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { FormatSelector } from "./FormatSelector";
import { BackgroundPicker } from "./BackgroundPicker";
import { ExportButton } from "./ExportButton";

export function StudioSettings() {
  const store = useAppStore();
  const selectedCount = store.selectedVerseNumbers.length;

  return (
    <div className="space-y-6 overflow-y-auto">
      <div>
        <p className="text-xs text-gray-400">Surah {store.surah?.id}</p>
        <h2 className="text-xl font-bold">{store.surah?.name_simple ?? "—"}</h2>
        <p className="text-sm text-gray-400">{selectedCount} verses selected</p>
      </div>

      <hr className="border-white/10" />

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Reciter
        </label>
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

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Video Format
        </label>
        <FormatSelector value={store.videoFormat} onChange={store.setVideoFormat} />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Arabic Text Size — {store.arabicFontSize}px
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
        <label className="text-xs font-medium uppercase tracking-wider text-gray-400">
          English Translation
        </label>
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
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
              Translation Size — {store.translationFontSize}px
            </label>
            <input
              type="range"
              min={16}
              max={64}
              value={store.translationFontSize}
              onChange={(e) => store.setTranslationFontSize(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
              Translation Font
            </label>
            <div className="flex gap-2">
              {["serif", "sans-serif"].map((font) => (
                <button
                  key={font}
                  onClick={() => store.setTranslationFont(font)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                    store.translationFont === font
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-white/10 hover:bg-white/10"
                  }`}
                >
                  {font === "serif" ? "Serif" : "Sans"}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Text Color
        </label>
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

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
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

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Background
        </label>
        <BackgroundPicker value={store.background} onChange={store.setBackground} />
      </div>

      <ExportButton />
    </div>
  );
}
