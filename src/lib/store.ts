import { create } from "zustand";
import { Surah, Verse, VideoFormat, Background } from "@/types";
import { backgroundPresets } from "./backgrounds";

interface AppState {
  surah: Surah | null;
  verses: Verse[];
  selectedVerseNumbers: number[];
  reciterId: string;
  videoFormat: VideoFormat;
  arabicFontSize: number;
  translationEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  textColor: string;
  overlayOpacity: number;
  background: Background;
  currentVerseIndex: number;

  setSurah: (surah: Surah) => void;
  setVerses: (verses: Verse[]) => void;
  toggleVerse: (verseNumber: number) => void;
  selectAllVerses: () => void;
  clearSelection: () => void;
  setReciterId: (id: string) => void;
  setVideoFormat: (format: VideoFormat) => void;
  setArabicFontSize: (size: number) => void;
  setTranslationEnabled: (enabled: boolean) => void;
  setTranslationFontSize: (size: number) => void;
  setTranslationFont: (font: string) => void;
  setTextColor: (color: string) => void;
  setOverlayOpacity: (opacity: number) => void;
  setBackground: (bg: Background) => void;
  setCurrentVerseIndex: (index: number) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  surah: null,
  verses: [],
  selectedVerseNumbers: [],
  reciterId: "alafasy",
  videoFormat: "9:16",
  arabicFontSize: 48,
  translationEnabled: true,
  translationFontSize: 18,
  translationFont: "serif",
  textColor: "#ffffff",
  overlayOpacity: 50,
  background: backgroundPresets[0],
  currentVerseIndex: 0,

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
  setTranslationEnabled: (enabled) => set({ translationEnabled: enabled }),
  setTranslationFontSize: (size) => set({ translationFontSize: size }),
  setTranslationFont: (font) => set({ translationFont: font }),
  setTextColor: (color) => set({ textColor: color }),
  setOverlayOpacity: (opacity) => set({ overlayOpacity: opacity }),
  setBackground: (bg) => set({ background: bg }),
  setCurrentVerseIndex: (index) => set({ currentVerseIndex: index }),
}));
