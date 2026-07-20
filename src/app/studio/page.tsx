"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { saveProject, generateProjectId, saveBlob, getProject } from "@/lib/projects";
import { captureSceneThumbnail } from "@/lib/scene-thumbnail";
import { fetchVerses } from "@/lib/api";
import { getTranslationLanguage } from "@/lib/translations";
import {
  isNativeMobileEditor,
  requestNativeProjectHydration,
  sendNativeProjectChange,
  subscribeNativeMediaImports,
  type MobileProjectSnapshotV1,
} from "@/lib/mobile-bridge";
import {
  hydrateStoreFromMobileProject,
  snapshotFromWebProject,
} from "@/lib/mobile-project-adapter";
import { StudioPreview } from "@/components/StudioPreview";
import { StudioSettings, type StudioSettingsSectionId } from "@/components/StudioSettings";
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
import { exportFailureMessage } from "@/lib/export-errors";
import {
  durationBucket,
  telemetryErrorCode,
  trackOncePerJourney,
  trackProductEvent,
} from "@/lib/telemetry";
import { openBulkCandidateInStudio, persistBulkCandidateLook, type BulkStudioNavigation } from "@/lib/bulk-studio";
import { deleteBulkOutput, loadBulkJob, saveBulkJob } from "@/lib/bulk-jobs";
import { captureStyleSnapshot } from "@/lib/style-snapshot";

// Editor zoom bounds. CSS `zoom` reflows layout, so the page scrolls naturally
// when zoomed past the viewport (and shrinks within it when zoomed out).
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.25;
const ZOOM_STEP = 0.1;
const clampZoom = (z: number) =>
  Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;

const isDesktopWorkspace = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

type SaveFailureReason = "invalid" | "media" | "project";
type SaveResult =
  | { ok: true }
  | { ok: false; reason: SaveFailureReason };
type StudioTool = "layouts" | "media" | "audio" | "text" | "captions" | "config";

