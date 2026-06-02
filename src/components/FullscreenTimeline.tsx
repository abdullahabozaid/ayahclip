"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { TimelineEditor } from "./TimelineEditor";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
            Verse Timeline
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

      {/* The whole editor, with grown track height. Scroll if its contents
          exceed the viewport (rare, but keeps the controls reachable on
          short windows). */}
      <div
        className="flex-1 overflow-y-auto px-5 py-5"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        <TimelineEditor fullscreen />
      </div>
    </div>
  );
}
