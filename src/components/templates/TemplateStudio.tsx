"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyTemplate } from "@/lib/apply-template";
import { TRANSLATION_FONTS } from "@/lib/canvas-utils";
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
import {
  TEMPLATE_BACKGROUND_PRESETS,
  reconcileSequenceMediaSlots,
  templateTextPositionFromKey,
  templateTextPositionFromPointer,
  toggleBackgroundMediaSlot,
} from "@/lib/template-canvas";
import { TemplateIcon, type TemplateIconName } from "./TemplateIcon";
import {
  FALLBACK_SAMPLE,
  loadTemplateSamples,
  TemplatePreview,
  type SampleVerse,
} from "./TemplatePreview";

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

function cloneTemplate(template: TemplateDefinition): TemplateDefinition {
  return {
    ...template,
    settings: {
      ...template.settings,
      background: { ...template.settings.background },
      textShadow: { ...template.settings.textShadow },
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
  const [movingText, setMovingText] = useState(false);
  const movingTextRef = useRef(false);
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
  const selectedTreatment = useMemo(() => {
    if (!draft) return "clean";
    if (draft.settings.highlightEnabled) return "gold";
    if (draft.settings.textShadow.color.toLowerCase() !== "#000000") return "glow";
    if (draft.settings.textShadow.blur <= 2) return "outline";
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

  const chooseBase = (template: TemplateDefinition) => {
    if (dirty && !window.confirm("Replace your unsaved changes with this template?")) return;
    setDraft(cloneTemplate(template));
    setDirty(false);
    setStatus(`Loaded ${template.name}`);
  };

  const setTreatment = (treatment: "clean" | "glow" | "outline" | "gold") => {
    change((current) => {
      const settings = { ...current.settings };
      if (treatment === "clean") {
        settings.highlightEnabled = false;
        settings.textShadow = { enabled: true, color: "#000000", blur: 5, offsetX: 0, offsetY: 2 };
      } else if (treatment === "glow") {
        settings.highlightEnabled = false;
        settings.textShadow = { enabled: true, color: "#f4f0e6", blur: 5, offsetX: 0, offsetY: 0 };
      } else if (treatment === "outline") {
        settings.highlightEnabled = false;
        settings.textShadow = { enabled: true, color: "#000000", blur: 1, offsetX: 0, offsetY: 1 };
      } else {
        settings.highlightEnabled = true;
        settings.highlightColor = settings.highlightColor ?? "#74652d";
        settings.highlightOpacity = settings.highlightOpacity ?? 0.72;
        settings.highlightRadius = settings.highlightRadius ?? 0.12;
        settings.highlightPadding = settings.highlightPadding ?? 0.5;
        settings.highlightHeight = settings.highlightHeight ?? 0.52;
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
    <main className="flex min-h-dvh flex-col bg-[var(--ink)] text-parchment lg:h-dvh lg:overflow-hidden">
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

          <div className="mb-4 flex items-center gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--surface)]/85 p-1 backdrop-blur">
            {samples.map((item, index) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setSampleIndex(index)}
                aria-pressed={sampleIndex === index}
                className={`min-h-9 rounded-full px-4 text-xs transition-colors ${sampleIndex === index ? "bg-[var(--hairline)] text-parchment" : "text-[var(--muted)] hover:text-parchment"}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div ref={phoneCanvasRef} className="relative h-[min(64dvh,720px)] min-h-[460px] overflow-hidden rounded-[2.2rem] border-[7px] border-[var(--surface-2)] bg-[var(--ink-deep)] shadow-[0_32px_90px_-30px_rgba(0,0,0,0.95)]" style={{ aspectRatio: "9 / 16" }}>
            <TemplatePreview style={draft.settings} extras={draft.extras} sample={sample} replayToken={replayToken} />
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
              aria-label="Text vertical position"
              aria-valuemin={10}
              aria-valuemax={90}
              aria-valuenow={draft.settings.textPosition}
              aria-valuetext={`${draft.settings.textPosition}% from the top`}
              onPointerDown={startTextMove}
              onPointerMove={continueTextMove}
              onPointerUp={stopTextMove}
              onPointerCancel={stopTextMove}
              onKeyDown={(event) => {
                const next = templateTextPositionFromKey(
                  draft.settings.textPosition,
                  event.key,
                  event.shiftKey ? 5 : 2,
                );
                if (next === draft.settings.textPosition) return;
                event.preventDefault();
                setStyle("textPosition", next);
              }}
              className={`group/canvas absolute inset-0 z-20 touch-none outline-none ${movingText ? "cursor-grabbing" : "cursor-grab"}`}
            >
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
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={() => setReplayToken((value) => value + 1)} className="flex min-h-10 items-center gap-2 rounded-full border border-[var(--hairline-soft)] px-3 text-xs text-[var(--muted)] hover:text-parchment">
              <TemplateIcon name="refresh" className="h-4 w-4" /> Replay
            </button>
            <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden="true" />
            <span className="hidden text-[10px] uppercase tracking-[0.14em] text-[var(--muted-deep)] sm:block">Drag canvas or use ↑↓</span>
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
            <InspectorSection title="Layout" icon="layout">
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
              <div className="rounded-xl border border-[var(--hairline-soft)] bg-white/[0.025] p-3">
                <p className="text-xs font-medium text-parchment">Uthmanic Hafs</p>
                <p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">Kept at its authentic normal face weight so harakat and verse marks remain clear.</p>
              </div>
              <RangeField label="Size" value={draft.settings.arabicFontSize} min={18} max={58} suffix="px" onChange={(value) => setStyle("arabicFontSize", value)} />
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
              <ColorField label="Text color" value={draft.settings.textColor} onChange={(value) => setStyle("textColor", value)} />
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
            <TemplatePreview style={draft.settings} extras={draft.extras} sample={sample} replayToken={replayToken} />
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

function InspectorSection({ title, icon, children }: { title: string; icon: TemplateIconName; children: React.ReactNode }) {
  return (
    <details open className="group px-5 py-5">
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)] marker:hidden">
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