function saveFailureMessage(reason: SaveFailureReason): string {
  if (reason === "media") {
    return "The source media could not be stored. Keep this tab open, free some browser storage, then retry.";
  }
  if (reason === "invalid") {
    return "Choose at least one ayah before saving this clip.";
  }
  return "The project could not be stored. Free some browser storage or leave private browsing, then retry.";
}

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
  const [mp4Error, setMp4Error] = useState<string | null>(null);
  const [frameMode, setFrameMode] = useState<FrameMode>("studio");
  const [showSafeZones, setShowSafeZones] = useState(false);
  // Keep the canvas as the visual centre of the workspace on first load. The
  // dock remains one click away, but no longer steals a third of a laptop
  // viewport before the creator asks to edit timing details.
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineFullscreen, setTimelineFullscreen] = useState(false);
  // Two ways to edit imported verses: "words" (per-verse cards: split text,
  // trim words, duplicate) and "timeline" (waveform with draggable verse
  // boundaries). Each suits a different job, so the user picks.
  const [editorView, setEditorView] = useState<"words" | "timeline">(
    store.audioSource.mode === "imported" ? "timeline" : "words"
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<StudioTool>("layouts");
  const [requestedInspectorSection, setRequestedInspectorSection] = useState<StudioSettingsSectionId | null>(null);
  const [bulkNavigation, setBulkNavigation] = useState<BulkStudioNavigation | null>(null);
  const [bulkNavigationBusy, setBulkNavigationBusy] = useState(false);
  const [applyLookOpen, setApplyLookOpen] = useState(false);
  const [applyLookMedia, setApplyLookMedia] = useState(false);
  const [applyLookState, setApplyLookState] = useState<"idle" | "busy" | "done">("idle");
  const savedResetRef = useRef<ReturnType<typeof setTimeout>>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const savedAudioUrlRef = useRef<string | null>(null);
  const savedVideoUrlRef = useRef<string | null>(null);
  const savedBackgroundUrlsRef = useRef<Set<string>>(new Set());
  // Which project id the three dedup refs above belong to — they are cleared
  // whenever saveNow targets a different id (see the identity guard there).
  const savedMediaProjectIdRef = useRef<string | null>(null);
  const nativeSnapshotRef = useRef<MobileProjectSnapshotV1 | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("bulk");
    const candidateId = params.get("clip");
    if (!jobId || !candidateId) return;
    let cancelled = false;
    setBulkNavigationBusy(true);
    openBulkCandidateInStudio(jobId, candidateId)
      .then((navigation) => {
        if (!cancelled) {
          setBulkNavigation(navigation);
          setEditorView("timeline");
          setTimelineOpen(true);
          setActiveTool("captions");
        }
      })
      .catch((reason: unknown) => { if (!cancelled) setSaveError(reason instanceof Error ? reason.message : "The bulk clip could not be opened."); })
      .finally(() => { if (!cancelled) setBulkNavigationBusy(false); });
    return () => { cancelled = true; };
  }, []);

  // Safety net for every OTHER way of leaving a bulk clip (site nav, browser
  // back): persist the clip's look on unmount. Fire-and-forget — IndexedDB
  // writes complete even as the page tears down.
  const bulkNavigationRef = useRef<BulkStudioNavigation | null>(null);
  bulkNavigationRef.current = bulkNavigation;
  useEffect(() => () => {
    const navigation = bulkNavigationRef.current;
    if (navigation) void persistBulkCandidateLook(navigation.jobId, navigation.candidateId).catch(() => {});
  }, []);

  const openBulkSibling = async (candidateId: string | undefined) => {
    if (!bulkNavigation || !candidateId || bulkNavigationBusy) return;
    setBulkNavigationBusy(true);
    try {
      // Keep this clip's edits (look + durable media) before the store is
      // rebuilt for the sibling — otherwise they vanish on return.
      await persistBulkCandidateLook(bulkNavigation.jobId, bulkNavigation.candidateId);
      const navigation = await openBulkCandidateInStudio(bulkNavigation.jobId, candidateId);
      setBulkNavigation(navigation);
      setEditorView("timeline");
      setTimelineOpen(true);
      setActiveTool("captions");
      router.replace(`/studio?bulk=${encodeURIComponent(navigation.jobId)}&clip=${encodeURIComponent(candidateId)}`);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "The next bulk clip could not be opened.");
    } finally {
      setBulkNavigationBusy(false);
    }
  };

  const applyLookToAllClips = async () => {
    if (!bulkNavigation || applyLookState === "busy") return;
    setApplyLookState("busy");
    try {
      const job = await loadBulkJob(bulkNavigation.jobId);
      if (!job) throw new Error("The bulk collection could not be loaded.");
      const snapshot = captureStyleSnapshot(applyLookMedia);
      await saveBulkJob({
        ...job,
        styleOverride: snapshot,
        // "Apply to ALL clips" means all: individual clips' saved looks are
        // superseded, or they would silently keep their old style.
        candidates: job.candidates.map((candidate) => ({ ...candidate, styleOverride: null })),
        // Every clip's look just changed — previous renders are stale.
        renderTasks: job.renderTasks.map((task) => ({ candidateId: task.candidateId, status: "idle" as const, progress: 0 })),
      });
      await Promise.all(job.renderTasks.map((task) => deleteBulkOutput(job.id, task.candidateId))).catch(() => {});
      setApplyLookState("done");
      setTimeout(() => { setApplyLookState("idle"); setApplyLookOpen(false); }, 2000);
    } catch (reason) {
      setApplyLookState("idle");
      setSaveError(reason instanceof Error ? reason.message : "The look could not be applied to the collection.");
    }
  };

  useEffect(() => {
    if (!isNativeMobileEditor(window.location.search)) return;
    let cancelled = false;
    const unsubscribeMediaImports = subscribeNativeMediaImports((media) => {
      const snapshot = nativeSnapshotRef.current;
      if (!snapshot) return;
      const existingIDs = new Set(snapshot.media.map((item) => item.id));
      const additions = media.filter((item) => !existingIDs.has(item.id));
      if (additions.length > 0) {
        nativeSnapshotRef.current = {
          ...snapshot,
          media: [...snapshot.media, ...additions],
          updatedAtMilliseconds: Date.now(),
        };
      }
    });
    requestNativeProjectHydration("ayahclip-web-0.1.0", [
      "quran-range",
      "recognition-review",
      "templates",
      "timeline",
      "broll",
      "native-media",
      "export",
    ])
      .then(async (snapshot) => {
        if (!snapshot || cancelled) return;
        nativeSnapshotRef.current = snapshot;
        await hydrateStoreFromMobileProject(snapshot);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSaveError(error instanceof Error ? error.message : "The native project could not be opened.");
        }
      });
    return () => {
      cancelled = true;
      unsubscribeMediaImports();
    };
  }, []);

  useEffect(() => {
    trackOncePerJourney("studio_opened");
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.classList.add("studio-active");
    document.body.classList.add("studio-active");
    if (isDesktopWorkspace()) {
      setSettingsOpen(true);
      setTimelineOpen(true);
    }
    return () => {
      document.documentElement.classList.remove("studio-active");
      document.body.classList.remove("studio-active");
    };
  }, []);

  // Phones keep one editing surface open at a time. Desktop has enough room for
  // the approved three-part workspace, so the inspector and timeline may stay
  // visible together while the creator tunes a clip.
  const openSettings = (next: boolean) => {
    setSettingsOpen(next);
    if (next && !isDesktopWorkspace()) setTimelineOpen(false);
  };
  const openTimeline = (next: boolean) => {
    setTimelineOpen(next);
    if (next && !isDesktopWorkspace()) setSettingsOpen(false);
  };
  const openInspectorTool = (tool: StudioTool, sectionId: StudioSettingsSectionId) => {
    setActiveTool(tool);
    setRequestedInspectorSection(sectionId);
    openSettings(true);
  };
  const openEditorTool = (tool: StudioTool, view: "words" | "timeline") => {
    setActiveTool(tool);
    setEditorView(view);
    openTimeline(true);
  };

  const pendingTemplateName = store.pendingTemplateMedia?.templateName;
  useEffect(() => {
    if (!pendingTemplateName) return;
    if (isDesktopWorkspace()) {
      setSettingsOpen(true);
    } else {
      // Template application can finish a beat after navigation. Never let
      // that async completion reopen the inspector over a phone preview.
      setSettingsOpen(false);
    }
  }, [pendingTemplateName]);

  // Whole-editor zoom: a header control plus Cmd/Ctrl + scroll (or trackpad
  // pinch) over the studio. Applied as CSS `zoom` to <main>.
  const [zoom, setZoom] = useState(1);
  const stageRef = useRef<HTMLElement>(null);
  const adjustZoom = (delta: number) => setZoom((z) => clampZoom(z + delta));

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return; // pinch / Cmd+scroll only
      e.preventDefault();
      setZoom((z) => clampZoom(z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Vertical platform frames only make sense for 9:16
  const framesAllowed = store.videoFormat === "9:16";

  const openMp4Preview = useCallback(async () => {
    if (mp4Rendering) return;
    setMp4Rendering(true);
    setMp4Error(null);
    setMp4Progress({ current: 0, total: 0 });
    const source = useAppStore.getState().audioSource;
    const clipSeconds = source.mode === "imported"
      ? source.timings.reduce((total, timing) => total + Math.max(0, timing.end - timing.start), 0)
      : undefined;
    const duration = clipSeconds === undefined ? undefined : durationBucket(clipSeconds);
    trackProductEvent("export_started", { exportAction: "preview", durationBucket: duration });
    try {
      const clip = await renderForPreview((current, total) =>
        setMp4Progress({ current, total })
      );
      if (clip) {
        setMp4Clip(clip);
        trackProductEvent("export_succeeded", {
          exportAction: "preview",
          durationBucket: duration,
          exportPath: clip.fallbackReason ? "realtime" : "webcodecs",
        });
      }
    } catch (err) {
      console.error("MP4 preview render failed:", err);
      setMp4Error(exportFailureMessage(err));
      trackProductEvent("export_failed", {
        exportAction: "preview",
        durationBucket: duration,
        errorCode: telemetryErrorCode(err),
      });
    } finally {
      setMp4Rendering(false);
    }
  }, [mp4Rendering]);

  useEffect(() => {
    if (!framesAllowed && frameMode !== "studio") setFrameMode("studio");
  }, [framesAllowed, frameMode]);

  useEffect(() => {
    if (!surah) return;
    const lang = getTranslationLanguage(store.translationLanguage);
    fetchVerses(surah.id, lang.resourceId).then((newVerses) => {
      useAppStore.getState().setVerses(newVerses);
    });
  }, [store.translationLanguage, surah]);

  // Build + persist the current project (record + uploaded-media blobs). Shared
  // by autosave (debounced) and the manual Save button so they never drift.
  const saveNow = useCallback(async (): Promise<SaveResult> => {
    const state = useAppStore.getState();
    if (!state.surah || state.selectedVerseNumbers.length === 0) {
      return { ok: false, reason: "invalid" };
    }
    let id = state.projectId ?? generateProjectId();
    const src = state.audioSource;
    const sel = state.selectedVerseNumbers;
    // Preserve a user-chosen cover thumbnail across saves; otherwise grab a
    // default cover from the current preview frame (skipping black/mid-fade
    // frames) so the dashboard shows the real clip, not a placeholder.
    let existing = await getProject(id);
    // Identity guard: a stale projectId (opened clip A, then composed a clip
    // for a different surah without passing through beginNewProject) must
    // NEVER overwrite the saved record — that silently corrupts clip A with
    // clip B's audio and captions. Mint a fresh identity instead.
    if (existing && existing.surahId !== state.surah.id) {
      id = generateProjectId();
      existing = undefined;
    }
    // The media-dedup refs are only valid for the project they were saved
    // under; reusing them across identities skips persisting blobs under the
    // new id (the clip then reopens with missing media).
    if (savedMediaProjectIdRef.current !== id) {
      savedMediaProjectIdRef.current = id;
      savedAudioUrlRef.current = null;
      savedVideoUrlRef.current = null;
      savedBackgroundUrlsRef.current.clear();
    }
    const existingThumb = existing?.thumbnail ?? captureSceneThumbnail({ skipIfDark: true });

    // Persist uploaded media so the clip (and its editable verse timeline)
    // can be fully restored later. Blobs are saved once per URL.
    let imported: import("@/types").Project["imported"];
    let mediaSaved = true;
    if (src.mode === "imported") {
      const videoBg = state.background.type === "video";
      imported = { name: src.name, timings: src.timings, videoBg };
      if (!nativeSnapshotRef.current && savedAudioUrlRef.current !== src.url) {
        try {
          const saved = await saveBlob(`audio:${id}`, await (await fetch(src.url)).blob());
          if (saved) savedAudioUrlRef.current = src.url;
          else mediaSaved = false;
        } catch {
          mediaSaved = false;
        }
      }
      if (!nativeSnapshotRef.current
        && videoBg
        && state.background.value.startsWith("blob:")
        && savedVideoUrlRef.current !== state.background.value) {
        try {
          const saved = await saveBlob(`video:${id}`, await (await fetch(state.background.value)).blob());
          if (saved) savedVideoUrlRef.current = state.background.value;
          else mediaSaved = false;
        } catch {
          mediaSaved = false;
        }
      }
    }

    const backgroundMedia: NonNullable<import("@/types").Project["backgroundMedia"]> = [];
    const mediaEntries = state.backgroundSequenceEnabled
      ? state.backgroundScenes.map((scene) => ({ sceneId: scene.id, background: scene.background }))
      : [{ sceneId: "single", background: state.background }];
    for (const entry of mediaEntries) {
      const media = entry.background;
      if ((media.type !== "image" && media.type !== "video") || !media.value.startsWith("blob:")) continue;
      backgroundMedia.push({ sceneId: entry.sceneId, type: media.type });
      if (savedBackgroundUrlsRef.current.has(media.value)) continue;
      try {
        const saved = await saveBlob(`background:${id}:${entry.sceneId}`, await (await fetch(media.value)).blob());
        if (saved) savedBackgroundUrlsRef.current.add(media.value);
        else mediaSaved = false;
      } catch {
        mediaSaved = false;
      }
    }

    // Do not publish metadata that points at media which failed to persist.
    // Existing projects retain their last complete version; new drafts remain
    // drafts instead of appearing on the dashboard as broken saved clips.
    if (!mediaSaved) return { ok: false, reason: "media" };

    const projectRecord: import("@/types").Project = {
      id,
      name: `${state.surah.name_simple} ${sel[0]}-${sel[sel.length - 1]}`,
      surahId: state.surah.id,
      surahName: state.surah.name_simple,
      selectedVerseNumbers: sel,
      imported,
      backgroundMedia: backgroundMedia.length ? backgroundMedia : undefined,
      verseParts: Object.keys(state.verseParts).length ? state.verseParts : undefined,
      settings: {
        reciterId: state.reciterId,
        videoFormat: state.videoFormat,
        arabicFontSize: state.arabicFontSize,
        arabicFont: state.arabicFont,
        arabicFontWeight: state.arabicFontWeight,
        arabicInkThickness: state.arabicInkThickness,
        arabicVerseNumber: state.arabicVerseNumber,
        translationVerseNumber: state.translationVerseNumber,
        translationEnabled: state.translationEnabled,
        arabicEnabled: state.arabicEnabled,
        wordHighlight: state.wordHighlight,
        backgroundVideoSync: state.backgroundVideoSync,
        translationFontSize: state.translationFontSize,
        translationFont: state.translationFont,
        translationFontWeight: state.translationFontWeight,
        translationLanguage: state.translationLanguage,
        textColor: state.textColor,
        translationColor: state.translationColor,
        lineHeight: state.lineHeight,
        translationLineHeight: state.translationLineHeight,
        arabicTranslationGap: state.arabicTranslationGap,
        textPosition: state.textPosition,
        textLayout: state.textLayout,
        splitMask: state.splitMask,
        overlayOpacity: state.overlayOpacity,
        overlayColor: state.overlayColor,
        safeAreaTarget: state.safeAreaTarget,
        safePadding: state.safePadding,
        background: state.background,
        backgroundFit: state.backgroundFit,
        mediaTransform: state.mediaTransform,
        mediaFrame: state.mediaFrame,
        backgroundSequenceEnabled: state.backgroundSequenceEnabled,
        backgroundScenes: state.backgroundScenes,
        activeBackgroundSceneId: state.activeBackgroundSceneId,
        fitBackdrop: state.fitBackdrop,
        videoLoopMode: state.videoLoopMode,
        verseIntro: state.verseIntro,
        verseIntroMs: state.verseIntroMs,
        clipFadeMs: state.clipFadeMs,
        audioFadeIn: state.audioFadeIn,
        textShadow: state.textShadow,
        textOutline: state.textOutline,
        letterbox: state.letterbox,
        emphasis: state.emphasis,
        emphasisStyle: state.emphasisStyle,
        emphasisColor: state.emphasisColor,
        highlightEnabled: state.highlightEnabled,
        highlightColor: state.highlightColor,
        highlightOpacity: state.highlightOpacity,
        highlightRadius: state.highlightRadius,
        highlightPadding: state.highlightPadding,
        highlightHeight: state.highlightHeight,
      },
      thumbnail: existingThumb,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    const projectSaved = await saveProject(projectRecord);
    if (!projectSaved) return { ok: false, reason: "project" };
    if (nativeSnapshotRef.current) {
      const updatedSnapshot = snapshotFromWebProject(
        nativeSnapshotRef.current,
        projectRecord,
        state,
      );
      if (!await sendNativeProjectChange(updatedSnapshot)) {
        return { ok: false, reason: "project" };
      }
      nativeSnapshotRef.current = updatedSnapshot;
    }
    // Also adopts the freshly minted id when the identity guard above refused
    // to overwrite a different clip's record.
    if (state.projectId !== id) state.setProjectId(id);
    return { ok: true };
  }, []);

  // Manual save — gives an explicit "Saved ✓" so the clip is clearly stored on
  // the dashboard and retrievable later (autosave still runs in the background).
  const handleSaveClick = useCallback(async () => {
    setSaveState("saving");
    setSaveError(null);
    try {
      const result = await saveNow();
      if (result.ok) {
        setSaveState("saved");
        if (savedResetRef.current) clearTimeout(savedResetRef.current);
        savedResetRef.current = setTimeout(() => setSaveState("idle"), 2000);
      } else {
        setSaveState("error");
        setSaveError(saveFailureMessage(result.reason));
      }
    } catch {
      setSaveState("error");
      setSaveError(saveFailureMessage("project"));
    }
  }, [saveNow]);

  useEffect(() => {
    if (!surah || selectedVerseNumbers.length === 0 || !store.projectId) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void saveNow().then((result) => {
        if (result.ok) {
          setSaveError(null);
          setSaveState((current) => current === "error" ? "idle" : current);
          return;
        }
        setSaveState("error");
        setSaveError(saveFailureMessage(result.reason));
      });
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    saveNow,
    store.projectId, store.reciterId, store.videoFormat, store.arabicFontSize, store.arabicInkThickness,
    store.arabicFont, store.arabicVerseNumber, store.arabicEnabled, store.translationEnabled, store.translationFontSize,
    store.translationFont, store.translationLanguage, store.textColor, store.translationColor,
    store.lineHeight, store.translationLineHeight, store.arabicTranslationGap, store.textPosition, store.textLayout, store.splitMask, store.overlayOpacity, store.overlayColor,
    store.safeAreaTarget, store.safePadding, store.background, store.backgroundFit, store.mediaTransform, store.mediaFrame, store.backgroundSequenceEnabled, store.backgroundScenes, store.activeBackgroundSceneId, store.fitBackdrop, store.videoLoopMode, store.textShadow, store.textOutline, store.letterbox,
    store.emphasis, store.emphasisStyle, store.emphasisColor,
    store.clipFadeMs, store.audioFadeIn,
    store.translationVerseNumber, store.wordHighlight, store.backgroundVideoSync,
    store.audioSource,
    surah, selectedVerseNumbers,
  ]);

  // Flush pending edits when leaving an already-saved project. Fresh drafts
  // still have no projectId, so navigating away never creates an unwanted card.
  useEffect(() => () => {
    if (useAppStore.getState().projectId) void saveNow();
  }, [saveNow]);

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
    <>
    <main data-testid="studio-shell" ref={stageRef} style={{ zoom }} className="studio-shell-layout flex h-dvh flex-col overflow-hidden bg-[var(--ink)] lg:grid lg:grid-cols-[56px_minmax(0,1fr)_304px] lg:grid-rows-[52px_minmax(0,1fr)_188px]">
      {/* Studio top bar — pad for the notch / status bar on mobile */}
      <header className="relative z-40 flex min-h-[calc(48px+env(safe-area-inset-top))] min-w-0 shrink-0 items-end justify-between gap-2 border-b border-[var(--hairline-soft)] bg-[var(--ink)] px-2 pb-1 pt-[env(safe-area-inset-top)] sm:px-3 lg:col-span-3 lg:h-[52px] lg:min-h-0 lg:items-center lg:px-4 lg:pb-0 lg:pt-0">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          <button
            onClick={async () => {
              // Leaving a bulk clip: persist its edited look onto the
              // candidate first, or the edits revert when the clip reopens.
              if (bulkNavigation) {
                await persistBulkCandidateLook(bulkNavigation.jobId, bulkNavigation.candidateId).catch(() => {});
              }
              router.push(bulkNavigation ? "/bulk" : `/surah/${surah.id}`);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-white/[0.03] hover:text-parchment sm:w-auto sm:px-2 lg:h-8"
            aria-label={bulkNavigation ? "Back to bulk collection" : "Back to verses"}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m6 6-6-6 6-6" />
            </svg>
            <span className="hidden sm:inline">{bulkNavigation ? "Batch" : "Verses"}</span>
          </button>
          <button
            onClick={() => router.push("/")}
            className="hidden h-8 w-8 items-center justify-center rounded-md border border-[var(--hairline-soft)] text-[var(--muted)] transition-colors hover:border-[var(--hairline)] hover:text-parchment sm:flex"
            aria-label="Exit editor"
            title={store.projectId ? "Exit; saved-project edits are kept" : "Exit without saving this draft"}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div className="flex min-w-0 flex-col leading-tight sm:flex-row sm:items-baseline sm:gap-2">
            <span className="truncate text-sm font-semibold text-parchment">{surah.name_simple}</span>
            <span className="truncate text-[10px] uppercase tracking-[0.12em] text-[var(--muted-deep)] sm:text-[11px] sm:normal-case sm:tracking-normal">{verseRange}</span>
          </div>
          {bulkNavigation && (
            <div className="flex shrink-0 items-center rounded-md border border-[var(--hairline-soft)]" aria-label="Bulk clip navigation">
              <button type="button" onClick={() => void openBulkSibling(bulkNavigation.previousId)} disabled={!bulkNavigation.previousId || bulkNavigationBusy} className="flex h-11 w-11 items-center justify-center text-parchment disabled:opacity-25 lg:h-8 lg:w-8" aria-label="Previous bulk clip">←</button>
              <span className="px-1 text-[10px] tabular-nums text-[var(--muted)] sm:px-2">{bulkNavigation.index + 1}/{bulkNavigation.total}</span>
              <button type="button" onClick={() => void openBulkSibling(bulkNavigation.nextId)} disabled={!bulkNavigation.nextId || bulkNavigationBusy} className="flex h-11 w-11 items-center justify-center text-parchment disabled:opacity-25 lg:h-8 lg:w-8" aria-label="Next bulk clip">→</button>
            </div>
          )}
          {bulkNavigation && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setApplyLookOpen((open) => !open)}
                aria-expanded={applyLookOpen}
                className="btn-ghost flex h-11 items-center rounded-md px-3 text-xs lg:h-8"
              >
                Apply to all
              </button>
              {applyLookOpen && (
                <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-4 shadow-xl">
                  <p className="text-xs font-medium text-parchment">Apply this clip’s look to all {bulkNavigation.total} clips</p>
                  <p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">Copies text position, typography, colours, and effects. Each clip keeps its own media.</p>
                  <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] leading-4 text-[var(--muted)]">
                    <input type="checkbox" checked={applyLookMedia} onChange={(event) => setApplyLookMedia(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--gold)]" />
                    <span>Also replace each clip’s media with this clip’s media</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => void applyLookToAllClips()}
                    disabled={applyLookState === "busy"}
                    className="btn-gold mt-3 min-h-10 w-full rounded-lg px-3 text-xs disabled:opacity-50"
                  >
                    {applyLookState === "busy" ? "Applying…" : applyLookState === "done" ? "Applied ✓" : "Apply to all clips"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Preview-as frame selector */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-0.5 rounded-md border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-0.5 md:flex">
            {FRAME_MODES.map((m) => {
              const disabled = m.id !== "studio" && !framesAllowed;
              return (
                <button
                  key={m.id}
                  onClick={() => setFrameMode(m.id)}
                  disabled={disabled}
                  title={disabled ? "Switch to 9:16 to preview device frames" : undefined}
                  className={`rounded px-3 py-1.5 text-[11px] transition-colors ${
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

          {/* Whole-editor zoom (also Cmd/Ctrl + scroll over the studio) */}
          <div className="hidden items-center gap-0.5 rounded-md border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-0.5 md:flex">
            <button
              onClick={() => adjustZoom(-ZOOM_STEP)}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Zoom out"
              className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] transition-colors hover:text-parchment disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M5 12h14" />
              </svg>
            </button>
            <button
              onClick={() => setZoom(1)}
              title="Reset zoom"
              className="w-11 text-center text-xs tabular-nums text-[var(--muted)] transition-colors hover:text-parchment"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => adjustZoom(ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Zoom in"
              className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] transition-colors hover:text-parchment disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          {(frameMode === "tiktok" || frameMode === "reels") && (
            <>
              <button
                onClick={() => setShowSafeZones((v) => !v)}
                className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs transition-colors sm:min-h-9 ${
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
                className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs transition-colors sm:min-h-9 ${
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
            className={`hidden h-8 items-center gap-1.5 rounded-md px-3 text-xs transition-colors disabled:opacity-60 sm:flex ${
              saveState === "saved"
                ? "bg-emerald-accent/20 text-emerald-soft ring-1 ring-emerald-soft/40"
                : saveState === "error"
                  ? "bg-red-500/10 text-red-100 ring-1 ring-red-500/30"
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
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "Save"}
            </span>
          </button>

          <button
            onClick={openMp4Preview}
            disabled={mp4Rendering}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--gold)] px-3 text-xs font-semibold text-[var(--ink-deep)] disabled:opacity-70 sm:h-8"
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
                <span>{mp4Rendering ? "" : "Export"}</span>
              </>
            )}
          </button>

          <button
            onClick={() => openSettings(!settingsOpen)}
            className={`hidden h-8 items-center gap-2 rounded-md px-3 text-xs transition-colors sm:flex ${
              settingsOpen
                ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                : "btn-ghost"
            }`}
            aria-label="Toggle settings"
            aria-expanded={settingsOpen}
            aria-controls="studio-settings"
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

      <aside aria-label="Studio tools" className="hidden border-r border-[var(--hairline-soft)] bg-[var(--ink)] lg:row-span-2 lg:row-start-2 lg:flex lg:flex-col">
        {([
          ["layouts", "Layouts", "layout", () => openInspectorTool("layouts", "studio-presets-section")],
          ["media", "Media", "image", () => openInspectorTool("media", "studio-background-section")],
          ["audio", "Audio", "music", () => openInspectorTool("audio", "studio-audio-section")],
          ["text", "Text", "type", () => openInspectorTool("text", "studio-typography-section")],
          ["captions", "Captions", "captions", () => openEditorTool("captions", "words")],
        ] as const).map(([tool, label, icon, action]) => (
          <button key={label} type="button" onClick={action} aria-label={`Open ${label.toLowerCase()} tool`} aria-current={activeTool === tool ? "page" : undefined} className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors hover:bg-white/[0.03] hover:text-parchment ${activeTool === tool ? "bg-gold/[0.06] text-gold" : "text-[var(--muted)]"}`}>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              {icon === "layout" && <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 4v16M8 10h13" /></>}
              {icon === "image" && <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m3 17 5-4 4 3 3-2 6 5" /></>}
              {icon === "music" && <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>}
              {icon === "type" && <><path d="M4 6V4h16v2M12 4v16M8 20h8" /></>}
              {icon === "captions" && <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10h4M13 10h4M7 14h3M12 14h5" /></>}
            </svg>
            {label as string}
          </button>
        ))}
        <button type="button" onClick={() => openInspectorTool("config", "studio-format-section")} aria-label="Open configuration tool" aria-current={activeTool === "config" ? "page" : undefined} className={`mt-auto flex h-16 w-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors hover:bg-white/[0.03] hover:text-parchment ${activeTool === "config" ? "bg-gold/[0.06] text-gold" : "text-[var(--muted)]"}`}>
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h8M16 17h4" /><circle cx="16" cy="7" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="14" cy="17" r="2" /></svg>
          Config
        </button>
      </aside>

      {mp4Error && (
        <div role="alert" className="flex items-start gap-3 border-b border-red-500/25 bg-red-500/[0.08] px-4 py-2.5 text-[11px] leading-relaxed text-red-100/90">
          <span className="min-w-0 flex-1">{mp4Error}</span>
          <button type="button" onClick={() => setMp4Error(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-red-100/60 hover:bg-white/[0.05] hover:text-red-100" aria-label="Dismiss preview error">×</button>
        </div>
      )}

      {saveError && (
        <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-red-500/25 bg-red-500/[0.08] px-4 py-2.5 text-xs leading-relaxed text-red-100/90">
          <p className="min-w-0 flex-1"><strong className="font-semibold text-red-100">Not saved.</strong> {saveError}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={handleSaveClick} disabled={saveState === "saving"} className="min-h-10 rounded-full border border-red-300/30 px-3 font-medium text-red-50 transition-colors hover:bg-red-100/10 disabled:opacity-50">Retry</button>
            <button type="button" onClick={() => { setSaveError(null); setSaveState("idle"); }} className="flex h-10 w-10 items-center justify-center rounded-full text-red-100/60 hover:bg-white/[0.05] hover:text-red-100" aria-label="Dismiss save error">×</button>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 lg:contents">
        {/* Preview stage */}
        <section data-testid="studio-stage" className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-[#060608] p-3 lg:col-start-2 lg:row-start-2 lg:p-3">
          <StudioPreview frameMode={frameMode} showSafeZones={showSafeZones} />

        </section>

        {/* Dim the preview behind the settings drawer on small screens */}
        {settingsOpen && (
          <button
            aria-label="Dismiss settings drawer"
            onClick={() => openSettings(false)}
            className="absolute inset-0 z-20 bg-black/50 lg:hidden"
          />
        )}

        {/* Settings — overlay drawer below lg, inline column at lg+ so it never
            squeezes the preview on phones. */}
        <aside
          id="studio-settings"
          data-testid="studio-inspector"
          className={`z-30 min-h-0 overflow-y-auto bg-[var(--ink)] transition-[width,transform] duration-200 lg:static lg:col-start-3 lg:row-span-2 lg:row-start-2 lg:z-auto lg:w-[304px] lg:border-l lg:border-[var(--hairline-soft)] lg:shadow-none ${
            settingsOpen
              ? "absolute inset-y-0 right-0 w-[88%] max-w-[360px] border-l border-[var(--hairline-soft)] lg:w-[304px] lg:max-w-none"
              : "w-0 overflow-hidden border-l-0 lg:w-[304px] lg:border-l"
          }`}
        >
          {settingsOpen && (
            <div className="sticky top-0 z-10 flex justify-end border-b border-[var(--hairline-soft)] bg-[var(--ink)] px-3 py-2 lg:hidden">
              <button
                type="button"
                onClick={() => openSettings(false)}
                className="flex h-11 min-w-11 items-center justify-center rounded-full border border-[var(--hairline-soft)] text-[var(--muted)] transition-colors hover:bg-white/[0.04] hover:text-parchment"
                aria-label="Close settings"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}
          <StudioSettings requestedSectionId={requestedInspectorSection} />
        </aside>
      </div>

      {/* Verse editor dock. Uploaded clips get the Word-split / Timeline editor;
          library (reciter) clips get the word-part editor timed to the reciter.
          Height is bounded so the preview above is always visible; collapse
          shrinks it to just this bar. */}
      {(store.audioSource.mode === "imported" || selectedVerseNumbers.length > 0) && (
        <div data-testid="studio-timeline" className={`studio-timeline-dock relative z-20 flex shrink-0 flex-col overflow-hidden border-t border-[var(--hairline-soft)] bg-[var(--ink)] px-2 py-1 sm:px-3 lg:col-start-2 lg:row-start-3 lg:h-[188px] lg:py-0 ${timelineOpen ? "h-[min(232px,36dvh)]" : "h-12"}`}>
          <div className="flex shrink-0 items-center gap-1.5 lg:h-7">
            {/* Collapse / expand the dock */}
            <button
              onClick={() => openTimeline(!timelineOpen)}
              className="flex min-h-10 items-center gap-2 rounded pr-2 text-left lg:min-h-7"
              aria-expanded={timelineOpen}
              aria-label="Verse Editor"
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
              <span className="text-[11px] font-semibold text-gold-soft/90">
                Verse Editor
              </span>
            </button>

            {/* The Word-split / Timeline toggle is only for uploaded clips. */}
            {timelineOpen && store.audioSource.mode === "imported" && (
              <div className="ml-1 flex items-center gap-0.5 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-0.5">
                <button
                  onClick={() => setEditorView("words")}
                  className={`min-h-11 rounded-full px-2.5 text-[11px] transition-colors sm:min-h-8 ${
                    editorView === "words"
                      ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                      : "text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  Captions
                </button>
                <button
                  onClick={() => setEditorView("timeline")}
                  className={`min-h-11 rounded-full px-2.5 text-[11px] transition-colors sm:min-h-8 ${
                    editorView === "timeline"
                      ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                      : "text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  Timeline
                </button>
              </div>
            )}

            <div className="ml-auto flex items-center gap-1">
              {timelineOpen && (
                <button
                  onClick={() => setTimelineFullscreen(true)}
                  className="flex min-h-10 min-w-10 items-center justify-center rounded border border-[var(--hairline)] px-2 text-[11px] text-parchment transition-colors hover:border-gold lg:min-h-7"
                  aria-label="Expand editor"
                  title="Edit in a full-screen editor with more room"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V5a1 1 0 011-1h4M4 15v4a1 1 0 001 1h4m6-16h4a1 1 0 011 1v4m0 6v4a1 1 0 01-1 1h-4" />
                  </svg>
                  <span className="hidden sm:inline">Expand</span>
                </button>
              )}
            </div>
          </div>

          {/* Unmount the dock editor while the fullscreen editor is open: two
              live TimelineEditors would keep divergent undo histories and decode
              the audio buffer two extra times. The dock is behind the overlay
              anyway; it remounts (fresh from the store) on close. */}
          {timelineOpen && !timelineFullscreen && (
            <div className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {store.audioSource.mode === "imported" ? (
                editorView === "words" ? <VerseCardEditor /> : <TimelineEditor compact />
              ) : (
                <ReciterVerseEditor />
              )}
            </div>
          )}
        </div>
      )}

      <nav data-testid="studio-mobile-tools" aria-label="Studio tools" className="relative z-20 grid h-[calc(58px+env(safe-area-inset-bottom))] shrink-0 grid-cols-5 items-start border-t border-[var(--hairline-soft)] bg-[var(--ink)] px-1 pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden">
        {([
          ["Media", () => openInspectorTool("media", "studio-background-section"), activeTool === "media", <path key="media" strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4zM4 15l4-4 4 4 2-2 6 6M15.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />],
          ["Audio", () => openInspectorTool("audio", "studio-audio-section"), activeTool === "audio", <path key="audio" strokeLinecap="round" strokeLinejoin="round" d="M9 18V6l10-2v12M9 10l10-2M6.5 20A2.5 2.5 0 106.5 15a2.5 2.5 0 000 5zm10-2a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />],
          ["Text", () => openInspectorTool("text", "studio-typography-section"), activeTool === "text", <path key="text" strokeLinecap="round" d="M5 5h14M12 5v14M8 19h8" />],
          ["Captions", () => openEditorTool("captions", "words"), activeTool === "captions", <path key="captions" strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H4zM7 11h4m2 0h4M7 14h3m2 0h5" />],
          ["Format", () => openInspectorTool("config", "studio-format-section"), activeTool === "config", <path key="format" strokeLinecap="round" strokeLinejoin="round" d="M7 3H3v4m14-4h4v4M7 21H3v-4m14 4h4v-4" />],
        ] as const).map(([label, action, active, icon]) => (
          <button key={label as string} type="button" onClick={action as () => void} aria-label={label === "Format" ? "Toggle settings" : undefined} aria-expanded={label === "Format" ? settingsOpen : undefined} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[10px] font-medium uppercase tracking-tight ${active ? "bg-gold/[0.06] text-gold-soft" : "text-[var(--muted)]"}`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>{icon}</svg>
            {label as string}
          </button>
        ))}
      </nav>

    </main>

    {/* Full-screen overlays live OUTSIDE the zoomed <main> so they always cover
        the real viewport regardless of the editor zoom level. */}
    {timelineFullscreen && (
      <FullscreenTimeline
        editorView={editorView}
        onClose={() => setTimelineFullscreen(false)}
      />
    )}
    {mp4Clip && <Mp4PreviewOverlay clip={mp4Clip} onClose={() => setMp4Clip(null)} />}
    </>
  );
}
