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
import {
  firstExportFeedbackPending,
  submitFirstExportFeedback,
} from "@/lib/telemetry";

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
  const [showFirstExportQuestion, setShowFirstExportQuestion] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    setShowFirstExportQuestion(firstExportFeedbackPending());
  }, []);

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
      // saveRenderedToLibrary returns false (not throws) on a failed save, so a
      // bare await would flip to "saved" when nothing was stored.
      const ok = await saveRenderedToLibrary(clip.file);
      setLibState(ok ? "saved" : "idle");
    } catch {
      setLibState("idle");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Final MP4 preview"
      onClick={close}
    >
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
        className="flex shrink-0 flex-col items-center gap-3 px-4 py-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {showFirstExportQuestion && (
          <div className="flex w-full max-w-2xl flex-col items-center justify-between gap-2 border-y border-white/10 py-3 text-center sm:flex-row sm:text-left">
            <p className="text-xs leading-5 text-white/65">
              {feedbackSent ? "Thank you. No project content was sent." : "First clip check: did you reach this preview without help?"}
            </p>
            {!feedbackSent && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    submitFirstExportFeedback("without_help");
                    setFeedbackSent(true);
                  }}
                  className="min-h-10 rounded-full border border-white/20 px-3 text-xs text-white/80 hover:border-white/35 hover:text-white"
                >
                  Yes, on my own
                </button>
                <button
                  type="button"
                  onClick={() => {
                    submitFirstExportFeedback("needed_help");
                    setFeedbackSent(true);
                  }}
                  className="min-h-10 rounded-full px-3 text-xs text-white/55 hover:text-white"
                >
                  I needed help
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:gap-3">
          <button
            onClick={close}
            className="min-h-11 rounded-full border border-white/20 px-5 text-sm text-white/70 hover:text-white sm:px-6"
          >
            Discard
          </button>
          <button
            onClick={saveToLibraryOnly}
            disabled={libState !== "idle"}
            className={`min-h-11 rounded-full border px-5 text-sm transition-colors sm:px-6 ${
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
            className="btn-gold min-h-11 rounded-full px-6 text-sm disabled:opacity-60 sm:px-8"
          >
            {saving ? "Saving…" : "Save this video"}
          </button>
        </div>
      </div>
    </div>
  );
}
