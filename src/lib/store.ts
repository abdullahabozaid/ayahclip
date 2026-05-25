import { create } from "zustand";
import { Surah, Verse, VideoFormat, Background, TextShadow, LetterboxConfig } from "@/types";
import { backgroundPresets } from "./backgrounds";

interface AppState {
  surah: Surah | null;
  verses: Verse[];
  selectedVerseNumbers: number[];
  reciterId: string;
  videoFormat: VideoFormat;
  arabicFontSize: number;
  arabicFont: string;
  translationEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  translationLanguage: string;
  textColor: string;
  overlayOpacity: number;
  background: Background;
  textShadow: TextShadow;
  letterbox: LetterboxConfig;
  currentVerseIndex: number;
  projectId: string | null;
  playbackSegmentArabic: string | null;
  playbackSegmentTranslation: string | null;

  setSurah: (surah: Surah) => void;
  setVerses: (verses: Verse[]) => void;
  toggleVerse: (verseNumber: number) => void;
  selectAllVerses: () => void;
  clearSelection: () => void;
  setReciterId: (id: string) => void;
  setVideoFormat: (format: VideoFormat) => void;
  setArabicFontSize: (size: number) => void;
  setArabicFont: (font: string) => void;
  setTranslationEnabled: (enabled: boolean) => void;
  setTranslationFontSize: (size: number) => void;
  setTranslationFont: (font: string) => void;
  setTranslationLanguage: (lang: string) => void;
  setTextColor: (color: string) => void;
  setOverlayOpacity: (opacity: number) => void;
  setBackground: (bg: Background) => void;
  setTextShadow: (shadow: TextShadow) => void;
  setLetterbox: (config: LetterboxConfig) => void;
  setCurrentVerseIndex: (index: number) => void;
  setProjectId: (id: string | null) => void;
  setPlaybackSegment: (arabic: string | null, translation: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  surah: null,
  verses: [],
  selectedVerseNumbers: [],
  reciterId: "alafasy",
  videoFormat: "9:16",
  arabicFontSize: 48,
  arabicFont: "uthmanic",
  translationEnabled: true,
  translationFontSize: 18,
  translationFont: "serif",
  translationLanguage: "en",
  textColor: "#ffffff",
  overlayOpacity: 50,
  background: backgroundPresets[0],
  textShadow: { enabled: true, color: "#000000", blur: 4, offsetX: 0, offsetY: 2 },
  letterbox: { enabled: false, barColor: "#000000", barStyle: "solid" },
  currentVerseIndex: 0,
  projectId: null,
  playbackSegmentArabic: null,
  playbackSegmentTranslation: null,

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
  clearSelection: () => set({ selectedVerseNumbers: [] }),
  setReciterId: (id) => set({ reciterId: id }),
  setVideoFormat: (format) => set({ videoFormat: format }),
  setArabicFontSize: (size) => set({ arabicFontSize: size }),
  setArabicFont: (font) => set({ arabicFont: font }),
  setTranslationEnabled: (enabled) => set({ translationEnabled: enabled }),
  setTranslationFontSize: (size) => set({ translationFontSize: size }),
  setTranslationFont: (font) => set({ translationFont: font }),
  setTranslationLanguage: (lang) => set({ translationLanguage: lang }),
  setTextColor: (color) => set({ textColor: color }),
  setOverlayOpacity: (opacity) => set({ overlayOpacity: opacity }),
  setBackground: (bg) => set({ background: bg }),
  setTextShadow: (shadow) => set({ textShadow: shadow }),
  setLetterbox: (config) => set({ letterbox: config }),
  setCurrentVerseIndex: (index) => set({ currentVerseIndex: index }),
  setProjectId: (id) => set({ projectId: id }),
  setPlaybackSegment: (arabic, translation) =>
    set({ playbackSegmentArabic: arabic, playbackSegmentTranslation: translation }),
}));
