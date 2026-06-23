export interface Surah {
  id: number;
  name_simple: string;
  name_arabic: string;
  verses_count: number;
  revelation_place: "makkah" | "madinah";
  translated_name: {
    name: string;
    language_name: string;
  };
}

export interface QcfWord {
  position: number;
  code_v2: string;
  page_number: number;
  line_number: number;
  text_uthmani: string;
  char_type_name: "word" | "end" | "pause";
}

export interface Verse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani: string;
  translation?: string;
  qcfWords?: QcfWord[];
}

export interface Reciter {
  id: string;
  name: string;
  folder: string;
  quranComRecitationId: number;
}

export interface TranslationLanguage {
  id: string;
  name: string;
  nativeName: string;
  resourceId: number;
  direction: "ltr" | "rtl";
}

export type VideoFormat = "16:9" | "9:16" | "1:1" | "4:5";

export type BackgroundType = "image" | "gradient" | "solid" | "video";

export interface Background {
  type: BackgroundType;
  value: string;
  label: string;
}

export interface TextShadow {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface LetterboxConfig {
  enabled: boolean;
  barColor: string;
  barStyle: "solid" | "blur" | "gradient";
}

export interface Project {
  id: string;
  name: string;
  surahId: number;
  surahName: string;
  selectedVerseNumbers: number[];
  settings: {
    reciterId: string;
    videoFormat: VideoFormat;
    arabicFontSize: number;
    arabicFont: string;
    arabicFontWeight?: number;
    arabicVerseNumber?: boolean;
    translationEnabled: boolean;
    translationFontSize: number;
    translationFont: string;
    translationFontWeight?: number;
    translationLanguage: string;
    textColor: string;
    lineHeight: number;
    translationLineHeight?: number;
    arabicTranslationGap?: number;
    textPosition: number;
    overlayOpacity: number;
    overlayColor: string;
    safeAreaTarget?: "none" | "tiktok" | "reels";
    safePadding?: number;
    background: Background;
    backgroundFit?: "cover" | "contain";
    fitBackdrop?: "blur" | "black";
    videoLoopMode?: "loop" | "freeze";
    verseIntro?: "none" | "fade" | "blur" | "slide" | "scale";
    verseIntroMs?: number;
    /** Clip-start fade-in (whole frame from black) over this many ms; 0 = off. */
    clipFadeMs?: number;
    /** Ramp the audio in over the same clip-start window. */
    audioFadeIn?: boolean;
    textShadow: TextShadow;
    letterbox: LetterboxConfig;
    emphasis?: Record<string, { arabic: number[]; translation: number[] }>;
    emphasisStyle?: "color" | "underline";
    emphasisColor?: string;
  };
  /** Present when the clip uses uploaded audio/video — the blobs are stored
   *  separately in IndexedDB under `audio:<id>` / `video:<id>`. */
  imported?: {
    name: string;
    timings: {
      verseNumber: number;
      start: number;
      end: number;
      splits?: number[];
      splitWords?: number[];
      splitWordTotal?: number;
      splitCharFractions?: number[];
      wordRange?: { from: number; to: number };
    }[];
    videoBg: boolean;
  };
  /** Reciter (library) clips: manual word-part boundaries per verse. */
  verseParts?: Record<number, number[]>;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

export interface StudioSettings {
  surah: Surah | null;
  verses: Verse[];
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
}
