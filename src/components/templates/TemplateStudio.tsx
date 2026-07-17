"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyTemplate } from "@/lib/apply-template";
import {
  analyzeArabicTextFit,
  DEFAULT_MEDIA_TRANSFORM,
  DEFAULT_SPLIT_MASK,
  TRANSLATION_FONTS,
  ensureFontsReady,
  mediaTransformPositionLabel,
  nudgeMediaTransform,
  normalizeSplitMask,
  type ArabicTextFitResult,
} from "@/lib/canvas-utils";
import {
  getSavedTemplates,
  saveTemplate,
  updateSavedTemplate,
} from "@/lib/saved-templates";
import { DEFAULT_TEMPLATE_STYLE, TEMPLATES } from "@/lib/templates";
import type {
  TemplateDefinition,
  TemplateExtras,
  TemplateFamily,
  TemplateMediaPolicy,
  TemplateSequencePreset,
} from "@/lib/template-model";
import type { StyleSettings } from "@/lib/style";
import type { Background } from "@/types";
import {
  TEMPLATE_BACKGROUND_PRESETS,
  reconcileSequenceMediaSlots,
  templateTextPositionFromKey,
  templateTextPositionFromPointer,
  toggleBackgroundMediaSlot,
} from "@/lib/template-canvas";
import { TemplateIcon, type TemplateIconName } from "./TemplateIcon";
import { BackgroundEditor } from "@/components/BackgroundEditor";
import { ArabicFontSpecimen } from "@/components/ArabicFontSpecimen";
import { InlineActionPrompt } from "@/components/InlineActionPrompt";
import { ensureQcfFontsReady } from "@/lib/qcf-font-loader";
import { canvasBackgroundForMode } from "@/lib/canvas-background";
import { MediaZoomControl } from "@/components/MediaZoomControl";
import {
  FALLBACK_SAMPLE,
  loadTemplateSamples,
  TemplatePreview,
  type SampleVerse,
} from "./TemplatePreview";
import { trackProductEvent } from "@/lib/telemetry";

const FAMILY_ICONS: Record<TemplateFamily, TemplateIconName> = {
  ayahclip: "sparkles",
  reciter: "reciter",
  nature: "nature",
  minimal: "minimal",
  broll: "broll",
};

const FONT_LABELS: Record<string, string> = {
  serif: "Georgia",
  "sans-serif": "Arial",
  outfit: "Outfit",
  cinzel: "Cinzel",
  "times-new-roman": "Times New Roman",
  lora: "Lora",
  "playfair-display": "Playfair Display",
};

const ARABIC_FONT_OPTIONS: {
  value: string;
  label: string;
  note: string;
  family: string;
  defaultWeight: number;
}[] = [
  {
    value: "qcf",
    label: "Mushaf QCF",
    note: "Page-faithful Quran.com glyphs, including the authentic ayah mark.",
    family: '"UthmanicHafs", serif',
    defaultWeight: 400,
  },
  {
    value: "uthmanic-hafs",
    label: "QPC Hafs Unicode",
    note: "Quran Foundation's source-matched Hafs Unicode text with complete marks.",
    family: '"UthmanicHafs", serif',
    defaultWeight: 400,
  },
  {
    value: "amiri-quran",
    label: "Amiri Quran",
    note: "A more open, literary Quran face for cinematic captions.",
    family: 'var(--font-amiri-quran), "UthmanicHafs", serif',
    defaultWeight: 400,
  },
  {
    value: "scheherazade-new",
    label: "Scheherazade New",
    note: "Traditional Naskh with real Regular, Medium, SemiBold, and Bold faces.",
    family: 'var(--font-scheherazade), "UthmanicHafs", serif',
    defaultWeight: 600,
  },
  {
    value: "noto-naskh-arabic",
    label: "Noto Naskh Arabic",
    note: "Compact multi-weight Naskh for bold social captions with dense harakat.",
    family: 'var(--font-noto-naskh), "UthmanicHafs", serif',
    defaultWeight: 600,
  },
];

function cloneTemplate(template: TemplateDefinition): TemplateDefinition {
  return {
    ...template,
    settings: {
      ...template.settings,
      background: { ...template.settings.background },
      textShadow: { ...template.settings.textShadow },
      textOutline: template.settings.textOutline
        ? { ...template.settings.textOutline }
        : undefined,
      letterbox: { ...template.settings.letterbox },
      mediaTransform: template.settings.mediaTransform
        ? { ...template.settings.mediaTransform }
        : undefined,
      splitMask: template.settings.splitMask
        ? { ...template.settings.splitMask }
        : undefined,
    },
    extras: {
      ...template.extras,
      backgroundSequence: template.extras.backgroundSequence
        ? { ...template.extras.backgroundSequence }
        : undefined,
    },
    mediaSlots: template.mediaSlots.map((slot) => ({ ...slot })),
  };
}

function blankTemplate(): TemplateDefinition {
  return {
    id: "new",
    source: "user",
    name: "Untitled template",
    description: "A reusable Quran clip composition",
    family: "minimal",
    featured: false,
    swatch: DEFAULT_TEMPLATE_STYLE.background.value,
    mediaPolicy: "preserve-current-media",
    settings: {
      ...DEFAULT_TEMPLATE_STYLE,
      background: { ...DEFAULT_TEMPLATE_STYLE.background },
      textShadow: { ...DEFAULT_TEMPLATE_STYLE.textShadow },
      textOutline: DEFAULT_TEMPLATE_STYLE.textOutline
        ? { ...DEFAULT_TEMPLATE_STYLE.textOutline }
        : undefined,
      letterbox: { ...DEFAULT_TEMPLATE_STYLE.letterbox },
      mediaTransform: DEFAULT_TEMPLATE_STYLE.mediaTransform
        ? { ...DEFAULT_TEMPLATE_STYLE.mediaTransform }
        : undefined,
      splitMask: DEFAULT_TEMPLATE_STYLE.splitMask
        ? { ...DEFAULT_TEMPLATE_STYLE.splitMask }
        : undefined,
    },
    extras: { clipFadeMs: 300, safeAreaTarget: "tiktok", safePadding: 0 },
    mediaSlots: [],
  };
}

