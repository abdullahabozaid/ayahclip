"use client";

// My Styles: create, preview, and manage styles WITHOUT having a clip open.
// Every preview renders a sample verse through the real drawScene pipeline at
// export resolution, so what you see here is exactly what a clip will look like.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StyleSettings } from "@/lib/style";
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

// Sample verse shown in every preview (Al-Fatihah 1:1).
const SAMPLE_ARABIC = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ";
const SAMPLE_TRANSLATION =
  "In the name of Allah, the Entirely Merciful, the Especially Merciful.";

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

function StylePreview({ style, className }: { style: StyleSettings; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const size = FORMAT_SIZES["9:16"];
      if (canvas.width !== size.w) canvas.width = size.w;
      if (canvas.height !== size.h) canvas.height = size.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawScene(ctx, toScene(style), {
        arabicText: SAMPLE_ARABIC,
        verseNumber: 1,
        translation: style.translationEnabled ? SAMPLE_TRANSLATION : undefined,
        isLastPart: true,
        introProgress: 1,
      });
    };
    ensureFontsReady(style.arabicFont, style.translationFont).then(draw);
    draw();
    return () => {
      cancelled = true;
    };
  }, [style]);

  return <canvas ref={canvasRef} className={className ?? "h-full w-full"} />;
}

export default function StylesPage() {
  const router = useRouter();
  const applyStyle = useAppStore((s) => s.applyStyle);
  const [styles, setStyles] = useState<SavedStyle[]>(() => getSavedStyles());
  const [editing, setEditing] = useState<{ id: string | null; name: string; style: StyleSettings } | null>(null);

  const startNew = () =>
    setEditing({ id: null, name: "", style: { ...DEFAULT_STYLE } });

  const startEdit = (s: SavedStyle) =>
    setEditing({ id: s.id, name: s.name, style: { ...DEFAULT_STYLE, ...s.settings } });

  const saveEditing = () => {
    if (!editing) return;
    if (editing.id) {
      setStyles(updateSavedStyle(editing.id, { name: editing.name || "Untitled", settings: editing.style }));
    } else {
      setStyles(saveStyle(editing.name, editing.style));
    }
    setEditing(null);
  };

  const applyToStudio = (settings: Partial<StyleSettings>) => {
    applyStyle(settings);
    router.push("/studio");
  };

  const set = <K extends keyof StyleSettings>(key: K, value: StyleSettings[K]) =>
    setEditing((e) => (e ? { ...e, style: { ...e.style, [key]: value } } : e));

  if (editing) {
    const st = editing.style;
    return (
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-8">
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
          <div className="mx-auto w-full max-w-[320px]">
            <div className="overflow-hidden rounded-2xl border border-[var(--hairline-soft)]">
              <StylePreview style={st} className="block aspect-[9/16] w-full" />
            </div>
            <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
              Live preview — rendered by the exact export pipeline
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

      {styles.length === 0 ? (
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
              <button onClick={() => startEdit(s)} className="block aspect-[9/16] w-full" aria-label={`Edit ${s.name}`}>
                <StylePreview style={{ ...DEFAULT_STYLE, ...s.settings }} />
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
