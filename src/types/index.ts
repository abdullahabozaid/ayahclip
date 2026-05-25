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

export interface Verse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani: string;
  translation?: string;
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
    translationEnabled: boolean;
    translationFontSize: number;
    translationFont: string;
    translationLanguage: string;
    textColor: string;
    overlayOpacity: number;
    background: Background;
    textShadow: TextShadow;
    letterbox: LetterboxConfig;
  };
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
