import { create } from "zustand";
import { Surah, Verse, VideoFormat, Background, TextShadow, TextOutline, LetterboxConfig, Project, SplitMaskConfig } from "@/types";
import { SafeAreaTarget, EmphasisStyle, MediaFit, FitBackdrop, VerseIntro, MediaTransform, MediaFrame, DEFAULT_MEDIA_FRAME, DEFAULT_SPLIT_MASK } from "./canvas-utils";
import { StyleSettings } from "./style";
import { VerseTiming } from "./audio-import";
import { normalizeTimings } from "./timing-ops";
import { backgroundPresets } from "./backgrounds";
import {
  createBackgroundScene,
  moveBackgroundScene,
  type BackgroundScene,
} from "./background-sequence";
import type { TemplateMediaSlot } from "./template-model";

export interface VerseEmphasis {
  arabic: number[];
  translation: number[];
}

export type AudioSource =
  | { mode: "reciter" }
  | { mode: "imported"; url: string; name: string; timings: VerseTiming[] };

export interface PendingTemplateMedia {
  templateName: string;
  slots: TemplateMediaSlot[];
}

interface AppState {
  surah: Surah | null;
  verses: Verse[];
  selectedVerseNumbers: number[];
  reciterId: string;
  videoFormat: VideoFormat;
  arabicFontSize: number;
  arabicFont: string;
  arabicFontWeight: number;
  arabicInkThickness: number;
  arabicVerseNumber: boolean;
  translationVerseNumber: boolean;
  translationEnabled: boolean;
  arabicEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  translationFontWeight: number;
  translationLanguage: string;
  textColor: string;
  translationColor: string;
  lineHeight: number;
  translationLineHeight: number;
  arabicTranslationGap: number;
  textPosition: number;
  textLayout: "center" | "left-panel";
  splitMask: SplitMaskConfig;
  overlayOpacity: number;
  overlayColor: string;
  safeAreaTarget: SafeAreaTarget;
  safePadding: number;
  background: Background;
  backgroundFit: MediaFit;
  mediaTransform: MediaTransform;
  mediaFrame: MediaFrame;
  backgroundSequenceEnabled: boolean;
  backgroundScenes: BackgroundScene[];
  activeBackgroundSceneId: string | null;
  pendingTemplateMedia: PendingTemplateMedia | null;
  fitBackdrop: FitBackdrop;
  backgroundVideoSync: boolean; // sync the bg video's frames to the recitation (lip-sync)
  videoLoopMode: "loop" | "freeze"; // when the bg video ends: loop it, or hold the last frame
  textShadow: TextShadow;
  textOutline: TextOutline;
  letterbox: LetterboxConfig;
  currentVerseIndex: number;
  projectId: string | null;
  playbackSegmentArabic: string | null;
  playbackSegmentTranslation: string | null;
  playbackSegmentIsLast: boolean;
  emphasis: Record<string, VerseEmphasis>;
  emphasisStyle: EmphasisStyle;
  emphasisColor: string;
  wordHighlight: boolean;
  activeWordIndex: number | null; // current word during imported playback (transient)
  // Continuous rounded bar behind each Arabic line.
  highlightEnabled: boolean;
  highlightColor: string;
  highlightOpacity: number;
  highlightRadius: number;
  highlightPadding: number;
  highlightHeight: number;
  verseIntro: VerseIntro;
  verseIntroMs: number;
  // Clip-start fade: the whole frame (and optionally audio) eases in from black
  // over the first clipFadeMs of the clip. 0 = off. Distinct from verseIntro,
  // which animates every verse; this fires once, at the very start.
  clipFadeMs: number;
  audioFadeIn: boolean;
  audioSource: AudioSource;
  // Manual word-part boundaries for reciter (library) clips, keyed by verse
  // number. Each entry is a sorted list of word indices AFTER which a new part
  // begins (e.g. [9] splits a verse into words 1–9 and the rest). Imported clips
  // use VerseTiming.splits instead; this is the reciter-mode equivalent.
  verseParts: Record<number, number[]>;
  activePartIndex: number;

