"use client";

// My Styles: create, preview, and manage styles WITHOUT having a clip open.
// Every preview renders a sample verse through the real drawScene pipeline at
// export resolution, so what you see here is exactly what a clip will look like.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StyleSettings, stripBackgroundKeys } from "@/lib/style";
import {
  SavedStyle,
  getSavedStyles,
  saveStyle,
  updateSavedStyle,
  deleteSavedStyle,
} from "@/lib/saved-styles";
import { drawScene, FORMAT_SIZES, SceneStyleSource } from "@/lib/render-core";
import { ensureFontsReady, TRANSLATION_FONTS } from "@/lib/canvas-utils";
import { useAppStore } from "@/lib/store";
import { fetchVerses } from "@/lib/api";

// Sample verses for previews, in three lengths so multi-line layout (gaps,
// highlight bars, verse numbers) can be checked. The short one is inlined as
// an instant fallback; all texts are replaced by the REAL Quran.com text on
// load — sample text is never hand-typed beyond the basmala.
export interface SampleVerse {
  label: string;
  arabicText: string;
  translation?: string;
  verseNumber: number;
}

const FALLBACK_SAMPLE: SampleVerse = {
  label: "Short",
  arabicText: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
  translation: "In the name of Allah, the Entirely Merciful, the Especially Merciful.",
  verseNumber: 1,
};

// surah:verse to use for each length tier.
const SAMPLE_SOURCES: { label: string; surah: number; verse: number }[] = [
  { label: "Short", surah: 1, verse: 1 },   // basmala — one line
  { label: "Medium", surah: 1, verse: 7 },  // ~two lines at default size
  { label: "Long", surah: 59, verse: 23 },  // ~three+ lines at default size
];

let samplesPromise: Promise<SampleVerse[]> | null = null;
function loadSamples(): Promise<SampleVerse[]> {
  if (!samplesPromise) {
    samplesPromise = Promise.all(
      SAMPLE_SOURCES.map(async (src) => {
        const verses = await fetchVerses(src.surah);
        const v = verses.find((x) => x.verse_number === src.verse);
        if (!v) throw new Error(`sample ${src.surah}:${src.verse} missing`);
        return {
          label: src.label,
          arabicText: v.text_uthmani,
          translation: v.translation,
          verseNumber: v.verse_number,
        };
      })
    ).catch((err) => {
      console.warn("Could not load sample verses; falling back to basmala", err);
      samplesPromise = null;
      return [FALLBACK_SAMPLE];
    });
  }
  return samplesPromise;
}

const DEFAULT_STYLE: StyleSettings = {
  arabicFont: "uthmanic-hafs",
  arabicFontSize: 30,
  arabicFontWeight: 400,
  arabicVerseNumber: false,
  translationVerseNumber: true,
  lineHeight: 1,
  translationLineHeight: 1,
  arabicTranslationGap: 0.6,
  textPosition: 50,
  translationEnabled: true,
  translationFont: "sans-serif",
  translationFontSize: 14,
  translationFontWeight: 400,
  textColor: "#ffffff",
  overlayOpacity: 50,
  overlayColor: "#000000",
  textShadow: { enabled: true, color: "#000000", blur: 4, offsetX: 0, offsetY: 2 },
  highlightEnabled: false,
  highlightColor: "#1f2a44",
  highlightOpacity: 1,
  highlightRadius: 1,
  highlightPadding: 0.25,
  highlightHeight: 1,
  background: {
    type: "gradient",
    value: "linear-gradient(160deg, #1a1a2e 0%, #0a0a0a 100%)",
    label: "Midnight",
  },
  verseIntro: "none",
  verseIntroMs: 450,
  letterbox: { enabled: false, barColor: "#000000", barStyle: "solid" },
};

