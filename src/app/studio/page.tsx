"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { saveProject, generateProjectId, saveBlob, getProject } from "@/lib/projects";
import { fetchVerses } from "@/lib/api";
import { getTranslationLanguage } from "@/lib/translations";
import { StudioPreview } from "@/components/StudioPreview";
import { StudioSettings } from "@/components/StudioSettings";
import { TimelineEditor } from "@/components/TimelineEditor";
import { FullscreenTimeline } from "@/components/FullscreenTimeline";
import { FullscreenPreview } from "@/components/FullscreenPreview";
import { FRAME_MODES, FrameMode } from "@/components/PlatformChrome";

export default function StudioPage() {
  const router = useRouter();
  const store = useAppStore();
  const surah = store.surah;
  const selectedVerseNumbers = store.selectedVerseNumbers;
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [frameMode, setFrameMode] = useState<FrameMode>("studio");
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [timelineFullscreen, setTimelineFullscreen] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const savedAudioUrlRef = useRef<string | null>(null);
  const savedVideoUrlRef = useRef<string | null>(null);

  // Vertical platform frames only make sense for 9:16
  const framesAllowed = store.videoFormat === "9:16";

  useEffect(() => {
    if (!surah || selectedVerseNumbers.length === 0) return;
    if (!store.projectId) {
      store.setProjectId(generateProjectId());
    }
  }, [surah, selectedVerseNumbers.length]);

  useEffect(() => {
    if (!framesAllowed && frameMode !== "studio") setFrameMode("studio");
  }, [framesAllowed, frameMode]);

  // On phones/tablets, start with the settings drawer closed so the preview is
  // visible first (it opens as an overlay, not beside the preview).
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setSettingsOpen(false);
  }, []);

  useEffect(() => {
    if (!surah) return;
    const lang = getTranslationLanguage(store.translationLanguage);
    fetchVerses(surah.id, lang.resourceId).then((newVerses) => {
      store.setVerses(newVerses);
    });
  }, [store.translationLanguage]);

  useEffect(() => {
    if (!surah || selectedVerseNumbers.length === 0 || !store.projectId) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      const state = useAppStore.getState();
      const id = state.projectId!;
      const src = state.audioSource;
      // Preserve a user-chosen cover thumbnail across autosaves.
      const existingThumb = (await getProject(id))?.thumbnail;

      // Persist uploaded media so the clip (and its editable verse timeline)
      // can be fully restored later. Blobs are saved once per URL.
      let imported: import("@/types").Project["imported"];
      if (src.mode === "imported") {
        const videoBg = state.background.type === "video" && state.background.value.startsWith("blob:");
        imported = { name: src.name, timings: src.timings, videoBg };
        if (savedAudioUrlRef.current !== src.url) {
          try {
            await saveBlob(`audio:${id}`, await (await fetch(src.url)).blob());
            savedAudioUrlRef.current = src.url;
          } catch {
            /* blob URL may be gone */
          }
        }
        if (videoBg && savedVideoUrlRef.current !== state.background.value) {
          try {
            await saveBlob(`video:${id}`, await (await fetch(state.background.value)).blob());
            savedVideoUrlRef.current = state.background.value;
          } catch {
            /* ignore */
          }
        }
      }

      saveProject({
        id,
        name: `${state.surah!.name_simple} ${selectedVerseNumbers[0]}-${selectedVerseNumbers[selectedVerseNumbers.length - 1]}`,
        surahId: state.surah!.id,
        surahName: state.surah!.name_simple,
        selectedVerseNumbers: state.selectedVerseNumbers,
        imported,
        settings: {
          reciterId: state.reciterId,
          videoFormat: state.videoFormat,
          arabicFontSize: state.arabicFontSize,
          arabicFont: state.arabicFont,
          arabicFontWeight: state.arabicFontWeight,
          arabicVerseNumber: state.arabicVerseNumber,
          translationEnabled: state.translationEnabled,
          translationFontSize: state.translationFontSize,
          translationFont: state.translationFont,
          translationFontWeight: state.translationFontWeight,
          translationLanguage: state.translationLanguage,
          textColor: state.textColor,
          lineHeight: state.lineHeight,
          textPosition: state.textPosition,
          overlayOpacity: state.overlayOpacity,
          overlayColor: state.overlayColor,
          safeAreaTarget: state.safeAreaTarget,
          safePadding: state.safePadding,
          background: state.background,
          backgroundFit: state.backgroundFit,
          fitBackdrop: state.fitBackdrop,
          videoLoopMode: state.videoLoopMode,
          verseIntro: state.verseIntro,
          verseIntroMs: state.verseIntroMs,
          textShadow: state.textShadow,
          letterbox: state.letterbox,
          emphasis: state.emphasis,
          emphasisStyle: state.emphasisStyle,
          emphasisColor: state.emphasisColor,
        },
        thumbnail: existingThumb,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    store.projectId, store.reciterId, store.videoFormat, store.arabicFontSize,
    store.arabicFont, store.arabicVerseNumber, store.translationEnabled, store.translationFontSize,
    store.translationFont, store.translationLanguage, store.textColor,
    store.lineHeight, store.textPosition, store.overlayOpacity, store.overlayColor,
    store.safeAreaTarget, store.safePadding, store.background, store.backgroundFit, store.fitBackdrop, store.videoLoopMode, store.textShadow, store.letterbox,
    store.emphasis, store.emphasisStyle, store.emphasisColor,
    store.audioSource,
    surah, selectedVerseNumbers,
  ]);

  if (!surah || selectedVerseNumbers.length === 0) {
    return (
      <main className="bg-mihrab flex min-h-dvh flex-col items-center justify-center gap-5">
        <p className="font-display text-2xl text-parchment">No verses selected</p>
        <p className="text-sm text-[var(--muted)]">Choose a surah and pick your verses to begin.</p>
        <button
          onClick={() => router.push("/browse")}
          className="btn-gold rounded-full px-6 py-3 text-sm"
        >
          Browse the Quran
        </button>
      </main>
    );
  }

  const verseRange =
    selectedVerseNumbers.length === 1
      ? `verse ${selectedVerseNumbers[0]}`
      : `verses ${selectedVerseNumbers[0]}–${selectedVerseNumbers[selectedVerseNumbers.length - 1]}`;

  return (
    <main className="flex h-dvh flex-col bg-[var(--ink)]">
      {/* Studio top bar — pad for the notch / status bar on mobile */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--hairline-soft)] bg-[var(--ink)]/90 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/surah/${surah.id}`)}
            className="flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-parchment"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m6 6-6-6 6-6" />
            </svg>
            Back
          </button>
          <div className="hidden items-baseline gap-2 sm:flex">
            <span className="font-display text-lg tracking-wide text-parchment">{surah.name_simple}</span>
            <span className="text-sm text-[var(--muted)]">· {verseRange}</span>
          </div>
        </div>

        {/* Preview-as frame selector */}
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1 md:flex">
            {FRAME_MODES.map((m) => {
              const disabled = m.id !== "studio" && !framesAllowed;
              return (
                <button
                  key={m.id}
                  onClick={() => setFrameMode(m.id)}
                  disabled={disabled}
                  title={disabled ? "Switch to 9:16 to preview device frames" : undefined}
                  className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                    frameMode === m.id
                      ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                      : disabled
                        ? "cursor-not-allowed text-[var(--muted-deep)] opacity-40"
                        : "text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {(frameMode === "tiktok" || frameMode === "reels") && (
            <>
              <button
                onClick={() => setShowSafeZones((v) => !v)}
                className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs transition-colors ${
                  showSafeZones
                    ? "bg-red-500/20 text-red-300 ring-1 ring-red-400/50"
                    : "btn-ghost"
                }`}
                title="Show platform safe zones"
              >
                <span className="h-2.5 w-2.5 rounded-sm border border-current" />
                Safe zones
              </button>
              <button
                onClick={() =>
                  store.setSafeAreaTarget(
                    store.safeAreaTarget === frameMode ? "none" : frameMode
                  )
                }
                className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs transition-colors ${
                  store.safeAreaTarget === frameMode
                    ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                    : "btn-ghost"
                }`}
                title="Keep text inside the safe area"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="6" width="12" height="12" rx="1.5" />
                  <path strokeLinecap="round" d="M3 9V5a2 2 0 012-2h4m6 0h4a2 2 0 012 2v4m0 6v4a2 2 0 01-2 2h-4m-6 0H5a2 2 0 01-2-2v-4" />
                </svg>
                Fit text
              </button>
            </>
          )}

          <button
            onClick={() => setFullscreen(true)}
            className="btn-ghost flex h-9 w-9 items-center justify-center rounded-full"
            aria-label="Fullscreen preview"
            title="Fullscreen preview"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V5a1 1 0 011-1h4M4 15v4a1 1 0 001 1h4m6-16h4a1 1 0 011 1v4m0 6v4a1 1 0 01-1 1h-4" />
            </svg>
          </button>

          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="btn-ghost flex h-9 items-center gap-2 rounded-full px-3 text-sm lg:hidden"
            aria-label="Toggle settings"
          >
            {settingsOpen ? "Hide" : "Settings"}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Preview stage */}
        <section className="bg-mihrab-still relative flex flex-1 flex-col items-center justify-center overflow-y-auto p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <StudioPreview frameMode={frameMode} showSafeZones={showSafeZones} />

          {/* Mobile frame selector */}
          {framesAllowed && (
            <div className="mt-6 flex items-center gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1 md:hidden">
              {FRAME_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setFrameMode(m.id)}
                  className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                    frameMode === m.id
                      ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                      : "text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Dim the preview behind the settings drawer on small screens */}
        {settingsOpen && (
          <button
            aria-label="Close settings"
            onClick={() => setSettingsOpen(false)}
            className="absolute inset-0 z-20 bg-black/50 lg:hidden"
          />
        )}

        {/* Settings — overlay drawer below lg, inline column at lg+ so it never
            squeezes the preview on phones. */}
        <aside
          className={`z-30 overflow-y-auto bg-[var(--ink)] transition-all duration-300 lg:static lg:z-auto lg:shrink-0 lg:border-l lg:border-[var(--hairline-soft)] lg:shadow-none ${
            settingsOpen
              ? "absolute inset-y-0 right-0 w-[88%] max-w-[360px] border-l border-[var(--hairline-soft)] shadow-2xl lg:w-[360px] lg:max-w-none lg:shadow-none"
              : "w-0 overflow-hidden border-l-0"
          }`}
        >
          <StudioSettings />
        </aside>
      </div>

      {/* Verse timeline dock — imported audio only */}
      {store.audioSource.mode === "imported" && (
        <div className="shrink-0 border-t border-[var(--hairline-soft)] bg-[var(--ink)] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mb-2.5 flex items-center gap-2">
            <button
              onClick={() => setTimelineOpen((v) => !v)}
              className="flex flex-1 items-center gap-2 text-left"
              aria-expanded={timelineOpen}
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-3.5 w-3.5 text-gold-soft/80 transition-transform ${timelineOpen ? "" : "-rotate-90"}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-gold-soft/80">
                Verse Timeline
              </span>
              <span className="text-[11px] text-[var(--muted-deep)]">
                {timelineOpen ? "— set where each verse begins and ends" : "— click to expand"}
              </span>
            </button>
            <button
              onClick={() => setTimelineFullscreen(true)}
              className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--hairline)] px-3 text-[11px] text-parchment transition-colors hover:border-gold"
              title="Edit verses in a full-screen editor (more room for the waveform and handles)"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V5a1 1 0 011-1h4M4 15v4a1 1 0 001 1h4m6-16h4a1 1 0 011 1v4m0 6v4a1 1 0 01-1 1h-4" />
              </svg>
              Expand
            </button>
          </div>
          {timelineOpen && <TimelineEditor />}
        </div>
      )}

      {timelineFullscreen && (
        <FullscreenTimeline onClose={() => setTimelineFullscreen(false)} />
      )}

      {fullscreen && (
        <FullscreenPreview
          onClose={() => setFullscreen(false)}
          frameMode={frameMode}
          showSafeZones={showSafeZones}
        />
      )}
    </main>
  );
}
