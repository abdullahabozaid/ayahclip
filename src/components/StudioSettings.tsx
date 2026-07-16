"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { FormatSelector } from "./FormatSelector";
import { BackgroundPicker } from "./BackgroundPicker";
import { ExportButton } from "./ExportButton";
import { StylePanel } from "./StylePanel";
import { EmphasisPanel } from "./EmphasisPanel";
import { TRANSLATION_LANGUAGES } from "@/lib/translations";
import { getProject, saveProject } from "@/lib/projects";
import { BackgroundThumb } from "./BackgroundThumb";
import { sequenceDuration } from "@/lib/background-sequence";

/** Capture the current preview frame as the clip's dashboard cover thumbnail. */
function SetCoverButton() {
  const projectId = useAppStore((s) => s.projectId);
  const [label, setLabel] = useState("Set as cover");
  const onClick = async () => {
    if (!projectId) return;
    const canvas = document.querySelector("section canvas") as HTMLCanvasElement | null;
    if (!canvas || !canvas.width) return;
    const w = 480;
    const h = Math.round((canvas.height / canvas.width) * w);
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    off.getContext("2d")!.drawImage(canvas, 0, 0, w, h);
    const thumbnail = off.toDataURL("image/jpeg", 0.85);
    const p = await getProject(projectId);
    if (!p) return;
    await saveProject({ ...p, thumbnail, updatedAt: Date.now() });
    setLabel("Cover set ✓");
    setTimeout(() => setLabel("Set as cover"), 1600);
  };
  return (
    <button onClick={onClick} className="btn-ghost mb-2 w-full rounded-xl py-2.5 text-xs">
      📸 {label}
    </button>
  );
}

const WEIGHT_OPTIONS = [
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 700, label: "Bold" },
];

function WeightControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (w: number) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-[var(--muted)]">{label}</p>
      <div className="flex gap-2">
        {WEIGHT_OPTIONS.map((w) => (
          <button
            key={w.value}
            onClick={() => onChange(w.value)}
            style={{ fontWeight: w.value }}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
              value === w.value
                ? "border-[var(--gold)] bg-[var(--gold)]/10 text-parchment"
                : "border-[var(--hairline-soft)] text-[var(--muted)] hover:border-[var(--hairline)]"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const TRANSLATION_FONT_OPTIONS = [
  { value: "serif", label: "Georgia (Serif)" },
  { value: "sans-serif", label: "Arial (Sans)" },
  { value: "cinzel", label: "Cinzel" },
  { value: "times-new-roman", label: "Times New Roman" },
  { value: "lora", label: "Lora" },
  { value: "playfair-display", label: "Playfair Display" },
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
    <div className="border-b border-[var(--hairline-soft)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4"
      >
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-gold-soft/80">
          {title}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="space-y-4 pb-5">{children}</div>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-parchment">{label}</span>
      <button
        onClick={onChange}
        role="switch"
        aria-checked={checked}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-[var(--gold)]" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "px",
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  display?: (v: number) => string;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs text-[var(--muted)]">{label}</label>
        <span className="font-display text-sm text-gold-soft">
          {display ? display(value) : `${value}${suffix}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-gold w-full"
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-2 block text-xs text-[var(--muted)]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field w-full px-3 py-2.5 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[var(--surface)]">
            {o.label}
          </option>
        ))}
      </select>
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
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5">
        {/* Clip summary */}
        <div className="border-b border-[var(--hairline-soft)] py-5">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-soft/70">
            Surah {store.surah?.id}
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-wide text-parchment">
            {store.surah?.name_simple ?? "—"}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {selectedCount} verse{selectedCount !== 1 ? "s" : ""}
            {selectedCount > 0 && (
              <span className="ml-2 text-gold-soft">{durationLabel}</span>
            )}
          </p>
        </div>

        {/* Saved layout presets (font size, position, line height — no colors) */}
        <Section title="Presets">
          <StylePanel />
        </Section>

        {/* Audio */}
        <Section title="Audio">
          {store.audioSource.mode === "imported" ? (
            <div className="rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-3">
              <p className="text-xs text-gold-soft/80">Imported audio</p>
              <p className="mt-1 truncate text-sm text-parchment">{store.audioSource.name}</p>
              <p className="mt-1 text-[11px] text-[var(--muted-deep)]">
                Verses are timed from this track. Switch back to a reciter to use EveryAyah audio.
              </p>
              <button
                onClick={store.clearImportedAudio}
                className="btn-ghost mt-2 rounded-full px-3 py-1.5 text-xs"
              >
                Use a reciter instead
              </button>
            </div>
          ) : (
            <Field
              label="Reciter"
              value={store.reciterId}
              onChange={store.setReciterId}
              options={reciters.map((r) => ({ value: r.id, label: r.name }))}
            />
          )}
        </Section>

        {/* Format */}
        <Section title="Format">
          <FormatSelector value={store.videoFormat} onChange={store.setVideoFormat} />

          {store.videoFormat === "9:16" && (
            <div>
              <p className="mb-2 text-xs text-[var(--muted)]">Keep text in safe zone</p>
              <div className="flex gap-2">
                {([
                  { id: "none", label: "Off" },
                  { id: "tiktok", label: "TikTok" },
                  { id: "reels", label: "Reels" },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => store.setSafeAreaTarget(opt.id)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                      store.safeAreaTarget === opt.id
                        ? "border-[var(--gold)] bg-[var(--gold)]/10 text-parchment"
                        : "border-[var(--hairline-soft)] text-[var(--muted)] hover:border-[var(--hairline)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--muted-deep)]">
                Pulls text clear of the likes, caption &amp; UI for that platform.
              </p>

              {store.safeAreaTarget !== "none" && (
                <div className="mt-3 border-t border-[var(--hairline-soft)] pt-3">
                  <Slider
                    label="Extra Padding (advanced)"
                    value={store.safePadding}
                    min={0}
                    max={15}
                    suffix="%"
                    onChange={store.setSafePadding}
                  />
                </div>
              )}
            </div>
          )}

          {store.videoFormat === "9:16" && (
            <div className="space-y-3 pt-1">
              <Toggle
                label="Letterbox (16:9 in 9:16)"
                checked={store.letterbox.enabled}
                onChange={() =>
                  store.setLetterbox({ ...store.letterbox, enabled: !store.letterbox.enabled })
                }
              />
              {store.letterbox.enabled && (
                <>
                  <div>
                    <p className="mb-2 text-xs text-[var(--muted)]">Bar Style</p>
                    <div className="flex gap-2">
                      {(["solid", "blur", "gradient"] as const).map((style) => (
                        <button
                          key={style}
                          onClick={() => store.setLetterbox({ ...store.letterbox, barStyle: style })}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs capitalize transition-colors ${
                            store.letterbox.barStyle === style
                              ? "border-[var(--gold)] bg-[var(--gold)]/10 text-parchment"
                              : "border-[var(--hairline-soft)] text-[var(--muted)] hover:border-[var(--hairline)]"
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                  {store.letterbox.barStyle === "solid" && (
                    <ColorRow
                      label="Bar Color"
                      value={store.letterbox.barColor}
                      onChange={(c) => store.setLetterbox({ ...store.letterbox, barColor: c })}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </Section>

        {/* Typography */}
        <Section title="Typography">
          <div>
            <p className="mb-2 text-xs text-[var(--muted)]">Caption content</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "both", label: "Both" },
                { id: "arabic", label: "Arabic" },
                { id: "translation", label: "English" },
              ] as const).map((option) => {
                const active = option.id === "both"
                  ? store.arabicEnabled && store.translationEnabled
                  : option.id === "arabic"
                    ? store.arabicEnabled && !store.translationEnabled
                    : !store.arabicEnabled && store.translationEnabled;
                return (
                  <button
                    key={option.id}
                    onClick={() => {
                      store.setArabicEnabled(option.id !== "translation");
                      store.setTranslationEnabled(option.id !== "arabic");
                    }}
                    className={`min-h-10 rounded-lg border px-2 text-xs transition-colors ${active
                      ? "border-[var(--gold)] bg-[var(--gold)]/10 text-parchment"
                      : "border-[var(--hairline-soft)] text-[var(--muted)] hover:border-[var(--hairline)]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-[var(--muted)]">Text composition</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "center", label: "Centered" },
                { id: "left-panel", label: "Left fade" },
              ] as const).map((option) => (
                <button
                  key={option.id}
                  onClick={() => store.setTextLayout(option.id)}
                  className={`min-h-10 rounded-lg border px-3 text-xs transition-colors ${
                    store.textLayout === option.id
                      ? "border-[var(--gold)] bg-[var(--gold)]/10 text-parchment"
                      : "border-[var(--hairline-soft)] text-[var(--muted)] hover:border-[var(--hairline)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {store.textLayout === "left-panel" && (
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                Keeps the reciter visible on the right and lays the verse over a black-to-video fade.
              </p>
            )}
          </div>
          <Slider
            label="Arabic Size"
            value={store.arabicFontSize}
            min={8}
            max={120}
            onChange={store.setArabicFontSize}
          />
          <WeightControl
            label="Arabic Weight"
            value={store.arabicFontWeight}
            onChange={store.setArabicFontWeight}
          />
          <Toggle
            label="Verse Number (Arabic)"
            checked={store.arabicVerseNumber}
            onChange={() => store.setArabicVerseNumber(!store.arabicVerseNumber)}
          />
          {store.audioSource.mode === "imported" && (
            <Toggle
              label="Word-by-word highlight (on play)"
              checked={store.wordHighlight}
              onChange={() => store.setWordHighlight(!store.wordHighlight)}
            />
          )}
          <Field
            label="Verse Intro"
            value={store.verseIntro}
            onChange={(v) => store.setVerseIntro(v as typeof store.verseIntro)}
            options={[
              { value: "none", label: "None" },
              { value: "fade", label: "Fade in" },
              { value: "blur", label: "Blur in" },
              { value: "slide", label: "Slide up" },
              { value: "scale", label: "Scale in" },
            ]}
          />
          {store.verseIntro !== "none" && (
            <Slider
              label="Intro Speed"
              value={store.verseIntroMs}
              min={150}
              max={1200}
              step={50}
              suffix="ms"
              onChange={store.setVerseIntroMs}
            />
          )}
          {/* Clip-start fade: whole picture + verse ease in from black once, at
              the very beginning of the clip. */}
          <Slider
            label="Clip Start Fade"
            value={store.clipFadeMs}
            min={0}
            max={1500}
            step={50}
            suffix="ms"
            display={(v) => (v === 0 ? "Off" : `${v}ms`)}
            onChange={store.setClipFadeMs}
          />
          {store.clipFadeMs > 0 && (
            <Toggle
              label="Fade in audio too"
              checked={store.audioFadeIn}
              onChange={() => store.setAudioFadeIn(!store.audioFadeIn)}
            />
          )}
          <Slider
            label="Arabic Line Height"
            value={store.lineHeight}
            min={0.7}
            max={2}
            step={0.05}
            display={(v) => `${v.toFixed(2)}×`}
            onChange={store.setLineHeight}
          />
          <Slider
            label="Vertical Position"
            value={store.textPosition}
            min={0}
            max={100}
            suffix="%"
            onChange={store.setTextPosition}
          />

          {store.translationEnabled && (
            <>
              <Slider
                label="Translation Line Height"
                value={store.translationLineHeight}
                min={0.7}
                max={2}
                step={0.05}
                display={(v) => `${v.toFixed(2)}×`}
                onChange={store.setTranslationLineHeight}
              />
              <Slider
                label="Arabic–Translation Gap"
                value={store.arabicTranslationGap}
                min={0}
                max={2}
                step={0.05}
                display={(v) => `${v.toFixed(2)}×`}
                onChange={store.setArabicTranslationGap}
              />
            </>
          )}
          {store.translationEnabled && (
            <Toggle
              label="Verse Number (Translation)"
              checked={store.translationVerseNumber}
              onChange={() => store.setTranslationVerseNumber(!store.translationVerseNumber)}
            />
          )}

          {store.translationEnabled && (
            <>
              <Field
                label="Language"
                value={store.translationLanguage}
                onChange={store.setTranslationLanguage}
                options={TRANSLATION_LANGUAGES.map((l) => ({ value: l.id, label: l.name }))}
              />
              <Slider
                label="Translation Size"
                value={store.translationFontSize}
                min={8}
                max={64}
                onChange={store.setTranslationFontSize}
              />
              <Field
                label="Translation Font"
                value={store.translationFont}
                onChange={store.setTranslationFont}
                options={TRANSLATION_FONT_OPTIONS}
              />
              <WeightControl
                label="Translation Weight"
                value={store.translationFontWeight}
                onChange={store.setTranslationFontWeight}
              />
            </>
          )}

          <ColorRow label="Text Color" value={store.textColor} onChange={store.setTextColor} />

          <Toggle
            label="Text Shadow"
            checked={store.textShadow.enabled}
            onChange={() =>
              store.setTextShadow({ ...store.textShadow, enabled: !store.textShadow.enabled })
            }
          />
          {store.textShadow.enabled && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => store.setTextShadow({ enabled: true, color: "#000000", blur: 8, offsetX: 0, offsetY: 2 })}
                  className="rounded-lg border border-[var(--hairline-soft)] px-3 py-2 text-xs text-[var(--muted)] hover:border-[var(--hairline)] hover:text-parchment"
                >
                  Dark lift
                </button>
                <button
                  onClick={() => store.setTextShadow({ enabled: true, color: "#ffffff", blur: 12, offsetX: 0, offsetY: 0 })}
                  className="rounded-lg border border-[var(--hairline-soft)] px-3 py-2 text-xs text-[var(--muted)] hover:border-[var(--hairline)] hover:text-parchment"
                >
                  White glow
                </button>
              </div>
              <ColorRow
                label="Shadow / Glow Color"
                value={store.textShadow.color}
                onChange={(color) => store.setTextShadow({ ...store.textShadow, color })}
              />
              <Slider
                label="Shadow / Glow Blur"
                value={store.textShadow.blur}
                min={0}
                max={24}
                onChange={(n) => store.setTextShadow({ ...store.textShadow, blur: n })}
              />
            </div>
          )}

          {/* Continuous highlight bar behind each Arabic line */}
          <Toggle
            label="Highlight behind Arabic"
            checked={store.highlightEnabled}
            onChange={() => store.setHighlightEnabled(!store.highlightEnabled)}
          />
          {store.highlightEnabled && (
            <>
              <ColorRow
                label="Highlight Color"
                value={store.highlightColor}
                onChange={store.setHighlightColor}
              />
              <Slider
                label="Highlight Opacity"
                value={store.highlightOpacity}
                min={0.1}
                max={1}
                step={0.05}
                display={(v) => `${Math.round(v * 100)}%`}
                onChange={store.setHighlightOpacity}
              />
              <Slider
                label="Highlight Roundness"
                value={store.highlightRadius}
                min={0}
                max={1}
                step={0.05}
                display={(v) => `${Math.round(v * 100)}%`}
                onChange={store.setHighlightRadius}
              />
              <Slider
                label="Highlight Height"
                value={store.highlightHeight}
                min={0.15}
                max={1}
                step={0.05}
                display={(v) => (v >= 1 ? "Full" : `${Math.round(v * 100)}%`)}
                onChange={store.setHighlightHeight}
              />
              <Slider
                label="Highlight Padding"
                value={store.highlightPadding}
                min={0}
                max={0.8}
                step={0.05}
                display={(v) => `${Math.round(v * 100)}%`}
                onChange={store.setHighlightPadding}
              />
            </>
          )}
        </Section>

        {/* Word emphasis */}
        <Section title="Word Emphasis" defaultOpen={false}>
          <EmphasisPanel />
        </Section>

        {/* Background */}
        <Section title="Background">
          <div className="mb-4 border-b border-[var(--hairline-soft)] pb-4">
            <Toggle
              label="B-roll sequence"
              checked={store.backgroundSequenceEnabled}
              onChange={() => store.setBackgroundSequenceEnabled(!store.backgroundSequenceEnabled)}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
              Rotate through several images or videos. The sequence loops if the recitation runs longer.
            </p>

            {store.backgroundSequenceEnabled && (
              <div className="mt-3 space-y-3">
                <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
                  {store.backgroundScenes.map((scene, index) => {
                    const active = scene.id === store.activeBackgroundSceneId;
                    return (
                      <button
                        key={scene.id}
                        onClick={() => store.selectBackgroundScene(scene.id)}
                        className={`relative h-16 min-w-20 overflow-hidden rounded-lg border transition-colors ${active
                          ? "border-[var(--gold)]"
                          : "border-[var(--hairline-soft)] hover:border-[var(--hairline)]"
                        }`}
                        aria-label={`Edit B-roll scene ${index + 1}`}
                      >
                        <BackgroundThumb background={scene.background} />
                        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-[var(--ink-deep)]/90 px-1.5 py-1 text-[10px] text-parchment">
                          <span>{index + 1}</span>
                          <span className="tabular-nums text-[var(--muted)]">{scene.duration.toFixed(1)}s</span>
                        </span>
                      </button>
                    );
                  })}
                  <div className="flex min-w-24 items-center justify-center rounded-lg border border-dashed border-[var(--hairline-soft)] px-2 text-center text-[10px] leading-tight text-[var(--muted)]">
                    Pick media below to add
                  </div>
                </div>

                {(() => {
                  const active = store.backgroundScenes.find((scene) => scene.id === store.activeBackgroundSceneId);
                  if (!active) return null;
                  const index = store.backgroundScenes.findIndex((scene) => scene.id === active.id);
                  return (
                    <div className="space-y-3 rounded-xl bg-[var(--ink-deep)] px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-parchment">Scene {index + 1}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => store.moveBackgroundScene(active.id, -1)}
                            disabled={index === 0}
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline-soft)] text-[var(--muted)] disabled:opacity-30"
                            aria-label="Move scene earlier"
                          >←</button>
                          <button
                            onClick={() => store.moveBackgroundScene(active.id, 1)}
                            disabled={index === store.backgroundScenes.length - 1}
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline-soft)] text-[var(--muted)] disabled:opacity-30"
                            aria-label="Move scene later"
                          >→</button>
                          <button
                            onClick={() => store.removeBackgroundScene(active.id)}
                            className="h-9 rounded-full border border-[var(--hairline-soft)] px-3 text-[11px] text-[var(--muted)] hover:text-red-300"
                          >Remove</button>
                        </div>
                      </div>
                      <Slider
                        label="Scene duration"
                        value={active.duration}
                        min={1}
                        max={30}
                        step={0.5}
                        suffix="s"
                        onChange={(duration) => store.updateBackgroundScene(active.id, { duration })}
                      />
                      <Field
                        label="Transition"
                        value={active.transition}
                        onChange={(transition) => store.updateBackgroundScene(active.id, {
                          transition: transition as typeof active.transition,
                        })}
                        options={[
                          { value: "cut", label: "Clean cut" },
                          { value: "crossfade", label: "Crossfade" },
                        ]}
                      />
                      {active.transition === "crossfade" && (
                        <Slider
                          label="Crossfade"
                          value={active.transitionDuration}
                          min={0.2}
                          max={2}
                          step={0.1}
                          suffix="s"
                          onChange={(transitionDuration) => store.updateBackgroundScene(active.id, { transitionDuration })}
                        />
                      )}
                      <p className="text-[10px] tabular-nums text-[var(--muted-deep)]">
                        Sequence length {sequenceDuration(store.backgroundScenes).toFixed(1)}s
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Fit: Fill crops to fill the frame; Fit shows the whole video/image
              centered with rounded corners over a blurred backdrop. */}
          <div className="mb-3">
            <span className="mb-1.5 block text-xs text-[var(--muted)]">Media Fit</span>
            <div className="flex gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1">
              {([
                { id: "cover", label: "Fill (crop)" },
                { id: "contain", label: "Fit (whole)" },
              ] as const).map((o) => (
                <button
                  key={o.id}
                  onClick={() => store.setBackgroundFit(o.id)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs transition-colors ${
                    store.backgroundFit === o.id
                      ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                      : "text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {store.backgroundFit === "contain" && (
            <div className="mb-3">
              <span className="mb-1.5 block text-xs text-[var(--muted)]">Backdrop</span>
              <div className="flex gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1">
                {([
                  { id: "blur", label: "Blurred" },
                  { id: "black", label: "Black" },
                ] as const).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => store.setFitBackdrop(o.id)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-xs transition-colors ${
                      store.fitBackdrop === o.id
                        ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                        : "text-[var(--muted)] hover:text-parchment"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(store.background.type === "image" || store.background.type === "video") && store.backgroundFit === "cover" && (
            <div className="mb-4 space-y-3 border-t border-[var(--hairline-soft)] pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-parchment">Frame the media</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">Zoom and choose which part stays visible.</p>
                </div>
                <button
                  onClick={() => store.setMediaTransform({ scale: 1, x: 0, y: 0 })}
                  className="rounded-full border border-[var(--hairline-soft)] px-2.5 py-1 text-[11px] text-[var(--muted)] hover:text-parchment"
                >
                  Reset
                </button>
              </div>
              <Slider
                label="Zoom"
                value={store.mediaTransform.scale}
                min={1}
                max={3}
                step={0.05}
                display={(v) => `${v.toFixed(2)}×`}
                onChange={(scale) => store.setMediaTransform({ ...store.mediaTransform, scale })}
              />
              <Slider
                label="Horizontal focus"
                value={store.mediaTransform.x * 100}
                min={-100}
                max={100}
                step={1}
                display={(v) => v === 0 ? "Center" : v < 0 ? `${Math.abs(v)}% left` : `${v}% right`}
                onChange={(x) => store.setMediaTransform({ ...store.mediaTransform, x: x / 100 })}
              />
              <Slider
                label="Vertical focus"
                value={store.mediaTransform.y * 100}
                min={-100}
                max={100}
                step={1}
                display={(v) => v === 0 ? "Center" : v < 0 ? `${Math.abs(v)}% up` : `${v}% down`}
                onChange={(y) => store.setMediaTransform({ ...store.mediaTransform, y: y / 100 })}
              />
            </div>
          )}

          {store.background.type === "video" && store.audioSource.mode === "imported" && (
            <div className="mb-3">
              <Toggle
                label="Sync video to recitation"
                checked={store.backgroundVideoSync}
                onChange={() => store.setBackgroundVideoSync(!store.backgroundVideoSync)}
              />
            </div>
          )}

          {store.background.type === "video" && (
            <div className="mb-3">
              <span className="mb-1.5 block text-xs text-[var(--muted)]">When the video ends</span>
              <div className="flex gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1">
                {([
                  { id: "loop", label: "Loop" },
                  { id: "freeze", label: "Freeze last frame" },
                ] as const).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => store.setVideoLoopMode(o.id)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-xs transition-colors ${
                      store.videoLoopMode === o.id
                        ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                        : "text-[var(--muted)] hover:text-parchment"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Slider
            label="Overlay Strength"
            value={store.overlayOpacity}
            min={0}
            max={100}
            suffix="%"
            onChange={store.setOverlayOpacity}
          />
          <ColorRow label="Overlay Color" value={store.overlayColor} onChange={store.setOverlayColor} />
          <p className="mb-2 text-[11px] text-[var(--muted)]">
            {store.backgroundSequenceEnabled ? "Choose media to add as a new scene" : "Choose one background"}
          </p>
          <BackgroundPicker
            value={store.background}
            onChange={store.backgroundSequenceEnabled ? store.addBackgroundScene : store.setBackground}
            revokePrevious={!store.backgroundSequenceEnabled}
          />
        </Section>
      </div>

      {/* Export — pinned */}
      <div className="border-t border-[var(--hairline-soft)] bg-[var(--ink)] p-5">
        <SetCoverButton />
        <ExportButton />
      </div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-[var(--muted)]">{label}</label>
      <div className="flex items-center gap-2">
        <span className="text-sm tabular-nums text-[var(--muted)]">{value}</span>
        <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-[var(--hairline)]">
          <span className="absolute inset-0" style={{ background: value }} />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