  setSurah: (surah: Surah) => void;
  setVerses: (verses: Verse[]) => void;
  toggleVerse: (verseNumber: number) => void;
  selectAllVerses: () => void;
  selectVerseRange: (from: number, to: number) => void;
  setSelectedVerseNumbers: (numbers: number[]) => void;
  clearSelection: () => void;
  setReciterId: (id: string) => void;
  setVideoFormat: (format: VideoFormat) => void;
  setArabicFontSize: (size: number) => void;
  setArabicFont: (font: string) => void;
  setArabicFontWeight: (weight: number) => void;
  setArabicInkThickness: (thickness: number) => void;
  setArabicVerseNumber: (on: boolean) => void;
  setTranslationVerseNumber: (on: boolean) => void;
  setTranslationEnabled: (enabled: boolean) => void;
  setArabicEnabled: (enabled: boolean) => void;
  setTranslationFontSize: (size: number) => void;
  setTranslationFont: (font: string) => void;
  setTranslationFontWeight: (weight: number) => void;
  setTranslationLanguage: (lang: string) => void;
  setTextColor: (color: string) => void;
  setTranslationColor: (color: string) => void;
  setLineHeight: (lh: number) => void;
  setTranslationLineHeight: (lh: number) => void;
  setArabicTranslationGap: (gap: number) => void;
  setTextPosition: (pos: number) => void;
  setTextLayout: (layout: "center" | "left-panel") => void;
  setSplitMask: (config: SplitMaskConfig) => void;
  setOverlayOpacity: (opacity: number) => void;
  setOverlayColor: (color: string) => void;
  setSafeAreaTarget: (target: SafeAreaTarget) => void;
  setSafePadding: (padding: number) => void;
  setBackground: (bg: Background) => void;
  setBackgroundFit: (fit: MediaFit) => void;
  setMediaTransform: (transform: MediaTransform) => void;
  setMediaFrame: (frame: MediaFrame) => void;
  setBackgroundSequenceEnabled: (enabled: boolean) => void;
  addBackgroundScene: (background: Background) => void;
  selectBackgroundScene: (id: string) => void;
  updateBackgroundScene: (id: string, patch: Partial<BackgroundScene>) => void;
  removeBackgroundScene: (id: string) => void;
  moveBackgroundScene: (id: string, direction: -1 | 1) => void;
  setPendingTemplateMedia: (request: PendingTemplateMedia | null) => void;
  fulfillTemplateMediaSlot: (id: TemplateMediaSlot["id"]) => void;
  setFitBackdrop: (b: FitBackdrop) => void;
  setBackgroundVideoSync: (on: boolean) => void;
  setVideoLoopMode: (m: "loop" | "freeze") => void;
  setTextShadow: (shadow: TextShadow) => void;
  setTextOutline: (outline: TextOutline) => void;
  setLetterbox: (config: LetterboxConfig) => void;
  setCurrentVerseIndex: (index: number) => void;
  setProjectId: (id: string | null) => void;
  setPlaybackSegment: (arabic: string | null, translation: string | null, isLast?: boolean) => void;
  applyStyle: (style: Partial<StyleSettings>) => void;
  restoreProject: (
    surah: Surah,
    verses: Verse[],
    selectedVerseNumbers: number[],
    settings: Project["settings"],
    projectId: string,
    importedAudio?: { url: string; name: string; timings: VerseTiming[] },
    verseParts?: Record<number, number[]>
  ) => void;
  toggleEmphasisWord: (verseKey: string, which: "arabic" | "translation", index: number) => void;
  clearVerseEmphasis: (verseKey: string) => void;
  setEmphasisStyle: (style: EmphasisStyle) => void;
  setEmphasisColor: (color: string) => void;
  setWordHighlight: (on: boolean) => void;
  setHighlightEnabled: (v: boolean) => void;
  setHighlightColor: (v: string) => void;
  setHighlightOpacity: (v: number) => void;
  setHighlightRadius: (v: number) => void;
  setHighlightPadding: (v: number) => void;
  setHighlightHeight: (v: number) => void;
  setActiveWordIndex: (index: number | null) => void;
  setVerseParts: (verseNumber: number, boundaries: number[]) => void;
  setActivePartIndex: (index: number) => void;
  setVerseIntro: (v: VerseIntro) => void;
  setVerseIntroMs: (ms: number) => void;
  setClipFadeMs: (ms: number) => void;
  setAudioFadeIn: (on: boolean) => void;
  setImportedAudio: (url: string, name: string, timings: VerseTiming[]) => void;
  setVerseTimings: (timings: VerseTiming[]) => void;
  deleteImportedVerse: (verseIdx: number) => void;
  clearImportedAudio: () => void;
  beginNewProject: () => void;
}

