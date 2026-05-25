"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { exportVideo } from "@/lib/export";

export function ExportButton() {
  const store = useAppStore();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const selectedVerses = store.verses.filter((v) =>
    store.selectedVerseNumbers.includes(v.verse_number)
  );

  const handleExport = async () => {
    if (selectedVerses.length === 0 || !store.surah) return;

    setExporting(true);
    const reciter = reciters.find((r) => r.id === store.reciterId);

    try {
      const blob = await exportVideo({
        verses: selectedVerses,
        reciterFolder: reciter?.folder ?? "Alafasy_128kbps",
        surahNumber: store.surah.id,
        videoFormat: store.videoFormat,
        arabicFontSize: store.arabicFontSize,
        translationEnabled: store.translationEnabled,
        translationFontSize: store.translationFontSize,
        translationFont: store.translationFont,
        textColor: store.textColor,
        overlayOpacity: store.overlayOpacity,
        background: store.background,
        onProgress: (current, total) => setProgress({ current, total }),
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ayahclip-${store.surah.name_simple}-${store.videoFormat}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting || selectedVerses.length === 0}
      className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-medium transition-colors hover:bg-emerald-500 disabled:opacity-50"
    >
      {exporting
        ? `Exporting... ${progress.current}/${progress.total}`
        : "Export Video"}
    </button>
  );
}
