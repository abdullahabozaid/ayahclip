"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { TimelineEditor } from "./TimelineEditor";
import { ReciterVerseEditor } from "./ReciterVerseEditor";
import { StudioPreview } from "./StudioPreview";
import { verseTextAt } from "@/lib/audio-import";
import { importedPlayer } from "@/lib/imported-player";

interface FullscreenTimelineProps {
  onClose: () => void;
}

/**
 * Full-viewport editing surface for verse timings. Same TimelineEditor, much
 * more room for the waveform + verse cards + drag handles. Opens from the dock's
 * "Expand" button; ESC or the top-right Close button exits.
 */
export function FullscreenTimeline({ onClose }: FullscreenTimelineProps) {
  const surah = useAppStore((s) => s.surah);
  const selectedVerseNumbers = useAppStore((s) => s.selectedVerseNumbers);
  const isImported = useAppStore((s) => s.audioSource.mode === "imported");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!isImported) return;
    const unsub = importedPlayer.subscribe((time, playing) => {
      if (playing) return;
      const st = useAppStore.getState();
      if (st.audioSource.mode !== "imported") return;
      const timings = st.audioSource.timings;
      const idx = timings.findIndex((s) => time >= s.start && time < s.end);
      if (idx < 0) {
        if (st.playbackSegmentArabic !== null) st.setPlaybackSegment(null, null);
        return;
      }
      if (idx !== st.currentVerseIndex) st.setCurrentVerseIndex(idx);
      const seg = timings[idx];
      const verse = st.verses.find((vv) => vv.verse_number === seg.verseNumber);
      if (!verse) return;
      if (seg.splits && seg.splits.length > 0) {
        const ar = verseTextAt(seg, verse.text_uthmani, time);
        const tr =
          verse.translation != null ? verseTextAt(seg, verse.translation, time) : null;
        let segIdx = 0;
        for (const sp of seg.splits) { if (time >= sp) segIdx++; else break; }
        if (st.playbackSegmentArabic !== ar) st.setPlaybackSegment(ar, tr, segIdx === seg.splits.length);
      } else {
        if (st.playbackSegmentArabic !== null) st.setPlaybackSegment(null, null);
      }
    });
    return () => {
      unsub();
      useAppStore.getState().setPlaybackSegment(null, null);
    };
  }, [isImported]);

  const verseRange =
    selectedVerseNumbers.length === 1
      ? `verse ${selectedVerseNumbers[0]}`
      : selectedVerseNumbers.length > 1
        ? `verses ${selectedVerseNumbers[0]}–${selectedVerseNumbers[selectedVerseNumbers.length - 1]}`
        : "";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--ink)]"
      role="dialog"
      aria-label="Verse timeline editor"
    >
      {/* Header — quiet, identifies the verses being edited. */}
      <header
        className="flex shrink-0 items-center justify-between border-b border-[var(--hairline-soft)] bg-[var(--ink)]/95 px-5 py-3 backdrop-blur-xl"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] uppercase tracking-[0.25em] text-gold-soft/80">
            {isImported ? "Verse Timeline" : "Verse Editor"}
          </span>
          {surah && (
            <span className="text-sm text-[var(--muted)]">
              {surah.name_simple}
              {verseRange ? <span className="text-[var(--muted-deep)]"> · {verseRange}</span> : null}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex h-10 items-center gap-2 rounded-full border border-[var(--hairline)] px-4 text-sm text-parchment transition-colors hover:border-gold"
          title="Return to the studio"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
          Done
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[var(--muted)]">Esc</kbd>
        </button>
      </header>

      {/* Preview on top (mobile) / left (lg+); timeline below (mobile) /
          right (lg+). The preview tracks the playhead live so users can
          confirm caption splits without playing. */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <section className="bg-mihrab-still relative flex shrink-0 items-center justify-center overflow-hidden border-b border-[var(--hairline-soft)] p-3 lg:max-w-[420px] lg:basis-[40%] lg:border-b-0 lg:border-r lg:p-5">
          <div className="flex h-full max-h-[42dvh] w-full items-center justify-center lg:max-h-none">
            <StudioPreview />
          </div>
        </section>

        <section className="flex-1 overflow-y-auto px-5 py-5">
          {isImported ? <TimelineEditor fullscreen /> : <ReciterVerseEditor />}
        </section>
      </div>
    </div>
  );
}
