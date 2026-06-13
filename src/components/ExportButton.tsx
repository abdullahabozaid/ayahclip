"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { exportVideo } from "@/lib/export";
import { getTranslationLanguage } from "@/lib/translations";
import {
  saveClip,
  captureThumbnail,
  generateClipId,
  type LibraryClip,
} from "@/lib/clip-library";

async function saveFile(file: File) {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/save-export", { method: "POST", body: form });
    if (res.ok) {
      const { saved } = await res.json();
      alert(`Saved to ~/Documents/AyahClip/Exports/${saved}`);
      return;
    }
  } catch {}
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButton() {
  const store = useAppStore();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  // On phones, the finished clip is handed to the OS share sheet ("Save Video"
  // → camera roll) instead of a download, which can't reach the gallery. We hold
  // the encoded file here so the user's tap on "Save to Photos" carries the
  // gesture the Web Share API requires.
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const selectedVerses = store.verses.filter((v) =>
    store.selectedVerseNumbers.includes(v.verse_number)
  );

  // The rendered-but-not-yet-saved MP4 for the pre-download preview: the user
  // watches the EXACT file (real scrubber, real pause, real pixels) and then
  // saves or discards it — no re-encode on save.
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);

  const encodeClip = async (): Promise<File | null> => {
    if (selectedVerses.length === 0 || !store.surah) return null;
    const reciter = reciters.find((r) => r.id === store.reciterId);
    const blob = await exportVideo({
        verses: selectedVerses,
        reciterFolder: reciter?.folder ?? "Alafasy_128kbps",
        surahNumber: store.surah.id,
        videoFormat: store.videoFormat,
        arabicFontSize: store.arabicFontSize,
        arabicFont: store.arabicFont,
        arabicFontWeight: store.arabicFontWeight,
        arabicVerseNumber: store.arabicVerseNumber,
        translationVerseNumber: store.translationVerseNumber,
        translationEnabled: store.translationEnabled,
        translationFontSize: store.translationFontSize,
        translationFont: store.translationFont,
        translationFontWeight: store.translationFontWeight,
        translationDirection: getTranslationLanguage(store.translationLanguage).direction,
        textColor: store.textColor,
        lineHeight: store.lineHeight,
        translationLineHeight: store.translationLineHeight,
        arabicTranslationGap: store.arabicTranslationGap,
        textPosition: store.textPosition,
        overlayOpacity: store.overlayOpacity,
        overlayColor: store.overlayColor,
        safeAreaTarget: store.safeAreaTarget,
        safePadding: store.safePadding,
        emphasis: store.emphasis,
        emphasisStyle: store.emphasisStyle,
        emphasisColor: store.emphasisColor,
        highlightEnabled: store.highlightEnabled,
        highlightColor: store.highlightColor,
        highlightOpacity: store.highlightOpacity,
        highlightRadius: store.highlightRadius,
        highlightPadding: store.highlightPadding,
        highlightHeight: store.highlightHeight,
        importedAudio:
          store.audioSource.mode === "imported"
            ? { url: store.audioSource.url, timings: store.audioSource.timings }
            : undefined,
        // Reciter clips: manual word-parts + the data to time them to the reciter.
        verseParts: store.audioSource.mode === "reciter" ? store.verseParts : undefined,
        recitationId: reciter?.quranComRecitationId,
        translationResourceId: getTranslationLanguage(store.translationLanguage).resourceId,
        background: store.background,
        backgroundFit: store.backgroundFit,
        fitBackdrop: store.fitBackdrop,
        backgroundVideoSync: store.backgroundVideoSync,
        videoLoopMode: store.videoLoopMode,
        verseIntro: store.verseIntro,
        verseIntroMs: store.verseIntroMs,
        textShadow: store.textShadow,
        letterbox: store.letterbox,
        onProgress: (current, total) => setProgress({ current, total }),
      });

    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    return new File(
      [blob],
      `ayahclip-${store.surah.name_simple}-${store.videoFormat}.${ext}`,
      { type: blob.type }
    );
  };

  // Keep every export in the clip library (IndexedDB) so it can be
  // scheduled from /library. Best-effort — never blocks the download.
  const saveToLibrary = async (file: File) => {
    if (!store.surah) return;
    try {
      const reciter = reciters.find((r) => r.id === store.reciterId);
      const nums = selectedVerses.map((v) => v.verse_number);
      const range =
        nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : `${nums[0]}`;
      const meta: LibraryClip = {
        id: generateClipId(),
        title: `${store.surah.name_simple} ${range}`,
        surahName: store.surah.name_simple,
        verseRange: `${store.surah.id}:${range}`,
        reciterName:
          store.audioSource.mode === "imported"
            ? "Imported audio"
            : reciter?.name ?? "Unknown reciter",
        videoFormat: store.videoFormat,
        mimeType: file.type,
        size: file.size,
        createdAt: Date.now(),
        thumbnail: await captureThumbnail(file),
        status: "draft",
      };
      await saveClip(meta, file);
    } catch (err) {
      console.warn("Could not save clip to library:", err);
    }
  };

  // Touch devices that can share files: surface the OS share sheet so the
  // user can save straight to Photos/Gallery. Desktop keeps the download.
  const deliver = (file: File) => {
    const isTouch =
      typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (isTouch && navigator.canShare?.({ files: [file] })) {
      setPendingFile(file);
    } else {
      saveFile(file);
    }
  };

  const run = async (after: (file: File) => Promise<void> | void) => {
    setExporting(true);
    setError(null);
    setPendingFile(null);
    try {
      const file = await encodeClip();
      if (file) await after(file);
    } catch (err) {
      console.error("Export failed:", err);
      setError("Export failed. Your browser may not support video encoding, or it ran out of memory. Try a shorter clip.");
    } finally {
      setExporting(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const handleExport = () =>
    run(async (file) => {
      await saveToLibrary(file);
      deliver(file);
    });

  // Render the MP4 and open it in a real player BEFORE saving anything.
  const handlePreview = () =>
    run((file) => {
      setPreview({ file, url: URL.createObjectURL(file) });
    });

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const savePreviewed = async () => {
    if (!preview) return;
    const file = preview.file;
    closePreview();
    await saveToLibrary(file);
    deliver(file);
  };

  const saveToPhotos = async () => {
    if (!pendingFile) return;
    try {
      await navigator.share({
        files: [pendingFile],
        title: "AyahClip",
        text: "Made with AyahClip",
      });
      setPendingFile(null);
    } catch (err) {
      // User dismissed the sheet — leave the button so they can try again.
      if ((err as Error)?.name === "AbortError") return;
      // Sharing genuinely failed — fall back to a download so the clip isn't lost.
      saveFile(pendingFile);
      setPendingFile(null);
    }
  };

  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

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
          <button onClick={() => { saveFile(pendingFile); setPendingFile(null); }} className="text-gold-soft hover:underline">
            Download instead
          </button>
        </div>
      </div>
    );
  }

  // Full-screen player for the rendered file: this IS the MP4 that will be
  // downloaded — true pixels, true timeline, true pause.
  if (preview) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={closePreview}>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-white/80">
            Final MP4 preview <span className="text-white/40">— exactly what gets saved</span>
          </p>
          <button onClick={closePreview} className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-white/80 hover:text-white">
            Close
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
          <video
            src={preview.url}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded-xl"
          />
        </div>
        <div
          className="flex items-center justify-center gap-3 px-4 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={closePreview} className="rounded-full border border-white/20 px-6 py-2.5 text-sm text-white/70 hover:text-white">
            Discard
          </button>
          <button onClick={savePreviewed} className="btn-gold rounded-full px-8 py-2.5 text-sm">
            Save this video
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleExport}
        disabled={exporting || selectedVerses.length === 0}
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
        disabled={exporting || selectedVerses.length === 0}
        className="w-full rounded-xl border border-[var(--hairline)] py-2.5 text-sm text-parchment transition-colors hover:border-gold disabled:opacity-50"
      >
        {exporting ? "Rendering…" : "Preview final MP4 first"}
      </button>
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-200/90">
          {error}
        </p>
      )}
    </div>
  );
}