export function TemplateStudio({ initialTemplateId }: { initialTemplateId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<TemplateDefinition | null>(null);
  const [samples, setSamples] = useState<SampleVerse[]>([FALLBACK_SAMPLE]);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [replayToken, setReplayToken] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [canvasTool, setCanvasTool] = useState<"text" | "media">("text");
  const [showAdvancedFonts, setShowAdvancedFonts] = useState(false);
  const [arabicFit, setArabicFit] = useState<ArabicTextFitResult | null>(null);
  const [movingText, setMovingText] = useState(false);
  const [movingMedia, setMovingMedia] = useState(false);
  const [pendingBase, setPendingBase] = useState<TemplateDefinition | null>(null);
  const movingTextRef = useRef(false);
  const mediaDragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
  } | null>(null);
  const phoneCanvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const userTemplates = getSavedTemplates(DEFAULT_TEMPLATE_STYLE);
      const match =
        initialTemplateId === "new"
          ? blankTemplate()
          : TEMPLATES.find((template) => template.id === initialTemplateId) ??
            userTemplates.find((template) => template.id === initialTemplateId) ??
            blankTemplate();
      setDraft(cloneTemplate(match));
    });
    loadTemplateSamples().then((loaded) => {
      if (active && loaded.length > 0) setSamples(loaded);
    });
    return () => {
      active = false;
    };
  }, [initialTemplateId]);

  const sample = samples[Math.min(sampleIndex, samples.length - 1)];

  useEffect(() => {
    if (!draft || draft.settings.textLayout !== "left-panel") {
      setArabicFit(null);
      return;
    }
    let cancelled = false;
    const measure = async () => {
      await ensureFontsReady(
        draft.settings.arabicFont,
        draft.settings.translationFont,
        draft.settings.arabicFontWeight,
        draft.settings.translationFontWeight,
      );
      if (draft.settings.arabicFont === "qcf" && sample.qcfWords?.length) {
        await ensureQcfFontsReady(sample.qcfWords);
      }
      const context = document.createElement("canvas").getContext("2d");
      if (!context || cancelled) return;
      const result = analyzeArabicTextFit(context, sample.arabicText, {
        arabicFont: draft.settings.arabicFont,
        arabicFontWeight: draft.settings.arabicFontWeight,
        arabicFontSize: draft.settings.arabicFontSize,
        qcfWords: sample.qcfWords,
        arabicVerseNumber: draft.settings.arabicVerseNumber,
        splitMask: draft.settings.splitMask,
      });
      if (!cancelled) setArabicFit(result);
    };
    void measure();
    return () => {
      cancelled = true;
    };
  }, [draft, sample]);
  const selectedTreatment = useMemo(() => {
    if (!draft) return "clean";
    if (draft.settings.highlightEnabled) return "gold";
    const shadowColor = draft.settings.textShadow.color.toLowerCase();
    if (!["#000000", "#050507", "#040806"].includes(shadowColor)) return "glow";
    if (draft.settings.textOutline?.enabled) return "outline";
    return "clean";
  }, [draft]);

  const change = (updater: (current: TemplateDefinition) => TemplateDefinition) => {
    setDraft((current) => (current ? updater(current) : current));
    setDirty(true);
    setStatus("");
  };

  const setStyle = <K extends keyof StyleSettings>(key: K, value: StyleSettings[K]) =>
    change((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }));

  const setExtra = <K extends keyof TemplateExtras>(key: K, value: TemplateExtras[K]) =>
    change((current) => ({
      ...current,
      extras: { ...current.extras, [key]: value },
    }));

  const applyBase = (template: TemplateDefinition) => {
    setDraft(cloneTemplate(template));
    setDirty(false);
    setStatus(`Loaded ${template.name}`);
    setPendingBase(null);
  };

  const chooseBase = (template: TemplateDefinition) => {
    if (dirty) {
      setPendingBase(template);
      return;
    }
    applyBase(template);
  };

  const setTreatment = (treatment: "clean" | "glow" | "outline" | "gold") => {
    change((current) => {
      const settings = { ...current.settings };
      if (treatment === "clean") {
        settings.highlightEnabled = false;
        settings.textOutline = { ...(settings.textOutline ?? { color: "#050507", width: 1.25 }), enabled: false };
        settings.textShadow = { enabled: true, color: "#000000", blur: 5, offsetX: 0, offsetY: 2 };
      } else if (treatment === "glow") {
        settings.highlightEnabled = false;
        settings.textOutline = { ...(settings.textOutline ?? { color: "#050507", width: 1.25 }), enabled: false };
        settings.textShadow = { enabled: true, color: "#f4f0e6", blur: 5, offsetX: 0, offsetY: 0 };
      } else if (treatment === "outline") {
        settings.highlightEnabled = false;
        settings.textOutline = { enabled: true, color: "#050507", width: 1.5 };
        settings.textShadow = { enabled: true, color: "#000000", blur: 3, offsetX: 0, offsetY: 1 };
      } else {
        settings.highlightEnabled = true;
        settings.highlightColor = settings.highlightColor ?? "#74652d";
        settings.highlightOpacity = settings.highlightOpacity ?? 0.72;
        settings.highlightRadius = settings.highlightRadius ?? 0.12;
        settings.highlightPadding = settings.highlightPadding ?? 0.5;
        settings.highlightHeight = settings.highlightHeight ?? 0.52;
        settings.textOutline = { enabled: true, color: "#050507", width: 1.25 };
        settings.textShadow = { enabled: true, color: "#000000", blur: 6, offsetX: 0, offsetY: 2 };
      }
      return { ...current, settings };
    });
  };

  const sequence = draft?.extras.backgroundSequence;
  const updateSequence = (patch: Partial<TemplateSequencePreset>) => {
    change((current) => {
      const existing = current.extras.backgroundSequence ?? {
        enabled: false,
        sceneCount: 3,
        duration: 5,
        transition: "crossfade" as const,
        transitionDuration: 0.6,
      };
      const next = { ...existing, ...patch };
      return {
        ...current,
        extras: { ...current.extras, backgroundSequence: next },
        mediaSlots: reconcileSequenceMediaSlots(
          current.mediaSlots,
          next.enabled,
          next.sceneCount,
        ),
      };
    });
  };

  const setTemplateBackground = (
    preset: (typeof TEMPLATE_BACKGROUND_PRESETS)[number],
  ) => {
    change((current) => ({
      ...current,
      swatch: preset.swatch,
      mediaPolicy: "use-template-media",
      mediaSlots: current.mediaSlots.filter((slot) => slot.id !== "background"),
      settings: {
        ...current.settings,
        background: { ...preset.background },
      },
    }));
  };

  const setCustomBackground = (background: Background) => {
    change((current) => ({
      ...current,
      swatch: background.value,
      mediaPolicy: "use-template-media",
      mediaSlots: current.mediaSlots.filter((slot) => slot.id !== "background"),
      settings: { ...current.settings, background },
    }));
  };

  const toggleMediaPlaceholder = () => {
    change((current) => {
      if (current.extras.backgroundSequence?.enabled) return current;
      const nextSlots = toggleBackgroundMediaSlot(current.mediaSlots);
      const added = nextSlots.some((slot) => slot.id === "background");
      return {
        ...current,
        mediaPolicy: added ? "use-template-media" : current.mediaPolicy,
        mediaSlots: nextSlots,
        settings: added
          ? {
              ...current.settings,
              background: {
                type: "solid",
                value: "#08090d",
                label: "Add your media",
              },
            }
          : current.settings,
      };
    });
  };

  const moveTextFromPointer = (clientY: number) => {
    const frame = phoneCanvasRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    setStyle(
      "textPosition",
      templateTextPositionFromPointer(clientY, rect.top, rect.height),
    );
  };

  const startTextMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    movingTextRef.current = true;
    setMovingText(true);
    moveTextFromPointer(event.clientY);
  };

  const continueTextMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!movingTextRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveTextFromPointer(event.clientY);
  };

  const stopTextMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    movingTextRef.current = false;
    setMovingText(false);
  };

  const startMediaMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const transform = draft?.settings.mediaTransform ?? DEFAULT_MEDIA_TRANSFORM;
    mediaDragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: transform.x,
      y: transform.y,
    };
    setMovingMedia(true);
  };

  const continueMediaMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = mediaDragRef.current;
    const frame = phoneCanvasRef.current;
    if (!start || !frame || start.pointerId !== event.pointerId) return;
    const rect = frame.getBoundingClientRect();
    const x = start.x + (event.clientX - start.clientX) / rect.width;
    const y = start.y + (event.clientY - start.clientY) / rect.height;
    setStyle("mediaTransform", {
      ...(draft?.settings.mediaTransform ?? DEFAULT_MEDIA_TRANSFORM),
      x,
      y,
    });
  };

  const stopMediaMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    mediaDragRef.current = null;
    setMovingMedia(false);
  };

  const save = () => {
    if (!draft) return;
    const input = {
      name: draft.name,
      description: draft.description,
      family: draft.family,
      swatch: draft.swatch,
      mediaPolicy: draft.mediaPolicy,
      settings: draft.settings,
      extras: draft.extras,
      mediaSlots: draft.mediaSlots,
    };
    if (draft.source === "user" && draft.id !== "new" && initialTemplateId === draft.id) {
      const updated = updateSavedTemplate(draft.id, input);
      const saved = updated.find((item) => item.id === draft.id);
      if (saved) setDraft(cloneTemplate(saved));
      setStatus("Template updated");
    } else {
      const saved = saveTemplate(input)[0];
      setDraft(cloneTemplate(saved));
      setStatus("Saved to My templates");
    }
    setDirty(false);
  };

  const use = () => {
    if (!draft) return;
    applyTemplate(draft);
    trackProductEvent("template_chosen");
    router.push("/studio");
  };

  if (!draft) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--ink)] text-sm text-[var(--muted)]">
        Loading Template Studio…
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[var(--ink)] text-parchment lg:fixed lg:inset-0 lg:h-dvh lg:overflow-hidden">
      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-3 border-b border-[var(--hairline-soft)] bg-[var(--ink)]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/styles" aria-label="Back to templates" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--hairline-soft)] text-[var(--muted)] hover:border-[var(--hairline)] hover:text-parchment">
            <TemplateIcon name="arrow-left" className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft/70 sm:block">Template Studio</p>
            <input
              value={draft.name}
              onChange={(event) => change((current) => ({ ...current, name: event.target.value }))}
              aria-label="Template name"
              className="w-full min-w-0 bg-transparent text-base font-medium text-parchment outline-none placeholder:text-[var(--muted-deep)] sm:w-72"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={save} className="hidden min-h-10 items-center gap-2 rounded-full border border-[var(--hairline)] px-4 text-sm text-parchment hover:border-gold sm:flex">
            <TemplateIcon name="save" className="h-4 w-4" />
            {draft.source === "built-in" ? "Save copy" : "Save"}
          </button>
          <button type="button" onClick={use} className="btn-gold min-h-10 rounded-full px-4 text-sm sm:px-5">
            Use template
          </button>
        </div>
      </header>

      {pendingBase && (
        <div className="border-b border-[var(--hairline-soft)] bg-[var(--ink-deep)] px-4 py-3 sm:px-6">
          <InlineActionPrompt
            title={`Load “${pendingBase.name}” instead?`}
            description="Your unsaved template changes will be replaced. Save a copy first if you want to keep them."
            confirmLabel="Replace changes"
            onConfirm={() => applyBase(pendingBase)}
            onCancel={() => setPendingBase(null)}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row lg:overflow-hidden">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--hairline-soft)] bg-[var(--ink-deep)] lg:flex">
          <div className="border-b border-[var(--hairline-soft)] p-5">
            <h2 className="font-display text-lg">Base templates</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Switch starting point at any time.</p>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-3">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => chooseBase(template)}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors ${
                  draft.id === template.id
                    ? "bg-white/[0.07] text-parchment"
                    : "text-[var(--muted)] hover:bg-white/[0.035] hover:text-parchment"
                }`}
              >
                <TemplateIcon name={FAMILY_ICONS[template.family]} className="h-4 w-4 shrink-0 text-gold-soft/80" />
                <span className="truncate">{template.name}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="relative flex min-h-[620px] flex-1 flex-col items-center justify-center bg-black px-4 py-6 sm:px-8 lg:min-h-0">
          <div className="mb-4 flex max-w-full gap-2 overflow-x-auto pb-1 lg:hidden">
            {TEMPLATES.map((template) => (
              <button key={template.id} type="button" onClick={() => chooseBase(template)} className="min-h-10 shrink-0 rounded-full border border-[var(--hairline-soft)] px-3 text-xs text-[var(--muted)]">
                {template.name}
              </button>
            ))}
          </div>

          <div className="mb-3 grid grid-cols-2 gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--surface)]/90 p-1 backdrop-blur">
            {(["text", "media"] as const).map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => setCanvasTool(tool)}
                aria-pressed={canvasTool === tool}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[11px] font-semibold capitalize transition-colors sm:min-h-9 ${
                  canvasTool === tool
                    ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                    : "text-[var(--muted)] hover:text-parchment"
                }`}
              >
                <TemplateIcon name={tool === "text" ? "type" : "image"} className="h-3.5 w-3.5" />
                {tool}
              </button>
            ))}
          </div>

          <div className="mb-4 flex items-center gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--surface)]/85 p-1 backdrop-blur">
            {samples.map((item, index) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setSampleIndex(index)}
                aria-pressed={sampleIndex === index}
                className={`min-h-11 rounded-full px-4 text-xs transition-colors sm:min-h-9 ${sampleIndex === index ? "bg-[var(--hairline)] text-parchment" : "text-[var(--muted)] hover:text-parchment"}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {(draft.settings.background.type === "solid" || draft.settings.background.type === "gradient") && (
            <div
              aria-label="Preview canvas treatment"
              className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--surface)]/85 p-1 backdrop-blur"
            >
              {(["solid", "gradient"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCustomBackground(canvasBackgroundForMode(draft.settings.background, mode))}
                  aria-pressed={draft.settings.background.type === mode}
                  className={`min-h-11 rounded-full px-4 text-[11px] font-medium capitalize transition-colors sm:min-h-9 ${
                    draft.settings.background.type === mode
                      ? "bg-white/[0.09] text-parchment"
                      : "text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  {mode} canvas
                </button>
              ))}
            </div>
          )}

          <div ref={phoneCanvasRef} className="relative h-[min(64dvh,720px)] min-h-[460px] overflow-hidden rounded-[2.2rem] border-[7px] border-[var(--surface-2)] bg-[var(--ink-deep)] shadow-[0_32px_90px_-30px_rgba(0,0,0,0.95)]" style={{ aspectRatio: "9 / 16" }}>
            <TemplatePreview
              style={draft.settings}
              extras={draft.extras}
              sample={sample}
              replayToken={replayToken}
              animateIntro
              previewMedia={draft.mediaSlots.length > 0}
            />
            {draft.extras.safeAreaTarget && draft.extras.safeAreaTarget !== "none" && (
              <div className="pointer-events-none absolute inset-[7%_14%_18%_4%] rounded-xl border border-dashed border-gold/25" aria-hidden="true">
                <span className="absolute left-2 top-2 text-[8px] font-semibold uppercase tracking-[0.15em] text-gold-soft/45">{draft.extras.safeAreaTarget} safe area</span>
              </div>
            )}
            {draft.mediaSlots.length > 0 && (
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[9px] uppercase tracking-[0.14em] text-white/50 backdrop-blur">
                {draft.mediaSlots.length} media {draft.mediaSlots.length === 1 ? "slot" : "slots"}
              </span>
            )}
            <div
              role="slider"
              tabIndex={0}
              aria-label={canvasTool === "text" ? "Text vertical position" : "Media position"}
              aria-valuemin={canvasTool === "text" ? 10 : -400}
              aria-valuemax={canvasTool === "text" ? 90 : 400}
              aria-valuenow={canvasTool === "text" ? draft.settings.textPosition : Math.round((draft.settings.mediaTransform?.x ?? 0) * 100)}
              aria-valuetext={canvasTool === "text"
                ? `${draft.settings.textPosition}% from the top`
                : `${Math.round((draft.settings.mediaTransform?.x ?? 0) * 100)}% horizontal, ${Math.round((draft.settings.mediaTransform?.y ?? 0) * 100)}% vertical`}
              onPointerDown={canvasTool === "text" ? startTextMove : startMediaMove}
              onPointerMove={canvasTool === "text" ? continueTextMove : continueMediaMove}
              onPointerUp={canvasTool === "text" ? stopTextMove : stopMediaMove}
              onPointerCancel={canvasTool === "text" ? stopTextMove : stopMediaMove}
              onKeyDown={(event) => {
                if (canvasTool === "media") {
                  const transform = draft.settings.mediaTransform ?? DEFAULT_MEDIA_TRANSFORM;
                  const direction = event.key === "ArrowLeft"
                    ? "left"
                    : event.key === "ArrowRight"
                      ? "right"
                      : event.key === "ArrowUp"
                        ? "up"
                        : event.key === "ArrowDown"
                          ? "down"
                          : null;
                  if (!direction) return;
                  event.preventDefault();
                  setStyle("mediaTransform", nudgeMediaTransform(transform, direction, event.shiftKey));
                  return;
                }
                const next = templateTextPositionFromKey(
                  draft.settings.textPosition,
                  event.key,
                  event.shiftKey ? 5 : 2,
                );
                if (next === draft.settings.textPosition) return;
                event.preventDefault();
                setStyle("textPosition", next);
              }}
              className={`group/canvas absolute inset-0 z-20 touch-none outline-none ${(movingText || movingMedia) ? "cursor-grabbing" : "cursor-grab"}`}
            >
              {canvasTool === "text" ? (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-3 flex -translate-y-1/2 items-center gap-2 transition-opacity duration-200 ${movingText ? "opacity-100" : "opacity-0 group-hover/canvas:opacity-100 group-focus-visible/canvas:opacity-100"}`}
                  style={{ top: `${draft.settings.textPosition}%` }}
                >
                  <span className="h-8 w-1 rounded-full bg-gold shadow-[0_0_10px_rgba(201,162,75,0.35)]" />
                  <span className="rounded-full border border-white/10 bg-black/70 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-gold-soft backdrop-blur">
                    {draft.settings.textPosition}%
                  </span>
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-gold/55 bg-gold/5 transition-opacity ${movingMedia ? "opacity-100" : "opacity-60 group-hover/canvas:opacity-100"}`}
                >
                  <span className="absolute h-8 w-px bg-gold/70" />
                  <span className="absolute h-px w-8 bg-gold/70" />
                  <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_12px_rgba(201,162,75,0.55)]" />
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 flex max-w-full flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => setReplayToken((value) => value + 1)} className="flex min-h-10 items-center gap-2 rounded-full border border-[var(--hairline-soft)] px-3 text-xs text-[var(--muted)] hover:text-parchment">
              <TemplateIcon name="refresh" className="h-4 w-4" /> Replay
            </button>
            {canvasTool === "media" && (() => {
              const transform = draft.settings.mediaTransform ?? DEFAULT_MEDIA_TRANSFORM;
              return (
                <>
                  <span role="status" aria-label="Media framing position" className="rounded-full bg-white/[0.035] px-3 py-2 text-[10px] text-[var(--muted)]">
                    {mediaTransformPositionLabel(transform)}
                  </span>
                  <MediaZoomControl
                    value={transform.scale}
                    onChange={(scale) => setStyle("mediaTransform", { ...transform, scale })}
                  />
                  <button
                    type="button"
                    onClick={() => setStyle("mediaTransform", { ...transform, x: 0, y: 0 })}
                    className="min-h-10 rounded-full border border-[var(--hairline-soft)] px-3 text-xs text-parchment transition-colors hover:border-gold"
                  >
                    Center media
                  </button>
                </>
              );
            })()}
            <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden="true" />
            <span className="hidden text-[10px] uppercase tracking-[0.14em] text-[var(--muted-deep)] sm:block">
              {canvasTool === "text" ? "Drag vertically or use ↑↓" : "Drag media or use arrow keys"}
            </span>
            <button type="button" onClick={() => setFullscreen(true)} className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--hairline-soft)] text-[var(--muted)] hover:text-parchment" aria-label="Full-screen preview" title="Full-screen preview">
              <TemplateIcon name="expand" className="h-4 w-4" />
            </button>
          </div>
        </section>

        <aside className="w-full shrink-0 border-t border-[var(--hairline-soft)] bg-[var(--ink)] lg:w-[360px] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="sticky top-16 z-10 flex items-center justify-between border-b border-[var(--hairline-soft)] bg-[var(--ink)]/95 px-5 py-4 backdrop-blur lg:top-0">
            <div>
              <h2 className="font-display">Inspector</h2>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">No timeline. Everything changes the template.</p>
            </div>
            <TemplateIcon name="settings" className="h-4 w-4 text-[var(--muted)]" />
          </div>
          <div className="divide-y divide-[var(--hairline-soft)]">
            <InspectorSection title="Layout" icon="layout" defaultOpen>
              <Segmented
                value={draft.extras.safeAreaTarget ?? "none"}
                options={[{ value: "tiktok", label: "TikTok" }, { value: "reels", label: "Reels" }, { value: "none", label: "None" }]}
                onChange={(value) => setExtra("safeAreaTarget", value as TemplateExtras["safeAreaTarget"])}
              />
              {(draft.extras.safeAreaTarget ?? "none") !== "none" && (
                <RangeField label="Safe padding" value={draft.extras.safePadding ?? 0} min={0} max={15} suffix="%" onChange={(value) => setExtra("safePadding", value)} />
              )}
              <Segmented
                value={draft.settings.textLayout ?? "center"}
                options={[{ value: "center", label: "Centered" }, { value: "left-panel", label: "Split fade" }]}
                onChange={(value) => setStyle("textLayout", value as StyleSettings["textLayout"])}
              />
              {(draft.settings.textLayout ?? "center") === "left-panel" && (() => {
                const mask = normalizeSplitMask(draft.settings.splitMask ?? DEFAULT_SPLIT_MASK);
                return (
                  <div className="space-y-4 rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)]/55 p-4">
                    <div>
                      <p className="text-xs font-medium text-parchment">Reading panel</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-[var(--muted)]">Set the solid text field and exactly where it fades into the media.</p>
                    </div>
                    <Segmented
                      value={mask.side}
                      options={[{ value: "left", label: "Text left" }, { value: "right", label: "Text right" }]}
                      onChange={(side) => setStyle("splitMask", { ...mask, side: side as "left" | "right" })}
                    />
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--muted)]">Panel edge</p>
                      <Segmented
                        value={mask.fadeWidth === 0 ? "solid" : "fade"}
                        options={[{ value: "solid", label: "Solid" }, { value: "fade", label: "Fade" }]}
                        onChange={(edge) => setStyle("splitMask", normalizeSplitMask({
                          ...mask,
                          fadeWidth: edge === "solid" ? 0 : Math.max(24, mask.fadeWidth),
                        }))}
                      />
                    </div>
                    <RangeField label="Solid width" value={mask.solidWidth} min={0} max={75} suffix="%" onChange={(solidWidth) => setStyle("splitMask", normalizeSplitMask({ ...mask, solidWidth }))} />
                    <RangeField label="Fade width" value={mask.fadeWidth} min={0} max={75} suffix="%" onChange={(fadeWidth) => setStyle("splitMask", normalizeSplitMask({ ...mask, fadeWidth }))} />
                    <ColorField label="Panel color" value={mask.color} onChange={(color) => setStyle("splitMask", { ...mask, color })} />
                    <RangeField label="Panel opacity" value={Math.round(mask.opacity * 100)} min={0} max={100} suffix="%" onChange={(opacity) => setStyle("splitMask", { ...mask, opacity: opacity / 100 })} />
                  </div>
                );
              })()}
              <RangeField label="Vertical position" value={draft.settings.textPosition} min={10} max={90} suffix="%" onChange={(value) => setStyle("textPosition", value)} />
              <label className="block space-y-2">
                <span className="text-xs text-[var(--muted)]">When applied</span>
                <select value={draft.mediaPolicy} onChange={(event) => change((current) => ({ ...current, mediaPolicy: event.target.value as TemplateMediaPolicy }))} className="field min-h-11 w-full px-3 text-sm">
                  <option value="preserve-current-media">Keep the clip&apos;s current media</option>
                  <option value="use-template-media">Use this template&apos;s background</option>
                </select>
              </label>
            </InspectorSection>

            <InspectorSection title="Arabic" icon="type">
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-deep)]">Quick choice</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { font: "qcf", weight: 400, label: "Mushaf faithful", sample: "ٱلۡحَمۡدُ" },
                    { font: "scheherazade-new", weight: 700, label: "Traditional bold", sample: "ٱلۡحَمۡدُ" },
                  ].map((mode) => {
                    const selected = draft.settings.arabicFont === mode.font && draft.settings.arabicFontWeight === mode.weight;
                    return (
                      <button
                        key={mode.font}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setStyle("arabicFont", mode.font);
                          setStyle("arabicFontWeight", mode.weight);
                        }}
                        className={`min-h-20 rounded-xl border p-3 text-left transition-colors ${selected ? "border-gold bg-gold/5" : "border-[var(--hairline-soft)] hover:border-[var(--hairline)]"}`}
                      >
                        <span className={`block text-[10px] font-semibold ${selected ? "text-gold-soft" : "text-[var(--muted)]"}`}>{mode.label}</span>
                        <ArabicFontSpecimen
                          font={mode.font}
                          weight={mode.weight}
                          inkThickness={selected ? (draft.settings.arabicInkThickness ?? 0) : 0}
                          qcfWords={mode.font === "qcf" ? sample.qcfWords?.slice(0, 1) : undefined}
                          fallback={mode.sample}
                          className="mt-1 text-right text-[22px] leading-[1.7] text-parchment"
                        />
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  aria-expanded={showAdvancedFonts}
                  onClick={() => setShowAdvancedFonts((open) => !open)}
                  className="flex min-h-10 w-full items-center justify-between rounded-lg px-1 text-[11px] text-[var(--muted)] hover:text-parchment"
                >
                  Compare all five fonts
                  <span aria-hidden="true" className={`text-base transition-transform ${showAdvancedFonts ? "rotate-45" : ""}`}>+</span>
                </button>
              </div>
              {showAdvancedFonts && <div className="space-y-2">
                {ARABIC_FONT_OPTIONS.map((font) => {
                  const selected = draft.settings.arabicFont === font.value;
                  return (
                    <button
                      key={font.value}
                      type="button"
                      onClick={() => {
                        setStyle("arabicFont", font.value);
                        setStyle("arabicFontWeight", font.defaultWeight);
                      }}
                      aria-pressed={selected}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${selected ? "border-gold bg-gold/5" : "border-[var(--hairline-soft)] hover:border-[var(--hairline)]"}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${selected ? "text-gold-soft" : "text-[var(--muted)]"}`}>{font.label}</span>
                        {selected && <TemplateIcon name="check" className="h-3.5 w-3.5 text-gold" />}
                      </span>
                      <ArabicFontSpecimen
                        font={font.value}
                        weight={selected ? draft.settings.arabicFontWeight : font.defaultWeight}
                        inkThickness={selected ? (draft.settings.arabicInkThickness ?? 0) : 0}
                        qcfWords={sample.qcfWords}
                        fallback={sample.arabicText}
                        className="mt-2 text-right text-[22px] leading-[1.9] text-parchment"
                      />
                      <span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">{font.note}</span>
                    </button>
                  );
                })}
              </div>}
              {(draft.settings.arabicFont === "scheherazade-new" || draft.settings.arabicFont === "noto-naskh-arabic") && (
                <Segmented
                  value={String(draft.settings.arabicFontWeight)}
                  options={[
                    { value: "400", label: "Regular" },
                    { value: "500", label: "Medium" },
                    { value: "600", label: "SemiBold" },
                    { value: "700", label: "Bold" },
                  ]}
                  onChange={(value) => setStyle("arabicFontWeight", Number(value))}
                />
              )}
              <RangeField
                label="Quran ink thickness"
                value={draft.settings.arabicInkThickness ?? 0}
                min={0}
                max={2.5}
                step={0.25}
                suffix="px"
                onChange={(value) => setStyle("arabicInkThickness", value)}
              />
              <p className="text-[10px] leading-4 text-[var(--muted)]">Adds real ink to fixed-weight Mushaf glyphs while keeping the outline and glow independent.</p>
              <p className="text-[10px] leading-4 text-[var(--muted)]">Use Short, Medium, and Long above the canvas to compare real Quran marks and line fit. QCF uses the actual page glyphs; Scheherazade and Noto Naskh use genuine heavier faces.</p>
              <RangeField label="Size" value={draft.settings.arabicFontSize} min={18} max={72} suffix="px" onChange={(value) => setStyle("arabicFontSize", value)} />
              {draft.settings.textLayout === "left-panel" && arabicFit?.cramped && (
                <div className="rounded-xl border border-gold/25 bg-gold/[0.06] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-soft">Split text needs room</p>
                  <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">This sample wraps to {arabicFit.lineCount} lines. Fit it to {arabicFit.targetLines} without changing the panel or font.</p>
                  <button
                    type="button"
                    onClick={() => setStyle("arabicFontSize", arabicFit.recommendedFontSize)}
                    className="mt-2 min-h-10 w-full rounded-lg border border-[var(--hairline)] text-[11px] font-medium text-parchment hover:border-gold"
                  >
                    Fit text to {arabicFit.recommendedFontSize}px
                  </button>
                </div>
              )}
              <RangeField label="Line height" value={draft.settings.lineHeight} min={0.75} max={1.7} step={0.05} suffix="×" onChange={(value) => setStyle("lineHeight", value)} />
              <SwitchField label="Arabic verse number" checked={Boolean(draft.settings.arabicVerseNumber)} onChange={(checked) => setStyle("arabicVerseNumber", checked)} />
            </InspectorSection>

            <InspectorSection title="Translation" icon="type">
              <SwitchField label="Show translation" checked={draft.settings.translationEnabled} onChange={(checked) => setStyle("translationEnabled", checked)} />
              {draft.settings.translationEnabled && (
                <>
                  <label className="block space-y-2">
                    <span className="text-xs text-[var(--muted)]">Font</span>
                    <select value={draft.settings.translationFont} onChange={(event) => setStyle("translationFont", event.target.value)} className="field min-h-11 w-full px-3 text-sm">
                      {Object.keys(TRANSLATION_FONTS).map((font) => <option key={font} value={font}>{FONT_LABELS[font] ?? font}</option>)}
                    </select>
                  </label>
                  <RangeField label="Size" value={draft.settings.translationFontSize} min={9} max={32} suffix="px" onChange={(value) => setStyle("translationFontSize", value)} />
                  <Segmented value={String(draft.settings.translationFontWeight)} options={[400, 500, 600, 700].map((weight) => ({ value: String(weight), label: String(weight) }))} onChange={(value) => setStyle("translationFontWeight", Number(value))} />
                  <ColorField label="Translation color" value={draft.settings.translationColor ?? "#d8d3c7"} onChange={(value) => setStyle("translationColor", value)} />
                </>
              )}
            </InspectorSection>

            <InspectorSection title="Treatment" icon="sparkles">
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["clean", "Clean"],
                  ["glow", "Soft glow"],
                  ["outline", "Crisp edge"],
                  ["gold", "Gold line"],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setTreatment(value)} aria-pressed={selectedTreatment === value} className={`min-h-14 rounded-xl border px-3 text-xs font-medium transition-colors ${selectedTreatment === value ? "border-gold bg-[rgba(201,162,75,0.09)] text-parchment" : "border-[var(--hairline-soft)] text-[var(--muted)] hover:border-[var(--hairline)] hover:text-parchment"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <ColorField label="Quran text color" value={draft.settings.textColor} onChange={(value) => setStyle("textColor", value)} />
              <SwitchField
                label="Crisp text edge"
                checked={Boolean(draft.settings.textOutline?.enabled)}
                onChange={(enabled) => setStyle("textOutline", {
                  ...(draft.settings.textOutline ?? { color: "#050507", width: 1.25 }),
                  enabled,
                })}
              />
              {draft.settings.textOutline?.enabled && (
                <>
                  <p className="text-[10px] leading-4 text-[var(--muted)]">A narrow real outline keeps Quran marks readable over moving video.</p>
                  <ColorField label="Edge color" value={draft.settings.textOutline.color} onChange={(color) => setStyle("textOutline", { ...draft.settings.textOutline!, color })} />
                  <RangeField label="Edge width" value={draft.settings.textOutline.width} min={0.5} max={3} step={0.25} suffix="px" onChange={(width) => setStyle("textOutline", { ...draft.settings.textOutline!, width })} />
                </>
              )}
              <SwitchField
                label="Text edge / glow"
                checked={draft.settings.textShadow.enabled}
                onChange={(enabled) => setStyle("textShadow", { ...draft.settings.textShadow, enabled })}
              />
              {draft.settings.textShadow.enabled && (
                <>
                  <ColorField label="Edge / glow color" value={draft.settings.textShadow.color} onChange={(color) => setStyle("textShadow", { ...draft.settings.textShadow, color })} />
                  <RangeField label="Edge / glow reach" value={draft.settings.textShadow.blur} min={0} max={18} suffix="px" onChange={(blur) => setStyle("textShadow", { ...draft.settings.textShadow, blur })} />
                  <RangeField label="Vertical offset" value={draft.settings.textShadow.offsetY} min={-8} max={8} suffix="px" onChange={(offsetY) => setStyle("textShadow", { ...draft.settings.textShadow, offsetY })} />
                </>
              )}
              <RangeField label="Overlay darkness" value={draft.settings.overlayOpacity} min={0} max={90} suffix="%" onChange={(value) => setStyle("overlayOpacity", value)} />
              {draft.settings.highlightEnabled && (
                <>
                  <ColorField label="Line color" value={draft.settings.highlightColor ?? "#74652d"} onChange={(value) => setStyle("highlightColor", value)} />
                  <RangeField label="Line opacity" value={Math.round((draft.settings.highlightOpacity ?? 0.72) * 100)} min={10} max={100} suffix="%" onChange={(value) => setStyle("highlightOpacity", value / 100)} />
                </>
              )}
            </InspectorSection>

            <InspectorSection title="Background" icon="image">
              <div className="grid grid-cols-4 gap-2">
                {TEMPLATE_BACKGROUND_PRESETS.map((preset) => {
                  const selected =
                    draft.settings.background.type === preset.background.type &&
                    draft.settings.background.value === preset.background.value &&
                    !draft.mediaSlots.some((slot) => slot.id === "background");
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setTemplateBackground(preset)}
                      aria-label={`Use ${preset.label} background`}
                      aria-pressed={selected}
                      title={preset.label}
                      className={`relative aspect-square min-h-11 rounded-xl border transition-colors ${selected ? "border-gold ring-2 ring-gold/15" : "border-white/10 hover:border-gold/45"}`}
                      style={{ background: preset.swatch }}
                    >
                      {selected && <TemplateIcon name="check" className="absolute inset-0 m-auto h-4 w-4 text-gold" />}
                    </button>
                  );
                })}
              </div>
              <BackgroundEditor value={draft.settings.background} onChange={setCustomBackground} />
              <button
                type="button"
                onClick={toggleMediaPlaceholder}
                disabled={Boolean(sequence?.enabled)}
                aria-pressed={draft.mediaSlots.some((slot) => slot.id === "background")}
                title={sequence?.enabled ? "B-roll rotation defines its own ordered media slots" : undefined}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${draft.mediaSlots.some((slot) => slot.id === "background") ? "border-gold/60 bg-[rgba(201,162,75,0.08)] text-parchment" : "border-[var(--hairline)] text-gold-soft hover:bg-white/[0.025]"}`}
              >
                <TemplateIcon name={draft.mediaSlots.some((slot) => slot.id === "background") ? "check" : "image"} className="h-4 w-4" />
                {sequence?.enabled
                  ? "B-roll slots defined in Media"
                  : draft.mediaSlots.some((slot) => slot.id === "background")
                    ? "Media placeholder defined"
                    : "Define media placeholder"}
              </button>
              <ColorField label="Overlay color" value={draft.settings.overlayColor} onChange={(value) => setStyle("overlayColor", value)} />
            </InspectorSection>

            <InspectorSection title="Media" icon="image">
              <Segmented
                value={draft.settings.backgroundFit ?? "cover"}
                options={[{ value: "cover", label: "Fill frame" }, { value: "contain", label: "Show whole" }]}
                onChange={(backgroundFit) => setStyle("backgroundFit", backgroundFit as StyleSettings["backgroundFit"])}
              />
              {(draft.settings.backgroundFit ?? "cover") === "contain" && (
                <Segmented
                  value={draft.settings.fitBackdrop ?? "black"}
                  options={[{ value: "black", label: "Black field" }, { value: "blur", label: "Blur field" }]}
                  onChange={(fitBackdrop) => setStyle("fitBackdrop", fitBackdrop as StyleSettings["fitBackdrop"])}
                />
              )}
              {(() => {
                const transform = draft.settings.mediaTransform ?? DEFAULT_MEDIA_TRANSFORM;
                return (
                  <div className="space-y-4 rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)]/55 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-parchment">Media position</p>
                        <p className="mt-0.5 text-[10px] leading-4 text-[var(--muted)]">Select Media above the canvas to drag freely—even beyond the frame—or use exact offsets below.</p>
                      </div>
                      <button type="button" aria-label="Center image" onClick={() => setStyle("mediaTransform", { ...transform, x: 0, y: 0 })} className="min-h-9 rounded-lg border border-[var(--hairline-soft)] px-2.5 text-[10px] text-[var(--muted)] hover:text-parchment">Center</button>
                    </div>
                    <RangeField label="Zoom" value={transform.scale} min={0.25} max={5} step={0.05} suffix="×" onChange={(scale) => setStyle("mediaTransform", { ...transform, scale })} />
                    <RangeField label="Horizontal offset" value={Math.round(transform.x * 100)} min={-400} max={400} suffix="%" onChange={(x) => setStyle("mediaTransform", { ...transform, x: x / 100 })} />
                    <RangeField label="Vertical offset" value={Math.round(transform.y * 100)} min={-400} max={400} suffix="%" onChange={(y) => setStyle("mediaTransform", { ...transform, y: y / 100 })} />
                  </div>
                );
              })()}
              <SwitchField label="B-roll rotation" checked={Boolean(sequence?.enabled)} onChange={(checked) => updateSequence({ enabled: checked })} />
              {sequence?.enabled && (
                <>
                  <RangeField label="Media slots" value={sequence.sceneCount} min={2} max={6} suffix="" onChange={(value) => updateSequence({ sceneCount: value })} />
                  <RangeField label="Seconds per visual" value={sequence.duration} min={2} max={12} step={0.5} suffix="s" onChange={(value) => updateSequence({ duration: value })} />
                  <Segmented value={sequence.transition} options={[{ value: "crossfade", label: "Crossfade" }, { value: "cut", label: "Cut" }]} onChange={(value) => updateSequence({ transition: value as "crossfade" | "cut" })} />
                </>
              )}
              {draft.mediaSlots.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Template media placeholders">
                  {draft.mediaSlots.map((slot) => (
                    <span key={slot.id} className="rounded-full border border-[var(--hairline-soft)] bg-white/[0.025] px-2.5 py-1 text-[10px] text-[var(--muted)]">{slot.label}</span>
                  ))}
                </div>
              )}
              <p className="text-[11px] leading-4 text-[var(--muted)]">Templates save the slot structure, not temporary uploaded files. Studio asks for each visual in order when you apply the template.</p>
            </InspectorSection>

            <InspectorSection title="Motion" icon="motion">
              <label className="block space-y-2">
                <span className="text-xs text-[var(--muted)]">Verse entrance</span>
                <select value={draft.settings.verseIntro ?? "none"} onChange={(event) => setStyle("verseIntro", event.target.value as StyleSettings["verseIntro"])} className="field min-h-11 w-full px-3 text-sm">
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                  <option value="blur">Blur</option>
                  <option value="slide">Slide up</option>
                  <option value="scale">Scale</option>
                </select>
              </label>
              {(draft.settings.verseIntro ?? "none") !== "none" && <RangeField label="Entrance speed" value={draft.settings.verseIntroMs ?? 450} min={150} max={1000} step={50} suffix="ms" onChange={(value) => setStyle("verseIntroMs", value)} />}
              <RangeField label="Clip fade-in" value={draft.extras.clipFadeMs ?? 0} min={0} max={1200} step={50} suffix="ms" onChange={(value) => setExtra("clipFadeMs", value)} />
            </InspectorSection>
          </div>

          <div className="sticky bottom-0 z-10 grid grid-cols-2 gap-2 border-t border-[var(--hairline-soft)] bg-[var(--ink)]/95 p-4 backdrop-blur sm:hidden">
            <button type="button" onClick={save} className="min-h-11 rounded-full border border-[var(--hairline)] text-sm text-parchment">Save</button>
            <button type="button" onClick={use} className="btn-gold min-h-11 rounded-full text-sm">Use template</button>
          </div>
        </aside>
      </div>

      <p className="sr-only" aria-live="polite">{status}</p>
      {status && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--hairline)] bg-[var(--surface)] px-4 py-2 text-xs text-parchment shadow-xl">{status}</div>}

      {fullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/95 p-4" role="dialog" aria-modal="true" aria-label="Full-screen template preview">
          <div className="h-[84dvh] overflow-hidden rounded-[2rem] border-[6px] border-[var(--surface-2)]" style={{ aspectRatio: "9 / 16" }}>
            <TemplatePreview
              style={draft.settings}
              extras={draft.extras}
              sample={sample}
              replayToken={replayToken}
              animateIntro
              previewMedia={draft.mediaSlots.length > 0}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setReplayToken((value) => value + 1)} className="min-h-10 rounded-full border border-white/15 px-4 text-xs text-white/75">Replay</button>
            <button type="button" onClick={() => setFullscreen(false)} className="min-h-10 rounded-full bg-white/10 px-4 text-xs text-white">Close</button>
          </div>
        </div>
      )}
    </main>
  );
}

function InspectorSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: TemplateIconName;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      {...(defaultOpen ? { open: true } : {})}
      aria-label={`${title} controls`}
      data-testid={`inspector-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className="group px-5 py-5"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)] marker:hidden sm:min-h-8">
        <TemplateIcon name={icon} className="h-4 w-4 text-gold-soft/70" />
        {title}
        <span className="ml-auto text-base font-normal text-[var(--muted-deep)] transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="mt-4 space-y-5">{children}</div>
    </details>
  );
}

function RangeField({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between text-xs text-[var(--muted)]"><span>{label}</span><span className="font-medium tabular-nums text-gold-soft">{value}{suffix}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="slider-gold w-full" />
    </label>
  );
}

function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 text-sm text-parchment">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 rounded-full bg-white/10 transition-colors peer-checked:bg-[var(--gold)] peer-focus-visible:ring-2 peer-focus-visible:ring-gold"><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} /></span>
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 text-xs text-[var(--muted)]">
      <span>{label}</span>
      <span className="flex items-center gap-2"><span className="font-mono text-[10px] uppercase text-[var(--muted-deep)]">{value}</span><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-[var(--hairline-soft)] bg-transparent p-1" /></span>
    </label>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1 rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={value === option.value} className={`min-h-9 rounded-lg px-2 text-[11px] font-medium transition-colors ${value === option.value ? "bg-white/[0.09] text-parchment" : "text-[var(--muted)] hover:text-parchment"}`}>{option.label}</button>
      ))}
    </div>
  );
}