/**
 * Per-clip settings a saved project may carry, at their FEATURE-OFF values.
 * This is the single fallback source for `restoreProject`: any key a saved
 * record does not carry (clips saved before the feature existed) restores to
 * the value here, never to whatever the previously open clip left in the
 * store. When adding a per-clip setting, add it here — the initial state
 * spreads this object, so forgetting a key is a visible type/behavior gap
 * rather than a silent cross-clip bleed.
 *
 * Returns fresh object instances each call so restored state never shares
 * mutable references with the new-clip defaults.
 */
export function restoreSettingsDefaults() {
  return {
    reciterId: "alafasy",
    videoFormat: "9:16" as VideoFormat,
    arabicFontSize: 24,
    arabicFont: "qcf",
    arabicFontWeight: 400,
    // Restore default 0: clips saved before ink thickness existed must not
    // gain ink. New clips start at 0.75 (overridden in the initial state).
    arabicInkThickness: 0,
    arabicVerseNumber: false,
    translationVerseNumber: true,
    translationEnabled: true,
    arabicEnabled: true,
    translationFontSize: 12,
    translationFont: "sans-serif",
    translationFontWeight: 400,
    translationLanguage: "en",
    textColor: "#ffffff",
    translationColor: "#d8d3c7",
    lineHeight: 1,
    translationLineHeight: 1,
    arabicTranslationGap: 0.6,
    textPosition: 50,
    textLayout: "center" as const,
    splitMask: { ...DEFAULT_SPLIT_MASK },
    overlayOpacity: 50,
    overlayColor: "#000000",
    safeAreaTarget: "none" as SafeAreaTarget,
    safePadding: 0,
    background: backgroundPresets[0],
    backgroundFit: "cover" as MediaFit,
    mediaTransform: { scale: 1, x: 0, y: 0 } as MediaTransform,
    mediaFrame: { ...DEFAULT_MEDIA_FRAME },
    backgroundSequenceEnabled: false,
    backgroundScenes: [] as BackgroundScene[],
    activeBackgroundSceneId: null as string | null,
    fitBackdrop: "blur" as FitBackdrop,
    backgroundVideoSync: false,
    videoLoopMode: "loop" as const,
    textShadow: { enabled: true, color: "#000000", blur: 4, offsetX: 0, offsetY: 2 } as TextShadow,
    // Restore default OFF: pre-outline clips must not gain an outline. New
    // clips start with it on (overridden in the initial state).
    textOutline: { enabled: false, color: "#050507", width: 1.25 } as TextOutline,
    letterbox: { enabled: false, barColor: "#000000", barStyle: "solid" } as LetterboxConfig,
    emphasis: {} as Record<string, VerseEmphasis>,
    emphasisStyle: "color" as EmphasisStyle,
    emphasisColor: "#c9a24b",
    wordHighlight: false,
    highlightEnabled: false,
    highlightColor: "#1f2a44",
    highlightOpacity: 1,
    highlightRadius: 1,
    highlightPadding: 0.25,
    highlightHeight: 1,
    verseIntro: "none" as VerseIntro,
    verseIntroMs: 450,
    // Restore default 0: clips saved before the clip-start fade existed must
    // not gain one. New clips start at 400ms (overridden in the initial state).
    clipFadeMs: 0,
    audioFadeIn: false,
  };
}

