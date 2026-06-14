import { create } from "zustand";
import { Surah, Verse, VideoFormat, Background, TextShadow, LetterboxConfig, Project } from "@/types";
import { SafeAreaTarget, EmphasisStyle, MediaFit, FitBackdrop, VerseIntro } from "./canvas-utils";
import { StyleSettings } from "./style";
import { VerseTiming } from "./audio-import";
import { sanitizeArabic } from "./canvas-utils";
import { backgroundPresets } from "./backgrounds";

export interface VerseEmphasis {
  arabic: number[];
  translation: number[];
}

export type AudioSource =
  | { mode: "reciter" }
  | { mode: "imported"; url: string; name: string; timings: VerseTiming[] };

interface AppState {
  surah: Surah | null;
  verses: Verse[];
  selectedVerseNumbers: number[];
  reciterId: string;
  videoFormat: VideoFormat;
  arabicFontSize: number;
  arabicFont: string;
  arabicFontWeight: number;
  arabicVerseNumber: boolean;
  translationVerseNumber: boolean;
  translationEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  translationFontWeight: number;
  translationLanguage: string;
  textColor: string;
  lineHeight: number;
  translationLineHeight: number;
  arabicTranslationGap: number;
  textPosition: number;
  overlayOpacity: number;
  overlayColor: string;
  safeAreaTarget: SafeAreaTarget;
  safePadding: number;
  background: Background;
  backgroundFit: MediaFit;
  fitBackdrop: FitBackdrop;
  backgroundVideoSync: boolean; // sync the bg video's frames to the recitation (lip-sync)
  videoLoopMode: "loop" | "freeze"; // when the bg video ends: loop it, or hold the last frame
  textShadow: TextShadow;
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
  setArabicVerseNumber: (on: boolean) => void;
  setTranslationVerseNumber: (on: boolean) => void;
  setTranslationEnabled: (enabled: boolean) => void;
  setTranslationFontSize: (size: number) => void;
  setTranslationFont: (font: string) => void;
  setTranslationFontWeight: (weight: number) => void;
  setTranslationLanguage: (lang: string) => void;
  setTextColor: (color: string) => void;
  setLineHeight: (lh: number) => void;
  setTranslationLineHeight: (lh: number) => void;
  setArabicTranslationGap: (gap: number) => void;
  setTextPosition: (pos: number) => void;
  setOverlayOpacity: (opacity: number) => void;
  setOverlayColor: (color: string) => void;
  setSafeAreaTarget: (target: SafeAreaTarget) => void;
  setSafePadding: (padding: number) => void;
  setBackground: (bg: Background) => void;
  setBackgroundFit: (fit: MediaFit) => void;
  setFitBackdrop: (b: FitBackdrop) => void;
  setBackgroundVideoSync: (on: boolean) => void;
  setVideoLoopMode: (m: "loop" | "freeze") => void;
  setTextShadow: (shadow: TextShadow) => void;
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
  setImportedAudio: (url: string, name: string, timings: VerseTiming[]) => void;
  setVerseTimings: (timings: VerseTiming[]) => void;
  clearImportedAudio: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  surah: null,
  verses: [],
  selectedVerseNumbers: [],
  reciterId: "alafasy",
  videoFormat: "9:16",
  arabicFontSize: 30,
  arabicFont: "uthmanic-hafs",
  arabicFontWeight: 400,
  arabicVerseNumber: false,
  translationVerseNumber: true,
  translationEnabled: true,
  translationFontSize: 14,
  translationFont: "sans-serif",
  translationFontWeight: 400,
  translationLanguage: "en",
  textColor: "#ffffff",
  lineHeight: 1,
  translationLineHeight: 1,
  arabicTranslationGap: 0.6,
  textPosition: 50,
  overlayOpacity: 50,
  overlayColor: "#000000",
  safeAreaTarget: "none",
  safePadding: 0,
  background: backgroundPresets[0],
  backgroundFit: "cover",
  fitBackdrop: "blur",
  backgroundVideoSync: false,
  videoLoopMode: "loop",
  textShadow: { enabled: true, color: "#000000", blur: 4, offsetX: 0, offsetY: 2 },
  letterbox: { enabled: false, barColor: "#000000", barStyle: "solid" },
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
  setArabicVerseNumber: (on) => set({ arabicVerseNumber: on }),
  setTranslationVerseNumber: (on) => set({ translationVerseNumber: on }),
  setTranslationEnabled: (enabled) => set({ translationEnabled: enabled }),
  setTranslationFontSize: (size) => set({ translationFontSize: size }),
  setTranslationFont: (font) => set({ translationFont: font }),
  setTranslationFontWeight: (weight) => set({ translationFontWeight: weight }),
  setTranslationLanguage: (lang) => set({ translationLanguage: lang }),
  setTextColor: (color) => set({ textColor: color }),
  setLineHeight: (lh) => set({ lineHeight: lh }),
  setTranslationLineHeight: (lh) => set({ translationLineHeight: lh }),
  setArabicTranslationGap: (gap) => set({ arabicTranslationGap: gap }),
  setTextPosition: (pos) => set({ textPosition: pos }),
  setOverlayOpacity: (opacity) => set({ overlayOpacity: opacity }),
  setOverlayColor: (color) => set({ overlayColor: color }),
  setSafeAreaTarget: (target) => set({ safeAreaTarget: target }),
  setSafePadding: (padding) => set({ safePadding: padding }),
  setBackground: (bg) => set({ background: bg, backgroundVideoSync: false }),
  setBackgroundFit: (fit) => set({ backgroundFit: fit }),
  setFitBackdrop: (b) => set({ fitBackdrop: b }),
  setBackgroundVideoSync: (on) => set({ backgroundVideoSync: on }),
  setVideoLoopMode: (m) => set({ videoLoopMode: m }),
  setTextShadow: (shadow) => set({ textShadow: shadow }),
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
        const total = sanitizeArabic(verse.text_uthmani).split(/\s+/).filter(Boolean).length;
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
    set({
      surah,
      verses,
      selectedVerseNumbers,
      currentVerseIndex: 0,
      projectId,
      verseParts: verseParts ?? {},
      audioSource: importedAudio && timings
        ? { mode: "imported", url: importedAudio.url, name: importedAudio.name, timings }
        : { mode: "reciter" },
      ...settings,
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
  setImportedAudio: (url, name, timings) =>
    set({ audioSource: { mode: "imported", url, name, timings } }),
  setVerseTimings: (timings) =>
    set((state) =>
      state.audioSource.mode === "imported"
        ? { audioSource: { ...state.audioSource, timings } }
        : {}
    ),
  clearImportedAudio: () => set({ audioSource: { mode: "reciter" } }),
}));
