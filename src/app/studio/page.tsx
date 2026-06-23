"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { saveProject, generateProjectId, saveBlob, getProject } from "@/lib/projects";
import { fetchVerses } from "@/lib/api";
import { getTranslationLanguage } from "@/lib/translations";
import { StudioPreview } from "@/components/StudioPreview";
import { StudioSettings } from "@/components/StudioSettings";
import { VerseCardEditor } from "@/components/VerseCardEditor";
import { ReciterVerseEditor } from "@/components/ReciterVerseEditor";
import { TimelineEditor } from "@/components/TimelineEditor";
import { FullscreenTimeline } from "@/components/FullscreenTimeline";
import { FRAME_MODES, FrameMode } from "@/components/PlatformChrome";
import {
  Mp4PreviewOverlay,
  renderForPreview,
  type RenderedClip,
} from "@/components/Mp4Preview";

export default function StudioPage() {
  const router = useRouter();
  const store = useAppStore();
  const surah = store.surah;
  const selectedVerseNumbers = store.selectedVerseNumbers;
  // Settings stay tucked away by default; users tap the header toggle to
  // reveal them. Keeps the preview surface uncluttered on every screen size.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // "See the final MP4": renders the actual export and plays the file.
  const [mp4Clip, setMp4Clip] = useState<RenderedClip | null>(null);
  const [mp4Rendering, setMp4Rendering] = useState(false);
  const [mp4Progress, setMp4Progress] = useState({ current: 0, total: 0 });
  const [frameMode, setFrameMode] = useState<FrameMode>("studio");
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [timelineFullscreen, setTimelineFullscreen] = useState(false);
  // Two ways to edit imported verses: "words" (per-verse cards: split text,
  // trim words, duplicate) and "timeline" (waveform with draggable verse
  // boundaries). Each suits a different job, so the user picks.
  const [editorView, setEditorView] = useState<"words" | "timeline">("words");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const savedResetRef = useRef<ReturnType<typeof setTimeout>>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const savedAudioUrlRef = useRef<string | null>(null);
  const savedVideoUrlRef = useRef<string | null>(null);

  // Vertical platform frames only make sense for 9:16
  const framesAllowed = store.videoFormat === "9:16";

  const openMp4Preview = useCallback(async () => {
    if (mp4Rendering) return;
    setMp4Rendering(true);
    setMp4Progress({ current: 0, total: 0 });
    try {
      const clip = await renderForPreview((current, total) =>
        setMp4Progress({ current, total })
      );
      if (clip) setMp4Clip(clip);
    } catch (err) {
      console.error("MP4 preview render failed:", err);
      alert("Could not render the preview. Try a shorter clip, or use Export directly.");
    } finally {
      setMp4Rendering(false);
    }
  }, [mp4Rendering]);

  useEffect(() => {
    if (!surah || selectedVerseNumbers.length === 0) return;
    if (!store.projectId) {
      store.setProjectId(generateProjectId());
    }
  }, [surah, selectedVerseNumbers.length]);

  useEffect(() => {
    if (!framesAllowed && frameMode !== "studio") setFrameMode("studio");
  }, [framesAllowed, frameMode]);

  useEffect(() => {
    if (!surah) return;
    const lang = getTranslationLanguage(store.translationLanguage);
    fetchVerses(surah.id, lang.resourceId).then((newVerses) => {
      store.setVerses(newVerses);
    });
  }, [store.translationLanguage]);

  // Build + persist the current project (record + uploaded-media blobs). Shared
  // by autosave (debounced) and the manual Save button so they never drift.
  const saveNow = useCallback(async () => {
    const state = useAppStore.getState();
    if (!state.surah || state.selectedVerseNumbers.length === 0 || !state.projectId) return;
    const id = state.projectId;
    const src = state.audioSource;
    const sel = state.selectedVerseNumbers;
    // Preserve a user-chosen cover thumbnail across saves.
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

    await saveProject({
      id,
      name: `${state.surah.name_simple} ${sel[0]}-${sel[sel.length - 1]}`,
      surahId: state.surah.id,
      surahName: state.surah.name_simple,
      selectedVerseNumbers: sel,
      imported,
      verseParts: Object.keys(state.verseParts).length ? state.verseParts : undefined,
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
        translationLineHeight: state.translationLineHeight,
        arabicTranslationGap: state.arabicTranslationGap,
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
  }, []);

  // Manual save — gives an explicit "Saved ✓" so the clip is clearly stored on
  // the dashboard and retrievable later (autosave still runs in the background).
  const handleSaveClick = useCallback(async () => {
    setSaveState("saving");
    try {
      await saveNow();
      setSaveState("saved");
      if (savedResetRef.current) clearTimeout(savedResetRef.current);
      savedResetRef.current = setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("idle");
    }
  }, [saveNow]);

  useEffect(() => {
    if (!surah || selectedVerseNumbers.length === 0 || !store.projectId) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveNow();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    saveNow,
    store.projectId, store.reciterId, store.videoFormat, store.arabicFontSize,
    store.arabicFont, store.arabicVerseNumber, store.translationEnabled, store.translationFontSize,
    store.translationFont, store.translationLanguage, store.textColor,
    store.lineHeight, store.translationLineHeight, store.arabicTranslationGap, store.textPosition, store.overlayOpacity, store.overlayColor,
    store.safeAreaTarget, store.safePadding, store.background, store.backgroundFit, store.fitBackdrop, store.videoLoopMode, store.textShadow, store.letterbox,
    store.emphasis, store.emphasisStyle, store.emphasisColor,
    store.audioSource,
    surah, selectedVerseNumbers,
  ]);

  if (!surah || selectedVerseNumbers.length === 0) {
    return (
      <main className="bg-mihrab flex min-h-dvh items-center justify-center px-5">
        <div className="panel mx-auto max-w-md px-8 py-16 text-center">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--hairline)] text-2xl text-gold-soft">
            ﷽
          </span>
          <h1 className="font-display text-2xl text-parchment">No verses selected</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
            Choose a surah and pick your verses to begin crafting your clip.
          </p>
          <button
            onClick={() => router.push("/browse")}
            className="btn-gold mt-7 rounded-full px-6 py-3 text-sm"
          >
            Browse the Quran
          </button>
        </div>
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
            onClick={handleSaveClick}
            disabled={saveState === "saving"}
            className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-colors disabled:opacity-60 ${
              saveState === "saved"
                ? "bg-emerald-accent/20 text-emerald-soft ring-1 ring-emerald-soft/40"
                : "btn-ghost"
            }`}
            title="Save this clip to your dashboard so you can reopen it later"
          >
            {saveState === "saved" ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3h11l3 3v15H5z M9 3v5h6 M8 21v-7h8v7" />
              </svg>
            )}
            <span className="hidden sm:inline">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
            </span>
          </button>

          <button
            onClick={openMp4Preview}
            disabled={mp4Rendering}
            className="btn-ghost flex h-9 items-center gap-1.5 rounded-full px-3 disabled:opacity-70"
            aria-label="Preview the final MP4"
            title="Render and watch the exact MP4 that export produces"
          >
            {mp4Rendering ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                <span className="hidden text-xs sm:inline">
                  {mp4Progress.total > 0
                    ? `Rendering ${mp4Progress.current}/${mp4Progress.total}`
                    : "Rendering…"}
                </span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V5a1 1 0 011-1h4M4 15v4a1 1 0 001 1h4m6-16h4a1 1 0 011 1v4m0 6v4a1 1 0 01-1 1h-4" />
                  <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
                </svg>
                <span className="hidden text-xs sm:inline">Final MP4</span>
              </>
            )}
          </button>

          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className={`flex h-9 items-center gap-2 rounded-full px-3 text-sm transition-colors ${
              settingsOpen
                ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                : "btn-ghost"
            }`}
            aria-label="Toggle settings"
            title="Style, background, fonts & export options"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.5M3.5 6h2M14 12h6M3.5 12h6.5M8 18h12M3.5 18h1" />
              <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
              <circle cx="6" cy="18" r="2" fill="currentColor" stroke="none" />
            </svg>
            <span className="hidden sm:inline">{settingsOpen ? "Hide" : "Style"}</span>
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

      {/* Verse editor dock. Uploaded clips get the Word-split / Timeline editor;
          library (reciter) clips get the word-part editor timed to the reciter.
          Height is bounded so the preview above is always visible; collapse
          shrinks it to just this bar. */}
      {(store.audioSource.mode === "imported" || selectedVerseNumbers.length > 0) && (
        <div className="shrink-0 border-t border-[var(--hairline-soft)] bg-[var(--ink)] px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-5">
          <div className="flex items-center gap-2">
            {/* Collapse / expand the dock */}
            <button
              onClick={() => setTimelineOpen((v) => !v)}
              className="flex items-center gap-2 text-left"
              aria-expanded={timelineOpen}
              title={timelineOpen ? "Minimize editor" : "Show editor"}
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
                Verse Editor
              </span>
            </button>

            {/* The Word-split / Timeline toggle is only for uploaded clips. */}
            {timelineOpen && store.audioSource.mode === "imported" && (
              <div className="ml-1 flex items-center gap-0.5 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-0.5">
                <button
                  onClick={() => setEditorView("words")}
                  className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                    editorView === "words"
                      ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                      : "text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  Word split
                </button>
                <button
                  onClick={() => setEditorView("timeline")}
                  className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                    editorView === "timeline"
                      ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                      : "text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  Timeline
                </button>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              {timelineOpen && (
                <button
                  onClick={() => setTimelineFullscreen(true)}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--hairline)] px-3 text-[11px] text-parchment transition-colors hover:border-gold"
                  title="Edit in a full-screen editor with more room"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V5a1 1 0 011-1h4M4 15v4a1 1 0 001 1h4m6-16h4a1 1 0 011 1v4m0 6v4a1 1 0 01-1 1h-4" />
                  </svg>
                  <span className="hidden sm:inline">Expand</span>
                </button>
              )}
              <button
                onClick={() => setTimelineOpen((v) => !v)}
                className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--hairline-soft)] px-3 text-[11px] text-[var(--muted)] transition-colors hover:border-gold hover:text-parchment"
              >
                {timelineOpen ? "Minimize" : "Show"}
              </button>
            </div>
          </div>

          {timelineOpen && (
            <div className="mt-3 max-h-[42vh] overflow-y-auto pr-0.5">
              {store.audioSource.mode === "imported" ? (
                editorView === "words" ? <VerseCardEditor /> : <TimelineEditor />
              ) : (
                <ReciterVerseEditor />
              )}
            </div>
          )}
        </div>
      )}

      {timelineFullscreen && (
        <FullscreenTimeline onClose={() => setTimelineFullscreen(false)} />
      )}

      {mp4Clip && (
        <Mp4PreviewOverlay clip={mp4Clip} onClose={() => setMp4Clip(null)} />
      )}
    </main>
  );
}
