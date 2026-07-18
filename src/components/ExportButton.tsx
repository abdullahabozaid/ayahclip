"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  renderClipFile,
  saveRenderedToLibrary,
  saveFile,
  deliverFileInGesture,
} from "@/lib/clip-export";
import { Mp4PreviewOverlay, type RenderedClip } from "./Mp4Preview";
import { exportFailureMessage } from "@/lib/export-errors";
import {
  durationBucket,
  telemetryErrorCode,
  trackProductEvent,
} from "@/lib/telemetry";
import { nativeMobileBridgeAvailable } from "@/lib/mobile-bridge";

export function ExportButton() {
  const store = useAppStore();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  // The export itself succeeded but the library save didn't (e.g. disk full).
  // Distinct from `error`: the file is fine, only the library copy is missing.
  const [libraryWarning, setLibraryWarning] = useState<string | null>(null);
  const [savedLocation, setSavedLocation] = useState<string | null>(null);
  // On phones, the finished clip is handed to the OS share sheet ("Save Video"
  // → camera roll) instead of a download, which can't reach the gallery. We hold
  // the encoded file here so the user's tap on "Save to Photos" carries the
  // gesture the Web Share API requires.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // The rendered-but-not-yet-saved MP4 for the pre-download preview.
  const [preview, setPreview] = useState<RenderedClip | null>(null);

  const hasSelection = store.selectedVerseNumbers.length > 0 && !!store.surah;

  const run = async (
    action: "preview" | "download",
    after: (file: File, fallbackReason?: string) => Promise<void> | void
  ) => {
    setExporting(true);
    setError(null);
    setLibraryWarning(null);
    setSavedLocation(null);
    setPendingFile(null);
    const source = useAppStore.getState().audioSource;
    const clipSeconds = source.mode === "imported"
      ? source.timings.reduce((total, timing) => total + Math.max(0, timing.end - timing.start), 0)
      : undefined;
    const duration = clipSeconds === undefined ? undefined : durationBucket(clipSeconds);
    trackProductEvent("export_started", { exportAction: action, durationBucket: duration });
    try {
      const rendered = await renderClipFile((current, total) =>
        setProgress({ current, total })
      );
      if (rendered) {
        await after(rendered.file, rendered.fallbackReason);
        trackProductEvent("export_succeeded", {
          exportAction: action,
          durationBucket: duration,
          exportPath: rendered.fromCache
            ? "cache"
            : rendered.fallbackReason
              ? "realtime"
              : "webcodecs",
        });
      }
    } catch (err) {
      console.error("Export failed:", err);
      setError(exportFailureMessage(err));
      trackProductEvent("export_failed", {
        exportAction: action,
        durationBucket: duration,
        errorCode: telemetryErrorCode(err),
      });
    } finally {
      setExporting(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const handleExport = () =>
    run("download", async (file) => {
      const savedToLibrary = await saveRenderedToLibrary(file);
      if (!savedToLibrary) {
        setLibraryWarning(
          "Exported — but this clip could not be saved to your library. Check free disk space."
        );
      }
      // After the async render there's no user gesture left, so on touch
      // devices we park the file behind a "Save to Photos" button.
      const isTouch =
        typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      if (nativeMobileBridgeAvailable()
        || (isTouch && navigator.canShare?.({ files: [file] }))) {
        setPendingFile(file);
      } else {
        const location = await saveFile(file);
        if (location) setSavedLocation(location);
      }
    });

  // Render the MP4 and open it in a real player BEFORE saving anything.
  const handlePreview = () =>
    run("preview", (file, fallbackReason) => {
      setPreview({ file, url: URL.createObjectURL(file), fallbackReason });
    });

  const saveToPhotos = async () => {
    if (!pendingFile) return;
    await deliverFileInGesture(pendingFile);
    setPendingFile(null);
  };

  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  if (preview) {
    return <Mp4PreviewOverlay clip={preview} onClose={() => setPreview(null)} />;
  }

  // After a mobile export, swap in the save-to-gallery action.
  if (pendingFile) {
    return (
      <div className="space-y-2">
        <button
          onClick={saveToPhotos}
          className="btn-gold flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4-4 3 3 5-5 4 4M4 20h16M4 8V4h4" />
          </svg>
          Save to Photos
        </button>
        <div className="flex items-center justify-between px-1 text-[11px] text-[var(--muted)]">
          <span>Choose “Save Video” in the share sheet.</span>
          <button
            onClick={() => {
              saveFile(pendingFile);
              setPendingFile(null);
            }}
            className="text-gold-soft hover:underline"
          >
            Download instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleExport}
        disabled={exporting || !hasSelection}
        className="btn-gold relative w-full overflow-hidden rounded-xl py-3.5 text-sm disabled:opacity-50"
      >
        {exporting && (
          <span
            className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        )}
        <span className="relative flex items-center justify-center gap-2">
          {exporting ? (
            `Exporting… ${progress.current}/${progress.total}`
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
              </svg>
              Export video
            </>
          )}
        </span>
      </button>
      <button
        onClick={handlePreview}
        disabled={exporting || !hasSelection}
        className="w-full rounded-xl border border-[var(--hairline)] py-2.5 text-sm text-parchment transition-colors hover:border-gold disabled:opacity-50"
      >
        {exporting ? "Rendering…" : "Preview final MP4 first"}
      </button>
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-200/90">
          {error}
        </p>
      )}
      {libraryWarning && (
        <p role="alert" className="rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 text-[11px] leading-relaxed text-gold-soft">
          {libraryWarning}
        </p>
      )}
      {savedLocation && (
        <p role="status" className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-[11px] leading-relaxed text-emerald-200/90">
          Saved to {savedLocation}
        </p>
      )}
    </div>
  );
}