export const useAppStore = create<AppState>((set) => ({
  surah: null,
  verses: [],
  selectedVerseNumbers: [],
  ...restoreSettingsDefaults(),
  // New-clip defaults that intentionally differ from the legacy-restore values
  // (clipFadeMs's new-clip 400ms is set with its comment further below).
  arabicInkThickness: 0.75,
  textOutline: { enabled: true, color: "#050507", width: 1.25 },
  pendingTemplateMedia: null,
  currentVerseIndex: 0,
  projectId: null,
  playbackSegmentArabic: null,
  playbackSegmentTranslation: null,
  playbackSegmentIsLast: true,
  emphasis: {},
  emphasisStyle: "color",
  emphasisColor: "#c9a24b",
  wordHighlight: false,
  activeWordIndex: null,
  highlightEnabled: false,
  highlightColor: "#1f2a44",
  highlightOpacity: 1,
  highlightRadius: 1,
  highlightPadding: 0.25,
  highlightHeight: 1,
  verseIntro: "none",
  verseIntroMs: 450,
  // On for new clips; restoreProject resets it to the saved value (or 0 for
  // clips saved before this feature) so reopened clips keep their look.
  clipFadeMs: 400,
  audioFadeIn: false,
  audioSource: { mode: "reciter" },
  verseParts: {},
  activePartIndex: 0,

  setSurah: (surah) => set({ surah }),
  setVerses: (verses) => set({ verses }),
  toggleVerse: (verseNumber) =>
    set((state) => ({
      selectedVerseNumbers: state.selectedVerseNumbers.includes(verseNumber)
        ? state.selectedVerseNumbers.filter((n) => n !== verseNumber)
        : [...state.selectedVerseNumbers, verseNumber].sort((a, b) => a - b),
    })),
  selectAllVerses: () =>
    set((state) => ({
      selectedVerseNumbers: state.verses.map((v) => v.verse_number),
    })),
  selectVerseRange: (from, to) =>
    set((state) => {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      const inRange = state.verses
        .map((v) => v.verse_number)
        .filter((n) => n >= lo && n <= hi);
      const merged = Array.from(
        new Set([...state.selectedVerseNumbers, ...inRange])
      ).sort((a, b) => a - b);
      return { selectedVerseNumbers: merged };
    }),
  setSelectedVerseNumbers: (numbers) =>
    set({ selectedVerseNumbers: [...numbers].sort((a, b) => a - b) }),
  clearSelection: () => set({ selectedVerseNumbers: [] }),
  setReciterId: (id) => set({ reciterId: id }),
  setVideoFormat: (format) => set({ videoFormat: format }),
  setArabicFontSize: (size) => set({ arabicFontSize: size }),
  setArabicFont: (font) => set({ arabicFont: font }),
  setArabicFontWeight: (weight) => set({ arabicFontWeight: weight }),
  setArabicInkThickness: (arabicInkThickness) => set({ arabicInkThickness }),
  setArabicVerseNumber: (on) => set({ arabicVerseNumber: on }),
  setTranslationVerseNumber: (on) => set({ translationVerseNumber: on }),
  setTranslationEnabled: (enabled) => set({ translationEnabled: enabled }),
  setArabicEnabled: (enabled) => set({ arabicEnabled: enabled }),
  setTranslationFontSize: (size) => set({ translationFontSize: size }),
  setTranslationFont: (font) => set({ translationFont: font }),
  setTranslationFontWeight: (weight) => set({ translationFontWeight: weight }),
  setTranslationLanguage: (lang) => set({ translationLanguage: lang }),
  setTextColor: (color) => set({ textColor: color }),
  setTranslationColor: (color) => set({ translationColor: color }),
  setLineHeight: (lh) => set({ lineHeight: lh }),
  setTranslationLineHeight: (lh) => set({ translationLineHeight: lh }),
  setArabicTranslationGap: (gap) => set({ arabicTranslationGap: gap }),
  setTextPosition: (pos) => set({ textPosition: pos }),
  setTextLayout: (textLayout) => set({ textLayout }),
  setSplitMask: (splitMask) => set({ splitMask }),
  setOverlayOpacity: (opacity) => set({ overlayOpacity: opacity }),
  setOverlayColor: (color) => set({ overlayColor: color }),
  setSafeAreaTarget: (target) => set({ safeAreaTarget: target }),
  setSafePadding: (padding) => set({ safePadding: padding }),
  setBackground: (bg) => set((state) => ({
    background: bg,
    backgroundVideoSync: false,
    backgroundScenes: state.backgroundSequenceEnabled && state.activeBackgroundSceneId
      ? state.backgroundScenes.map((scene) => scene.id === state.activeBackgroundSceneId
        ? { ...scene, background: bg }
        : scene)
      : state.backgroundScenes,
  })),
  setBackgroundFit: (fit) => set((state) => ({
    backgroundFit: fit,
    backgroundScenes: state.backgroundSequenceEnabled && state.activeBackgroundSceneId
      ? state.backgroundScenes.map((scene) => scene.id === state.activeBackgroundSceneId ? { ...scene, fit } : scene)
      : state.backgroundScenes,
  })),
  setMediaTransform: (mediaTransform) => set((state) => ({
    mediaTransform,
    backgroundScenes: state.backgroundSequenceEnabled && state.activeBackgroundSceneId
      ? state.backgroundScenes.map((scene) => scene.id === state.activeBackgroundSceneId ? { ...scene, transform: mediaTransform } : scene)
      : state.backgroundScenes,
  })),
  setMediaFrame: (mediaFrame) => set({ mediaFrame }),
  setFitBackdrop: (b) => set((state) => ({
    fitBackdrop: b,
    backgroundScenes: state.backgroundSequenceEnabled && state.activeBackgroundSceneId
      ? state.backgroundScenes.map((scene) => scene.id === state.activeBackgroundSceneId ? { ...scene, backdrop: b } : scene)
      : state.backgroundScenes,
  })),
  setBackgroundSequenceEnabled: (enabled) => set((state) => {
    if (!enabled) return { backgroundSequenceEnabled: false };
    if (state.backgroundScenes.length > 0) {
      const active = state.backgroundScenes.find((scene) => scene.id === state.activeBackgroundSceneId) ?? state.backgroundScenes[0];
      return {
        backgroundSequenceEnabled: true,
        activeBackgroundSceneId: active.id,
        background: active.background,
        backgroundFit: active.fit,
        fitBackdrop: active.backdrop,
        mediaTransform: active.transform,
      };
    }
    const first = createBackgroundScene(state.background, {
      fit: state.backgroundFit,
      backdrop: state.fitBackdrop,
      transform: state.mediaTransform,
    });
    return {
      backgroundSequenceEnabled: true,
      backgroundScenes: [first],
      activeBackgroundSceneId: first.id,
    };
  }),
  addBackgroundScene: (background) => set((state) => {
    const scene = createBackgroundScene(background, {
      fit: state.backgroundFit,
      backdrop: state.fitBackdrop,
      transform: { scale: 1, x: 0, y: 0 },
    });
    return {
      backgroundSequenceEnabled: true,
      backgroundScenes: [...state.backgroundScenes, scene],
      activeBackgroundSceneId: scene.id,
      background,
      mediaTransform: scene.transform,
      backgroundVideoSync: false,
    };
  }),
  selectBackgroundScene: (id) => set((state) => {
    const scene = state.backgroundScenes.find((item) => item.id === id);
    return scene ? {
      activeBackgroundSceneId: id,
      background: scene.background,
      backgroundFit: scene.fit,
      fitBackdrop: scene.backdrop,
      mediaTransform: scene.transform,
    } : {};
  }),
  updateBackgroundScene: (id, patch) => set((state) => {
    const scenes = state.backgroundScenes.map((scene) => scene.id === id ? { ...scene, ...patch } : scene);
    const active = id === state.activeBackgroundSceneId ? scenes.find((scene) => scene.id === id) : undefined;
    return {
      backgroundScenes: scenes,
      ...(active ? {
        background: active.background,
        backgroundFit: active.fit,
        fitBackdrop: active.backdrop,
        mediaTransform: active.transform,
      } : {}),
    };
  }),
  removeBackgroundScene: (id) => set((state) => {
    const index = state.backgroundScenes.findIndex((scene) => scene.id === id);
    if (index < 0) return {};
    const scenes = state.backgroundScenes.filter((scene) => scene.id !== id);
    if (scenes.length === 0) return {
      backgroundSequenceEnabled: false,
      backgroundScenes: [],
      activeBackgroundSceneId: null,
    };
    const active = state.activeBackgroundSceneId === id
      ? scenes[Math.min(index, scenes.length - 1)]
      : scenes.find((scene) => scene.id === state.activeBackgroundSceneId) ?? scenes[0];
    return {
      backgroundScenes: scenes,
      activeBackgroundSceneId: active.id,
      background: active.background,
      backgroundFit: active.fit,
      fitBackdrop: active.backdrop,
      mediaTransform: active.transform,
    };
  }),
  moveBackgroundScene: (id, direction) => set((state) => ({
    backgroundScenes: moveBackgroundScene(state.backgroundScenes, id, direction),
  })),
  setPendingTemplateMedia: (request) => set({
    pendingTemplateMedia: request
      ? {
          templateName: request.templateName,
          slots: request.slots.map((slot) => ({ ...slot })),
        }
      : null,
  }),
  fulfillTemplateMediaSlot: (id) => set((state) => {
    if (!state.pendingTemplateMedia) return {};
    const slots = state.pendingTemplateMedia.slots.filter((slot) => slot.id !== id);
    return {
      pendingTemplateMedia: slots.length > 0
        ? { ...state.pendingTemplateMedia, slots }
        : null,
    };
  }),
  setBackgroundVideoSync: (on) => set({ backgroundVideoSync: on }),
  setVideoLoopMode: (m) => set({ videoLoopMode: m }),
  setTextShadow: (shadow) => set({ textShadow: shadow }),
  setTextOutline: (outline) => set({ textOutline: outline }),
  setLetterbox: (config) => set({ letterbox: config }),
  setCurrentVerseIndex: (index) => set((state) => ({
    currentVerseIndex: index,
    ...(state.currentVerseIndex !== index ? { activePartIndex: 0 } : {}),
  })),
  setProjectId: (id) => set({ projectId: id }),
  setPlaybackSegment: (arabic, translation, isLast = true) =>
    set({ playbackSegmentArabic: arabic, playbackSegmentTranslation: translation, playbackSegmentIsLast: isLast }),
  applyStyle: (style) => set(style),
  restoreProject: (surah, verses, selectedVerseNumbers, settings, projectId, importedAudio, verseParts) => {
    let timings = importedAudio?.timings;
    if (timings) {
      timings = timings.map((t) => {
        if (!t.splits?.length || t.splitWords?.length) return t;
        const verse = verses.find((v) => v.verse_number === t.verseNumber);
        if (!verse) return t;
        const total = verse.text_uthmani.split(/\s+/).filter(Boolean).length;
        const dur = t.end - t.start;
        if (dur <= 0 || total < 2) return t;
        return {
          ...t,
          splitWords: t.splits.map((sp) =>
            Math.max(1, Math.min(total - 1, Math.round(((sp - t.start) / dur) * total)))
          ),
          splitWordTotal: total,
        };
      });
    }
    // Every per-clip setting starts from its feature-off default and is then
    // overlaid with whatever the saved record actually carries. A record saved
    // before a feature existed therefore restores that feature OFF instead of
    // inheriting the previously open clip's value — reopening a clip must
    // never show another clip's settings, captions, or decorations.
    const defaults = restoreSettingsDefaults();
    const provided = Object.fromEntries(
      Object.entries(settings).filter(([, value]) => value !== undefined)
    ) as Partial<typeof settings>;
    set({
      surah,
      verses,
      selectedVerseNumbers,
      currentVerseIndex: 0,
      // Transient per-clip state a previous session may have left behind.
      activePartIndex: 0,
      activeWordIndex: null,
      playbackSegmentArabic: null,
      playbackSegmentTranslation: null,
      playbackSegmentIsLast: true,
      pendingTemplateMedia: null,
      projectId,
      verseParts: verseParts ?? {},
      audioSource: importedAudio && timings
        ? { mode: "imported", url: importedAudio.url, name: importedAudio.name, timings }
        : { mode: "reciter" },
      ...defaults,
      ...provided,
      activeBackgroundSceneId: settings.activeBackgroundSceneId ?? settings.backgroundScenes?.[0]?.id ?? null,
    });
  },
  toggleEmphasisWord: (verseKey, which, index) =>
    set((state) => {
      const cur = state.emphasis[verseKey] ?? { arabic: [], translation: [] };
      const list = cur[which];
      const next = list.includes(index)
        ? list.filter((i) => i !== index)
        : [...list, index].sort((a, b) => a - b);
      return {
        emphasis: { ...state.emphasis, [verseKey]: { ...cur, [which]: next } },
      };
    }),
  clearVerseEmphasis: (verseKey) =>
    set((state) => ({
      emphasis: { ...state.emphasis, [verseKey]: { arabic: [], translation: [] } },
    })),
  setEmphasisStyle: (style) => set({ emphasisStyle: style }),
  setEmphasisColor: (color) => set({ emphasisColor: color }),
  setWordHighlight: (on) => set({ wordHighlight: on }),
  setHighlightEnabled: (v) => set({ highlightEnabled: v }),
  setHighlightColor: (v) => set({ highlightColor: v }),
  setHighlightOpacity: (v) => set({ highlightOpacity: v }),
  setHighlightRadius: (v) => set({ highlightRadius: v }),
  setHighlightPadding: (v) => set({ highlightPadding: v }),
  setHighlightHeight: (v) => set({ highlightHeight: v }),
  setActiveWordIndex: (index) => set({ activeWordIndex: index }),
  setVerseParts: (verseNumber, boundaries) =>
    set((state) => {
      const next = { ...state.verseParts };
      if (boundaries.length === 0) delete next[verseNumber];
      else next[verseNumber] = [...boundaries].sort((a, b) => a - b);
      return { verseParts: next, activePartIndex: 0 };
    }),
  setActivePartIndex: (index) => set({ activePartIndex: index }),
  setVerseIntro: (v) => set({ verseIntro: v }),
  setVerseIntroMs: (ms) => set({ verseIntroMs: ms }),
  setClipFadeMs: (ms) => set({ clipFadeMs: ms }),
  setAudioFadeIn: (on) => set({ audioFadeIn: on }),
  setImportedAudio: (url, name, timings) =>
    set({ audioSource: { mode: "imported", url, name, timings } }),
  // The single chokepoint for timeline edits. normalizeTimings clamps any split
  // that escaped its verse's bounds (which made verseTextAt overrun and show the
  // wrong words) without ever reordering/dropping rows or splits — so duplicated
  // verses and splitWords parallelism are preserved.
  setVerseTimings: (timings) =>
    set((state) =>
      state.audioSource.mode === "imported"
        ? { audioSource: { ...state.audioSource, timings: normalizeTimings(timings) } }
        : {}
    ),
  // Remove a whole verse (one editor card) from an imported clip. Drops the
  // timing entry AND, unless another timing still covers that verse number
  // (i.e. it was duplicated), drops the verse from selectedVerseNumbers — the
  // export iterates selectedVerseNumbers and looks up audio by verse number, so
  // leaving a deselected/timing-less verse behind would desync preview/export.
  deleteImportedVerse: (verseIdx) =>
    set((state) => {
      if (state.audioSource.mode !== "imported") return {};
      const timings = state.audioSource.timings;
      // Never delete the last remaining verse — a clip needs at least one.
      if (verseIdx < 0 || verseIdx >= timings.length || timings.length <= 1) return {};
      const removed = timings[verseIdx];
      const nextTimings = timings.filter((_, j) => j !== verseIdx);
      const stillUsed = nextTimings.some((t) => t.verseNumber === removed.verseNumber);
      const nextSelected = stillUsed
        ? state.selectedVerseNumbers
        : state.selectedVerseNumbers.filter((n) => n !== removed.verseNumber);
      const nextIndex = Math.max(0, Math.min(state.currentVerseIndex, nextTimings.length - 1));
      return {
        audioSource: { ...state.audioSource, timings: nextTimings },
        selectedVerseNumbers: nextSelected,
        currentVerseIndex: nextIndex,
      };
    }),
  clearImportedAudio: () => set({ audioSource: { mode: "reciter" } }),
  beginNewProject: () => set({
    projectId: null,
    selectedVerseNumbers: [],
    currentVerseIndex: 0,
    audioSource: { mode: "reciter" },
    verseParts: {},
    activePartIndex: 0,
    // Per-clip decorations must not bleed into a fresh clip of the same surah:
    // emphasis is keyed by verse_key, so a stale entry would re-decorate the
    // same verse. activeWordIndex is transient playback state.
    emphasis: {},
    activeWordIndex: null,
    mediaTransform: { scale: 1, x: 0, y: 0 },
    mediaFrame: { ...DEFAULT_MEDIA_FRAME },
    backgroundSequenceEnabled: false,
    backgroundScenes: [],
    activeBackgroundSceneId: null,
    pendingTemplateMedia: null,
  }),
}));
