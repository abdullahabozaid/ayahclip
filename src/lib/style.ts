import { Background, TextShadow, LetterboxConfig } from "@/types";
import { MediaFit, FitBackdrop, VerseIntro } from "./canvas-utils";

/** The visual style of a clip — the bundle a Template or Saved Style captures/applies.
 *  Deliberately excludes surah/verse selection, reciter, format, language and safe-area. */
export interface StyleSettings {
  arabicFont: string;
  arabicFontSize: number;
  arabicFontWeight: number;
  arabicVerseNumber?: boolean;
  lineHeight: number;
  textPosition: number;
  translationEnabled: boolean;
  translationFont: string;
  translationFontSize: number;
  translationFontWeight: number;
  textColor: string;
  overlayOpacity: number;
  overlayColor: string;
  textShadow: TextShadow;
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
  "lineHeight",
  "textPosition",
  "translationEnabled",
  "translationFont",
  "translationFontSize",
  "translationFontWeight",
  "textColor",
  "overlayOpacity",
  "overlayColor",
  "textShadow",
  "background",
  "backgroundFit",
  "fitBackdrop",
  "videoLoopMode",
  "verseIntro",
  "verseIntroMs",
  "letterbox",
];

/** Pull just the style fields out of a larger state object. */
export function extractStyle(state: StyleSettings): StyleSettings {
  return STYLE_KEYS.reduce((acc, key) => {
    // @ts-expect-error indexed assignment across the union is safe for these keys
    acc[key] = state[key];
    return acc;
  }, {} as StyleSettings);
}
