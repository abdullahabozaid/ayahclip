import { Background, TextShadow, LetterboxConfig } from "@/types";
import { MediaFit, FitBackdrop, VerseIntro } from "./canvas-utils";

/** The visual style of a clip — the bundle a Template or Saved Style captures/applies.
 *  Deliberately excludes surah/verse selection, reciter, format, language and safe-area. */
export interface StyleSettings {
  arabicFont: string;
  arabicFontSize: number;
  arabicFontWeight: number;
  arabicVerseNumber?: boolean;
  translationVerseNumber?: boolean;
  lineHeight: number;
  translationLineHeight?: number;
  arabicTranslationGap?: number;
  textPosition: number;
  translationEnabled: boolean;
  translationFont: string;
  translationFontSize: number;
  translationFontWeight: number;
  textColor: string;
  overlayOpacity: number;
  overlayColor: string;
  textShadow: TextShadow;
  /** Continuous rounded bar behind each Arabic line. */
  highlightEnabled?: boolean;
  highlightColor?: string;
  highlightOpacity?: number;
  highlightRadius?: number;
  highlightPadding?: number;
  highlightHeight?: number;
  background: Background;
  backgroundFit?: MediaFit;
  fitBackdrop?: FitBackdrop;
  videoLoopMode?: "loop" | "freeze";
  verseIntro?: VerseIntro;
  verseIntroMs?: number;
  letterbox: LetterboxConfig;
}

export const STYLE_KEYS: (keyof StyleSettings)[] = [
  "arabicFont",
  "arabicFontSize",
  "arabicFontWeight",
  "arabicVerseNumber",
  "translationVerseNumber",
  "lineHeight",
  "translationLineHeight",
  "arabicTranslationGap",
  "textPosition",
  "translationEnabled",
  "translationFont",
  "translationFontSize",
  "translationFontWeight",
  "textColor",
  "overlayOpacity",
  "overlayColor",
  "textShadow",
  "highlightEnabled",
  "highlightColor",
  "highlightOpacity",
  "highlightRadius",
  "highlightPadding",
  "highlightHeight",
  "background",
  "backgroundFit",
  "fitBackdrop",
  "videoLoopMode",
  "verseIntro",
  "verseIntroMs",
  "letterbox",
];

/** Keys saved in user style presets — layout & typography only, no colors/backgrounds. */
export const PRESET_KEYS: (keyof StyleSettings)[] = [
  "arabicFont",
  "arabicFontSize",
  "arabicFontWeight",
  "arabicVerseNumber",
  "translationVerseNumber",
  "lineHeight",
  "translationLineHeight",
  "arabicTranslationGap",
  "textPosition",
  "translationEnabled",
  "translationFont",
  "translationFontSize",
  "translationFontWeight",
  "textShadow",
  "highlightEnabled",
  "highlightRadius",
  "highlightPadding",
  "highlightHeight",
  "verseIntro",
  "verseIntroMs",
  "letterbox",
];

/**
 * A style describes the WORDS, never the clip's background — applying one must
 * not replace the background the user chose/uploaded for the current clip.
 */
export function stripBackgroundKeys(
  style: Partial<StyleSettings>
): Partial<StyleSettings> {
  const rest = { ...style };
  delete rest.background;
  delete rest.backgroundFit;
  delete rest.fitBackdrop;
  delete rest.videoLoopMode;
  return rest;
}

/** Pull just the style fields out of a larger state object. */
export function extractStyle(state: StyleSettings): StyleSettings {
  return STYLE_KEYS.reduce((acc, key) => {
    // @ts-expect-error indexed assignment across the union is safe for these keys
    acc[key] = state[key];
    return acc;
  }, {} as StyleSettings);
}

/** Pull only layout/typography fields (no colors/backgrounds) for saved presets. */
export function extractPresetStyle(state: StyleSettings): Partial<StyleSettings> {
  return PRESET_KEYS.reduce((acc, key) => {
    // @ts-expect-error indexed assignment across the union is safe for these keys
    acc[key] = state[key];
    return acc;
  }, {} as Partial<StyleSettings>);
}
