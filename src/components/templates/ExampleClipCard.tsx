"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TemplatePreview } from "./TemplatePreview";
import { TemplateIcon } from "./TemplateIcon";
import { getReciter } from "@/lib/reciters";
import {
  hydrateExampleClip,
  renderExampleClip,
  resolveExampleClipTemplate,
  type ExampleClip,
} from "@/lib/example-clips";
import { saveFile, saveRenderedToLibrary } from "@/lib/clip-export";
import { trackProductEvent } from "@/lib/telemetry";

type CardState = "idle" | "opening" | "rendering" | "error";

export function ExampleClipCard({ clip }: { clip: ExampleClip }) {
  const router = useRouter();
  const template = resolveExampleClipTemplate(clip);
  const reciter = getReciter(clip.reciterId);
  const [state, setState] = useState<CardState>("idle");
  const [pct, setPct] = useState(0);

  if (!template) return null;

  const passage =
    clip.ayahEnd === clip.ayahStart
      ? `Ayah ${clip.ayahStart}`
      : `Ayat ${clip.ayahStart}–${clip.ayahEnd}`;

  const open = async () => {
    setState("opening");
    try {
      await hydrateExampleClip(clip);
      trackProductEvent("template_chosen");
      router.push("/studio");
    } catch {
      setState("error");
    }
  };

  const download = async () => {
    setState("rendering");
    setPct(0);
    trackProductEvent("export_started", { exportAction: "download" });
    try {
      const rendered = await renderExampleClip(clip, (current, total) =>
        setPct(total > 0 ? Math.round((current / total) * 100) : 0),
      );
      if (!rendered) {
        setState("error");
        return;
      }
      await saveRenderedToLibrary(rendered.file).catch(() => {});
      await saveFile(rendered.file);
      trackProductEvent("export_succeeded", { exportAction: "download" });
      setState("idle");
    } catch {
      trackProductEvent("export_failed", { exportAction: "download" });
      setState("error");
    }
  };

  const busy = state === "opening" || state === "rendering";

  return (
    <article className="group overflow-hidden rounded-2xl border border-[var(--hairline-soft)] bg-[var(--surface)] shadow-[0_18px_50px_-36px_rgba(0,0,0,0.9)] transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--hairline)]">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="relative block aspect-[9/16] w-full overflow-hidden bg-[var(--ink-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold disabled:cursor-default"
        aria-label={`Open ${clip.title} in the studio`}
      >
        <div className="absolute inset-0 z-0" style={{ background: template.swatch }} />
        <TemplatePreview
          style={template.settings}
          extras={template.extras}
          previewMedia={Boolean(clip.broll?.length) || template.mediaSlots.length > 0}
          renderWidth={270}
          className="relative z-[1] block h-full w-full"
        />
        <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/70 backdrop-blur">
          {passage}
        </span>
        {state === "rendering" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-gold" />
            <span className="text-xs text-white/80">Rendering {pct}%</span>
          </div>
        )}
      </button>
      <div className="space-y-3 p-3.5">
        <div>
          <h2 className="truncate text-sm font-medium text-parchment">{clip.title}</h2>
          <p className="mt-1 truncate text-[11px] leading-4 text-[var(--muted)]">
            {reciter ? reciter.name : "Reciter"} · {clip.description}
          </p>
        </div>
        {state === "error" && (
          <p className="text-[11px] leading-4 text-red-300">
            Something went wrong. Check your connection and try again.
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={open}
            disabled={busy}
            className="min-h-10 flex-1 rounded-xl border border-[var(--hairline)] px-3 text-xs font-medium text-parchment transition-colors hover:border-gold focus-visible:border-gold disabled:opacity-60"
          >
            {state === "opening" ? "Opening…" : "Open in studio"}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={busy}
            aria-label={`Download ${clip.title}`}
            title="Download the MP4"
            className="btn-gold flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium disabled:opacity-60"
          >
            <TemplateIcon name="download" className="h-4 w-4" />
            {state === "rendering" ? `${pct}%` : "Download"}
          </button>
        </div>
      </div>
    </article>
  );
}
