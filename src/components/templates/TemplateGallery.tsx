"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { applyTemplate } from "@/lib/apply-template";
import {
  deleteSavedTemplate,
  duplicateSavedTemplate,
  getSavedTemplates,
} from "@/lib/saved-templates";
import { DEFAULT_TEMPLATE_STYLE, TEMPLATES, isTextTemplate } from "@/lib/templates";
import type { SavedTemplate, TemplateDefinition, TemplateFamily } from "@/lib/template-model";
import { TemplateCard } from "./TemplateCard";
import { ExampleClipCard } from "./ExampleClipCard";
import { EXAMPLE_CLIPS } from "@/lib/example-clips";
import { TemplateIcon } from "./TemplateIcon";
import { InlineActionPrompt } from "@/components/InlineActionPrompt";
import { trackProductEvent } from "@/lib/telemetry";

type Filter = "featured" | "all" | "mine" | TemplateFamily;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "text", label: "Text only" },
  { id: "ayahclip", label: "AyahClip" },
  { id: "reciter", label: "Reciter" },
  { id: "nature", label: "Nature" },
  { id: "minimal", label: "Minimal" },
  { id: "broll", label: "B-roll" },
  { id: "mine", label: "My templates" },
];

export function TemplateGallery({ fromImport = false, initialFilter = "featured" }: { fromImport?: boolean; initialFilter?: "featured" | "mine" }) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [deleteTarget, setDeleteTarget] = useState<TemplateDefinition | null>(null);
  const [replaceMedia, setReplaceMedia] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      setSaved(getSavedTemplates(DEFAULT_TEMPLATE_STYLE));
      setLoaded(true);
    });
  }, []);

  const visible = useMemo(() => {
    const all: TemplateDefinition[] = [...TEMPLATES, ...saved];
    if (filter === "all") return all;
    if (filter === "mine") return saved;
    if (filter === "featured") return all.filter((template) => template.featured);
    return all.filter((template) => template.family === filter);
  }, [filter, saved]);

  const handleUseTemplate = (template: TemplateDefinition) => {
    // Text presets restyle captions only; they must never swap the creator's
    // media, whatever the global "replace media" toggle says.
    applyTemplate(template, { replaceMedia: isTextTemplate(template) ? false : replaceMedia });
    trackProductEvent("template_chosen");
    router.push("/studio");
  };

  return (
    <main className="bg-mihrab min-h-[calc(100dvh-65px)] px-5 pb-24 pt-10">
      <div className="mx-auto max-w-6xl">
        {fromImport && (
          <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-[var(--hairline)] bg-[rgba(201,162,75,0.06)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(201,162,75,0.12)] text-gold-soft">
                <TemplateIcon name="check" className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-parchment">Your recitation audio is ready</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">Choose a template, customize it if you like, then continue to Studio to add your visuals.</p>
              </div>
            </div>
            <button type="button" onClick={() => setFilter("featured")} className="self-start text-xs font-medium text-gold-soft hover:text-gold sm:self-auto">
              Show recommended
            </button>
          </div>
        )}

        <section className="mb-14">
          <div className="mb-6">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.22em] text-gold-soft/70">Clip library</p>
            <h1 className="font-display text-4xl text-parchment sm:text-5xl">Ready-made clips</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Full recitations in different styles. Download one as it is, or open it in the studio to change the reciter, the verses, the B-roll, and any other option.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {EXAMPLE_CLIPS.map((clip) => (
              <ExampleClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.22em] text-gold-soft/70">Templates</p>
            <h2 className="font-display text-3xl text-parchment sm:text-4xl">Or start from a style</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Curated Quran clip compositions inspired by @ayahclip and current short-form formats. Every preview uses the real export renderer.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/styles/editor?template=new")}
            className="btn-gold flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-full px-5 text-sm sm:self-auto"
          >
            <TemplateIcon name="sparkles" className="h-4 w-4" />
            Create template
          </button>
        </div>

        {filter === "text" ? (
          <p className="mt-6 w-fit rounded-xl border border-[var(--hairline-soft)] bg-white/[0.02] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
            <span className="font-medium text-parchment">Text-only presets.</span> Each one restyles just the Arabic and translation — your current background and media stay exactly as they are.
          </p>
        ) : (
          <label className="mt-6 flex w-fit cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--hairline-soft)] bg-white/[0.02] px-4 py-3 text-xs leading-4 text-[var(--muted)]">
            <input
              type="checkbox"
              checked={replaceMedia}
              onChange={(event) => setReplaceMedia(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--gold)]"
            />
            <span>
              <span className="font-medium text-parchment">Replace my media with the template’s media</span>
              <span className="mt-0.5 block text-xs text-[var(--muted-deep)]">Off: templates restyle text, layout, and effects while your current background stays.</span>
            </span>
          </label>
        )}

        <div className="mt-8 flex gap-2 overflow-x-auto pb-2" aria-label="Template filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
              className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-medium transition-colors ${
                filter === item.id
                  ? "border-[var(--gold)] bg-[rgba(201,162,75,0.12)] text-parchment"
                  : "border-[var(--hairline-soft)] bg-white/[0.025] text-[var(--muted)] hover:border-[var(--hairline)] hover:text-parchment"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {deleteTarget && (
          <div className="mt-6">
            <InlineActionPrompt
              title={`Delete “${deleteTarget.name}”?`}
              description="This custom template will be permanently removed. Built-in templates and saved clips are not affected."
              confirmLabel="Delete template"
              onConfirm={() => {
                setSaved(deleteSavedTemplate(deleteTarget.id));
                setDeleteTarget(null);
              }}
              onCancel={() => setDeleteTarget(null)}
            />
          </div>
        )}

        {loaded && visible.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[var(--hairline)] px-6 py-20 text-center">
            <TemplateIcon name="layout" className="mx-auto h-8 w-8 text-gold-soft/60" />
            <h2 className="font-display mt-4 text-xl text-parchment">No templates here yet</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Create your first reusable composition on the phone canvas.</p>
            <button type="button" onClick={() => router.push("/styles/editor?template=new")} className="btn-gold mt-5 min-h-11 rounded-full px-5 text-sm">
              Create template
            </button>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {visible.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUse={() => handleUseTemplate(template)}
                onCustomize={() => router.push(`/styles/editor?template=${encodeURIComponent(template.id)}`)}
                onDuplicate={() => setSaved(duplicateSavedTemplate(template))}
                onDelete={
                  template.source === "user"
                    ? () => setDeleteTarget(template)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
