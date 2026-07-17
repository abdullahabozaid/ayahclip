import { Background, TextShadow, TextOutline, LetterboxConfig, SplitMaskConfig } from "@/types";
import { MediaFit, FitBackdrop, VerseIntro, MediaTransform } from "./canvas-utils";

/** The visual style of a clip — the bundle a Template or Saved Style captures/applies.
 *  Deliberately excludes surah/verse selection, reciter, format, language and safe-area. */
export interface StyleSettings {
  arabicFont: string;
  arabicFontSize: number;
  arabicFontWeight: number;
  /** Adds controlled ink to Quran glyphs without synthesizing a fake font weight. */
  arabicInkThickness?: number;
  arabicVerseNumber?: boolean;
  translationVerseNumber?: boolean;
  lineHeight: number;
  translationLineHeight?: number;
  arabicTranslationGap?: number;
  textPosition: number;
  /** Composition of the text and media, not just a cosmetic preset. */
  textLayout?: "center" | "left-panel";
  splitMask?: SplitMaskConfig;
  translationEnabled: boolean;
  arabicEnabled?: boolean;
  translationFont: string;
  translationFontSize: number;
  translationFontWeight: number;
  textColor: string;
  /** Translation can be quieter than the Quran text without reducing Arabic contrast. */
  translationColor?: string;
  overlayOpacity: number;
  overlayColor: string;
  textShadow: TextShadow;
  /** Crisp glyph edge rendered separately from the optional shadow/glow. */
  textOutline?: TextOutline;
  /** Continuous rounded bar behind each Arabic line. */
  highlightEnabled?: boolean;
  highlightColor?: string;
  highlightOpacity?: number;
  highlightRadius?: number;
  highlightPadding?: number;
  highlightHeight?: number;
  background: Background;
  backgroundFit?: MediaFit;
  mediaTransform?: MediaTransform;
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
  "arabicInkThickness",
  "arabicVerseNumber",
  "translationVerseNumber",
  "lineHeight",
  "translationLineHeight",
  "arabicTranslationGap",
  "textPosition",
  "textLayout",
  "splitMask",
  "translationEnabled",
  "arabicEnabled",
  "translationFont",
  "translationFontSize",
  "translationFontWeight",
  "textColor",
  "translationColor",
  "overlayOpacity",
  "overlayColor",
  "textShadow",
  "textOutline",
  "highlightEnabled",
  "highlightColor",
  "highlightOpacity",
  "highlightRadius",
  "highlightPadding",
  "highlightHeight",
  "background",
  "backgroundFit",
  "mediaTransform",
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
  "arabicInkThickness",
  "arabicVerseNumber",
  "translationVerseNumber",
  "lineHeight",
  "translationLineHeight",
  "arabicTranslationGap",
  "textPosition",
  "textLayout",
  "translationEnabled",
  "arabicEnabled",
  "translationFont",
  "translationFontSize",
  "translationFontWeight",
  "translationColor",
  "textShadow",
  "textOutline",
  "highlightEnabled",
  "highlightRadius",
  "highlightPadding",
  "highlightHeight",
  "verseIntro",
  "verseIntroMs",
  "letterbox",
];

/**
 * Preserve the creator's media source while still applying the template's
 * composition. Fit, focal position, backdrop, and playback behaviour are part
 * of the template design; only the actual background asset is clip-specific.
 */
export function stripBackgroundKeys(
  style: Partial<StyleSettings>
): Partial<StyleSettings> {
  const rest = { ...style };
  delete rest.background;
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