function toScene(style: StyleSettings): SceneStyleSource {
  return {
    ...style,
    arabicVerseNumber: style.arabicVerseNumber ?? false,
    translationVerseNumber: style.translationVerseNumber ?? true,
    lineHeight: style.lineHeight ?? 1,
    translationLineHeight: style.translationLineHeight ?? 1,
    arabicTranslationGap: style.arabicTranslationGap ?? 0.6,
    videoFormat: "9:16",
    safeAreaTarget: "none",
    safePadding: 0,
    emphasisStyle: "color",
    emphasisColor: "#c9a24b",
  };
}

function StylePreview({
  style,
  sample,
  replayToken = 0,
  className,
  onDoubleClick,
}: {
  style: StyleSettings;
  sample?: SampleVerse;
  /** Bump to replay the verse-intro animation in the preview. */
  replayToken?: number;
  className?: string;
  onDoubleClick?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const verse = sample ?? FALLBACK_SAMPLE;

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    const drawAt = (introProgress: number) => {
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const size = FORMAT_SIZES["9:16"];
      if (canvas.width !== size.w) canvas.width = size.w;
      if (canvas.height !== size.h) canvas.height = size.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawScene(ctx, toScene(style), {
        arabicText: verse.arabicText,
        verseNumber: verse.verseNumber,
        translation: style.translationEnabled ? verse.translation : undefined,
        isLastPart: true,
        introProgress,
      });
    };
    const start = () => {
      // Animate the intro (fade/blur/slide/scale) whenever the style or replay
      // token changes, so the user actually SEES the entrance they configured.
      if ((style.verseIntro ?? "none") === "none") {
        drawAt(1);
        return;
      }
      const ms = style.verseIntroMs ?? 450;
      const t0 = performance.now();
      const tick = () => {
        if (cancelled) return;
        const p = Math.min(1, (performance.now() - t0) / ms);
        drawAt(p);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    ensureFontsReady(style.arabicFont, style.translationFont).then(() => {
      if (!cancelled) start();
    });
    drawAt((style.verseIntro ?? "none") === "none" ? 1 : 0);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [style, verse, replayToken]);

  return (
    <canvas
      ref={canvasRef}
      onDoubleClick={onDoubleClick}
      className={className ?? "h-full w-full"}
    />
  );
}

export default function StylesPage() {
  const router = useRouter();
  const applyStyle = useAppStore((s) => s.applyStyle);
  // Saved styles live in localStorage; reading them during render would make
  // the server HTML differ from the client (hydration error). Load after mount.
  const [styles, setStyles] = useState<SavedStyle[]>([]);
  const [stylesLoaded, setStylesLoaded] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; name: string; style: StyleSettings } | null>(null);
  const [samples, setSamples] = useState<SampleVerse[]>([FALLBACK_SAMPLE]);
  const [sampleIdx, setSampleIdx] = useState(0);
  const [replay, setReplay] = useState(0);
  const [fullscreenStyle, setFullscreenStyle] = useState<StyleSettings | null>(null);

  useEffect(() => {
    let on = true;
    // Microtask defer keeps this out of the synchronous effect body (lint) and
    // off the hydration pass.
    Promise.resolve().then(() => {
      if (!on) return;
      setStyles(getSavedStyles());
      setStylesLoaded(true);
    });
    loadSamples().then((sv) => {
      if (on && sv.length > 0) setSamples(sv);
    });
    return () => {
      on = false;
    };
  }, []);
  const sample = samples[Math.min(sampleIdx, samples.length - 1)];

  const duplicate = (sty: SavedStyle) =>
    setStyles(saveStyle(`${sty.name} copy`, { ...sty.settings }));

  const startNew = () =>
    setEditing({ id: null, name: "", style: { ...DEFAULT_STYLE } });

  const startEdit = (s: SavedStyle) =>
    setEditing({ id: s.id, name: s.name, style: { ...DEFAULT_STYLE, ...s.settings } });

  const saveEditing = () => {
    if (!editing) return;
    const settings = stripBackgroundKeys(editing.style);
    if (editing.id) {
      setStyles(updateSavedStyle(editing.id, { name: editing.name || "Untitled", settings }));
    } else {
      setStyles(saveStyle(editing.name, settings));
    }
    setEditing(null);
  };

  const applyToStudio = (settings: Partial<StyleSettings>) => {
    // Strip defensively too: styles saved before this rule carried a background.
    applyStyle(stripBackgroundKeys(settings));
    router.push("/studio");
  };

  const set = <K extends keyof StyleSettings>(key: K, value: StyleSettings[K]) =>
    setEditing((e) => (e ? { ...e, style: { ...e.style, [key]: value } } : e));

  // Full-screen look at any style — double-click a preview or use the ⛶ button.
  const fullscreenOverlay = fullscreenStyle && (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/95 p-4"
      onClick={() => setFullscreenStyle(null)}
    >
      <div
        className="h-[85vh] overflow-hidden rounded-2xl border border-[var(--hairline-soft)]"
        style={{ aspectRatio: "9 / 16" }}
        onClick={(e) => e.stopPropagation()}
      >
        <StylePreview style={fullscreenStyle} sample={sample} replayToken={replay} />
      </div>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {samples.length > 1 &&
          samples.map((sv, i) => (
            <button
              key={sv.label}
              onClick={() => setSampleIdx(i)}
              className={`rounded-full px-3 py-1.5 text-xs ${
                i === sampleIdx
                  ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                  : "bg-white/10 text-white/70 hover:text-white"
              }`}
            >
              {sv.label}
            </button>
          ))}
        {(fullscreenStyle.verseIntro ?? "none") !== "none" && (
          <button
            onClick={() => setReplay((n) => n + 1)}
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white"
          >
            ↺ Replay intro
          </button>
        )}
        <button
          onClick={() => setFullscreenStyle(null)}
          className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white"
        >
          Close
        </button>
      </div>
    </div>
  );

  if (editing) {
    const st = editing.style;
    return (
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-8">
        {fullscreenOverlay}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-3xl text-parchment">
            {editing.id ? "Edit style" : "New style"}
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(null)}
              className="rounded-full px-4 py-2 text-sm text-[var(--muted)] hover:text-parchment"
            >
              Cancel
            </button>
            <button onClick={saveEditing} className="btn-gold rounded-full px-5 py-2 text-sm">
              Save style
            </button>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-[320px_1fr]">
          {/* Live preview */}
          <div className="mx-auto w-full max-w-[320px] md:sticky md:top-24 md:self-start">
            <div className="overflow-hidden rounded-2xl border border-[var(--hairline-soft)]">
              <StylePreview
                style={st}
                sample={sample}
                replayToken={replay}
                className="block aspect-[9/16] w-full cursor-zoom-in"
                onDoubleClick={() => setFullscreenStyle(st)}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              {samples.map((sv, i) => (
                <button
                  key={sv.label}
                  onClick={() => setSampleIdx(i)}
                  className={`rounded-full px-3 py-1 text-[11px] ${
                    i === sampleIdx
                      ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                      : "border border-[var(--hairline-soft)] text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  {sv.label}
                </button>
              ))}
              {(st.verseIntro ?? "none") !== "none" && (
                <button
                  onClick={() => setReplay((n) => n + 1)}
                  className="rounded-full border border-[var(--hairline-soft)] px-3 py-1 text-[11px] text-gold-soft hover:text-gold"
                >
                  ↺ Replay
                </button>
              )}
              <button
                onClick={() => setFullscreenStyle(st)}
                className="rounded-full border border-[var(--hairline-soft)] px-3 py-1 text-[11px] text-[var(--muted)] hover:text-parchment"
              >
                ⛶ Full screen
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
              Real export renderer · double-click for full screen
            </p>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Style name…"
              className="field w-full px-3 py-2.5 text-sm"
            />

            <Row label="Arabic Size" v={`${st.arabicFontSize}px`}>
              <input type="range" min={16} max={64} value={st.arabicFontSize}
                onChange={(e) => set("arabicFontSize", Number(e.target.value))} className="slider-gold w-full" />
            </Row>
            <Row label="Arabic Line Height" v={`${st.lineHeight.toFixed(2)}×`}>
              <input type="range" min={0.7} max={2} step={0.05} value={st.lineHeight}
                onChange={(e) => set("lineHeight", Number(e.target.value))} className="slider-gold w-full" />
            </Row>
            <Row label="Vertical Position" v={`${st.textPosition}%`}>
              <input type="range" min={0} max={100} value={st.textPosition}
                onChange={(e) => set("textPosition", Number(e.target.value))} className="slider-gold w-full" />
            </Row>
            <ColorRow label="Text Color" value={st.textColor} onChange={(v) => set("textColor", v)} />
            <ToggleRow label="Text Shadow" checked={st.textShadow.enabled}
              onChange={() => set("textShadow", { ...st.textShadow, enabled: !st.textShadow.enabled })} />
            <ToggleRow label="Verse Number (Arabic ﴿١﴾)" checked={!!st.arabicVerseNumber}
              onChange={() => set("arabicVerseNumber", !st.arabicVerseNumber)} />
            <ToggleRow label="Verse Number (Translation)" checked={st.translationVerseNumber !== false}
              onChange={() => set("translationVerseNumber", st.translationVerseNumber === false)} />

            <div>
              <label className="mb-2 block text-xs text-[var(--muted)]">Verse Intro</label>
              <select
                value={st.verseIntro ?? "none"}
                onChange={(e) => set("verseIntro", e.target.value as StyleSettings["verseIntro"])}
                className="field w-full px-3 py-2.5 text-sm"
              >
                <option value="none">None</option>
                <option value="fade">Fade in</option>
                <option value="blur">Blur in</option>
                <option value="slide">Slide up</option>
                <option value="scale">Scale in</option>
              </select>
            </div>
            {(st.verseIntro ?? "none") !== "none" && (
              <Row label="Intro Speed" v={`${st.verseIntroMs ?? 450}ms`}>
                <input type="range" min={150} max={1200} step={50} value={st.verseIntroMs ?? 450}
                  onChange={(e) => set("verseIntroMs", Number(e.target.value))} className="slider-gold w-full" />
              </Row>
            )}

            <ToggleRow label="Translation" checked={st.translationEnabled}
              onChange={() => set("translationEnabled", !st.translationEnabled)} />
            {st.translationEnabled && (
              <>
                <Row label="Translation Size" v={`${st.translationFontSize}px`}>
                  <input type="range" min={8} max={40} value={st.translationFontSize}
                    onChange={(e) => set("translationFontSize", Number(e.target.value))} className="slider-gold w-full" />
                </Row>
                <Row label="Arabic–Translation Gap" v={`${(st.arabicTranslationGap ?? 0.6).toFixed(2)}×`}>
                  <input type="range" min={0} max={2} step={0.05} value={st.arabicTranslationGap ?? 0.6}
                    onChange={(e) => set("arabicTranslationGap", Number(e.target.value))} className="slider-gold w-full" />
                </Row>
                <div>
                  <label className="mb-2 block text-xs text-[var(--muted)]">Translation Font</label>
                  <select value={st.translationFont} onChange={(e) => set("translationFont", e.target.value)}
                    className="field w-full px-3 py-2.5 text-sm">
                    {Object.keys(TRANSLATION_FONTS).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <ToggleRow label="Highlight behind Arabic" checked={!!st.highlightEnabled}
              onChange={() => set("highlightEnabled", !st.highlightEnabled)} />
            {st.highlightEnabled && (
              <>
                <ColorRow label="Highlight Color" value={st.highlightColor ?? "#1f2a44"}
                  onChange={(v) => set("highlightColor", v)} />
                <Row label="Highlight Opacity" v={`${Math.round((st.highlightOpacity ?? 1) * 100)}%`}>
                  <input type="range" min={0.1} max={1} step={0.05} value={st.highlightOpacity ?? 1}
                    onChange={(e) => set("highlightOpacity", Number(e.target.value))} className="slider-gold w-full" />
                </Row>
                <Row label="Highlight Roundness" v={`${Math.round((st.highlightRadius ?? 1) * 100)}%`}>
                  <input type="range" min={0} max={1} step={0.05} value={st.highlightRadius ?? 1}
                    onChange={(e) => set("highlightRadius", Number(e.target.value))} className="slider-gold w-full" />
                </Row>
                <Row label="Highlight Height" v={(st.highlightHeight ?? 1) >= 1 ? "Full" : `${Math.round((st.highlightHeight ?? 1) * 100)}%`}>
                  <input type="range" min={0.15} max={1} step={0.05} value={st.highlightHeight ?? 1}
                    onChange={(e) => set("highlightHeight", Number(e.target.value))} className="slider-gold w-full" />
                </Row>
                <Row label="Highlight Padding" v={`${Math.round((st.highlightPadding ?? 0.25) * 100)}%`}>
                  <input type="range" min={0} max={0.8} step={0.05} value={st.highlightPadding ?? 0.25}
                    onChange={(e) => set("highlightPadding", Number(e.target.value))} className="slider-gold w-full" />
                </Row>
              </>
            )}

            <Row label="Overlay Darkness" v={`${st.overlayOpacity}%`}>
              <input type="range" min={0} max={100} value={st.overlayOpacity}
                onChange={(e) => set("overlayOpacity", Number(e.target.value))} className="slider-gold w-full" />
            </Row>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-8">
      {fullscreenOverlay}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl text-parchment">My Styles</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Design and keep styles without opening a clip — previews use the real export renderer.
          </p>
        </div>
        <button onClick={startNew} className="btn-gold rounded-full px-5 py-2 text-sm">
          + New style
        </button>
      </div>

      {stylesLoaded && styles.length === 0 ? (
        <div className="rounded-2xl border border-[var(--hairline-soft)] py-20 text-center">
          <p className="font-display text-xl text-parchment">No styles yet</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Create your first style and reuse it on any clip from the studio.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {styles.map((s) => (
            <div key={s.id}
              className="overflow-hidden rounded-2xl border border-[var(--hairline-soft)] bg-[var(--surface)]">
              <button
                onClick={() => startEdit(s)}
                onDoubleClick={() => setFullscreenStyle({ ...DEFAULT_STYLE, ...s.settings })}
                className="block aspect-[9/16] w-full"
                aria-label={`Edit ${s.name}`}
              >
                <StylePreview style={{ ...DEFAULT_STYLE, ...s.settings }} sample={sample} />
              </button>
              <div className="space-y-2 p-3">
                <p className="truncate text-sm text-parchment">{s.name}</p>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => applyToStudio(s.settings)}
                    className="flex-1 rounded-lg border border-[var(--hairline)] py-1.5 text-[11px] text-parchment transition-colors hover:border-gold">
                    Use in studio
                  </button>
                  <button onClick={() => startEdit(s)}
                    className="rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] text-[var(--muted)] hover:text-parchment">
                    Edit
                  </button>
                  <button onClick={() => duplicate(s)} title="Duplicate style"
                    className="rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] text-[var(--muted)] hover:text-parchment">
                    ⧉
                  </button>
                  <button onClick={() => setFullscreenStyle({ ...DEFAULT_STYLE, ...s.settings })} title="Full screen"
                    className="rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] text-[var(--muted)] hover:text-parchment">
                    ⛶
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete style "${s.name}"?`)) setStyles(deleteSavedStyle(s.id));
                    }}
                    className="rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] text-[var(--muted)] hover:border-red-400/50 hover:text-red-300">
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function Row({ label, v, children }: { label: string; v: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs text-[var(--muted)]">{label}</label>
        <span className="font-display text-sm text-gold-soft">{v}</span>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-parchment">{label}</span>
      <button onClick={onChange} role="switch" aria-checked={checked}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-[var(--gold)]" : "bg-white/10"}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-[var(--muted)]">{label}</label>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-8 w-12 cursor-pointer rounded border border-[var(--hairline)] bg-transparent" />
    </div>
  );
}
