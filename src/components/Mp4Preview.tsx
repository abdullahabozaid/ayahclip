"use client";

// Full-screen player for a freshly rendered clip. This IS the file that gets
// saved — true pixels, a real 0:00→end timeline, real pause. Nothing overlaps
// the video; controls live above and below it.
import { useEffect, useState } from "react";
import {
  renderClipFile,
  saveRenderedToLibrary,
  deliverFileInGesture,
} from "@/lib/clip-export";

export interface RenderedClip {
  file: File;
  url: string;
  /** Present when the slow real-time recorder was used — shown to the user. */
  fallbackReason?: string;
}

/** Render the current clip with progress callbacks. Returns null on empty selection. */
export async function renderForPreview(
  onProgress: (current: number, total: number) => void
): Promise<RenderedClip | null> {
  const rendered = await renderClipFile(onProgress);
  if (!rendered) return null;
  return {
    file: rendered.file,
    url: URL.createObjectURL(rendered.file),
    fallbackReason: rendered.fallbackReason,
  };
}

export function Mp4PreviewOverlay({
  clip,
  onClose,
}: {
  clip: RenderedClip;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [libState, setLibState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        URL.revokeObjectURL(clip.url);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, clip.url]);

  // NOTE: do NOT revoke clip.url in an effect cleanup — React StrictMode runs
  // cleanups on its dev double-mount, killing the URL while the <video> is
  // still streaming it (large files then fail with "Format error"). The URL is
  // revoked explicitly on close instead.
  const close = () => {
    URL.revokeObjectURL(clip.url);
    onClose();
  };

  const save = async () => {
    setSaving(true);
    try {
      await deliverFileInGesture(clip.file);
      if (libState !== "saved") await saveRenderedToLibrary(clip.file);
      close();
    } finally {
      setSaving(false);
    }
  };

  // Library-only save: keep the clip for scheduling without downloading it.
  const saveToLibraryOnly = async () => {
    if (libState !== "idle") return;
    setLibState("saving");
    try {
      await saveRenderedToLibrary(clip.file);
      setLibState("saved");
    } catch {
      setLibState("idle");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={close}>
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-white/80">
          Final MP4 <span className="text-white/40">— exactly what gets saved</span>
        </p>
        <button
          onClick={close}
          className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-white/80 hover:text-white"
        >
          Close <kbd className="ml-1 hidden text-[10px] text-white/40 sm:inline">Esc</kbd>
        </button>
      </div>

      {clip.fallbackReason && (
        <p
          className="mx-4 mb-2 shrink-0 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-200/90"
          onClick={(e) => e.stopPropagation()}
        >
          Rendered with the slow fallback encoder: {clip.fallbackReason}
        </p>
      )}
      <div
        className="flex min-h-0 flex-1 items-center justify-center px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          src={clip.url}
          controls
          autoPlay
          playsInline
          className="max-h-full max-w-full rounded-xl"
          onLoadedMetadata={(e) => {
            // Files from the fallback MediaRecorder often report no duration,
            // which leaves the player on an endless spinner. Seeking far past
            // the end forces the browser to compute the real duration.
            const v = e.currentTarget;
            if (!Number.isFinite(v.duration) || Number.isNaN(v.duration)) {
              const reset = () => {
                v.currentTime = 0;
                v.removeEventListener("timeupdate", reset);
                v.play().catch(() => {});
              };
              v.addEventListener("timeupdate", reset);
              v.currentTime = 1e7;
            }
          }}
        />
      </div>

      <div
        className="flex shrink-0 items-center justify-center gap-3 px-4 py-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          className="rounded-full border border-white/20 px-6 py-2.5 text-sm text-white/70 hover:text-white"
        >
          Discard
        </button>
        <button
          onClick={saveToLibraryOnly}
          disabled={libState !== "idle"}
          className={`rounded-full border px-6 py-2.5 text-sm transition-colors ${
            libState === "saved"
              ? "border-emerald-400/40 text-emerald-300"
              : "border-white/20 text-white/80 hover:text-white"
          }`}
        >
          {libState === "saved"
            ? "In library ✓"
            : libState === "saving"
              ? "Saving…"
              : "Save to library"}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="btn-gold rounded-full px-8 py-2.5 text-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save this video"}
        </button>
      </div>
    </div>
  );
}
