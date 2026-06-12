import {
  Background,
  TextShadow,
  LetterboxConfig,
  QcfWord,
  Verse,
  VideoFormat,
} from "@/types";
import {
  drawBackground,
  drawBgImage,
  drawVideoFrame,
  drawVerseText,
  drawLetterboxBars,
  getLetterboxContentArea,
  rgbaFromHex,
  safeInsetFor,
  splitWords,
  SafeAreaTarget,
  MediaFit,
  FitBackdrop,
  VerseIntro,
  EmphasisStyle,
  DrawVerseOptions,
} from "./canvas-utils";

/** Output resolution per format. The ONLY size any render path may draw at. */
export const FORMAT_SIZES: Record<VideoFormat, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

/**
 * Every style/setting a frame needs. Field names deliberately match BOTH the
 * Zustand store state and ExportOptions, so either can be passed directly.
 * If you add a visual setting, add it here — there is no other channel.
 */
export interface SceneStyleSource {
  videoFormat: VideoFormat;
  arabicFont: string;
  arabicFontSize: number;
  arabicFontWeight: number;
  arabicVerseNumber: boolean;
  translationVerseNumber: boolean;
  translationEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  translationFontWeight: number;
  translationDirection?: "ltr" | "rtl";
  textColor: string;
  textShadow: TextShadow;
  lineHeight: number;
  translationLineHeight: number;
  arabicTranslationGap: number;
  textPosition: number;
  overlayOpacity: number;
  overlayColor: string;
  safeAreaTarget: SafeAreaTarget;
  safePadding: number;
  background: Background;
  backgroundFit?: MediaFit;
  fitBackdrop?: FitBackdrop;
  letterbox: LetterboxConfig;
  verseIntro?: VerseIntro;
  emphasisStyle: EmphasisStyle;
  emphasisColor: string;
  /** Arabic line highlight bar. */
  highlightEnabled?: boolean;
  highlightColor?: string;
  highlightOpacity?: number;
  highlightRadius?: number;
  highlightPadding?: number;
}

/** Per-frame content: what text is on screen right now and its animation state. */
export interface SceneContent {
  arabicText: string;
  verseNumber: number;
  translation?: string;
  isLastPart: boolean;
  qcfWords?: QcfWord[];
  arabicEmphasis?: number[];
  translationEmphasis?: number[];
  /** Live word-highlight playback overrides the stored emphasis style/color. */
  emphasisStyleOverride?: EmphasisStyle;
  emphasisColorOverride?: string;
  introProgress: number;
}

export interface SceneMedia {
  image?: HTMLImageElement;
  video?: HTMLVideoElement;
}

/**
 * Map a verse's full QCF glyph list to the currently displayed subset when a
 * partial verse (split part / mid-playback segment) is on screen.
 */
export function sliceQcfForDisplay(
  verse: Pick<Verse, "text_uthmani" | "qcfWords">,
  displayArabic: string,
  isLastPart: boolean
): QcfWord[] | undefined {
  const fullQcf = verse.qcfWords;
  if (!fullQcf || displayArabic === verse.text_uthmani) return fullQcf;
  const allWords = splitWords(verse.text_uthmani);
  const partWords = splitWords(displayArabic);
  const justWords = fullQcf.filter((w) => w.char_type_name === "word");
  let offset = 0;
  for (let i = 0; i <= allWords.length - partWords.length; i++) {
    if (allWords.slice(i, i + partWords.length).every((w, j) => w === partWords[j])) {
      offset = i;
      break;
    }
  }
  const sliced = justWords.slice(offset, offset + partWords.length);
  if (isLastPart) {
    const endGlyph = fullQcf.find((w) => w.char_type_name === "end");
    return endGlyph ? [...sliced, endGlyph] : sliced;
  }
  return sliced;
}

/**
 * Paint one complete video frame at export resolution. The ONLY place a frame
 * is composed — preview parity with export is structural, not coincidental.
 * The ctx's canvas MUST be FORMAT_SIZES[style.videoFormat].
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  style: SceneStyleSource,
  content: SceneContent,
  media: SceneMedia = {}
) {
  const size = FORMAT_SIZES[style.videoFormat];
  const w = size.w;
  const h = size.h;
  const scale = w / 480;

  const textOpts: DrawVerseOptions = {
    arabicFont: style.arabicFont,
    arabicFontSize: style.arabicFontSize,
    translationEnabled: style.translationEnabled,
    translationFontSize: style.translationFontSize,
    translationFont: style.translationFont,
    translationDirection: style.translationDirection,
    textColor: style.textColor,
    textShadow: style.textShadow,
    lineHeight: style.lineHeight,
    translationLineHeight: style.translationLineHeight,
    arabicTranslationGap: style.arabicTranslationGap,
    verticalPosition: style.textPosition,
    safeInset: safeInsetFor(style.safeAreaTarget, style.safePadding / 100),
    arabicFontWeight: style.arabicFontWeight,
    arabicVerseNumber: style.arabicVerseNumber && content.isLastPart,
    translationVerseNumber: style.translationVerseNumber,
    translationFontWeight: style.translationFontWeight,
    arabicEmphasis: content.arabicEmphasis,
    translationEmphasis: content.translationEmphasis,
    emphasisStyle: content.emphasisStyleOverride ?? style.emphasisStyle,
    emphasisColor: content.emphasisColorOverride ?? style.emphasisColor,
    introStyle: style.verseIntro,
    introProgress: content.introProgress,
    qcfWords: content.qcfWords,
  };

  const paintRegion = (rw: number, rh: number) => {
    if (media.video) drawVideoFrame(ctx, media.video, rw, rh, style.backgroundFit, style.fitBackdrop);
    else if (media.image) drawBgImage(ctx, media.image, rw, rh, style.backgroundFit, style.fitBackdrop);
    else drawBackground(ctx, rw, rh, style.background);
    ctx.fillStyle = rgbaFromHex(style.overlayColor, style.overlayOpacity / 100);
    ctx.fillRect(0, 0, rw, rh);
    drawVerseText(
      ctx, rw, rh,
      content.arabicText, content.verseNumber, content.translation,
      textOpts, scale
    );
  };

  const useLetterbox = style.letterbox.enabled && style.videoFormat === "9:16";
  if (useLetterbox) {
    drawLetterboxBars(ctx, w, h, style.letterbox);
    const c = getLetterboxContentArea(w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(c.x, c.y, c.w, c.h);
    ctx.clip();
    ctx.translate(0, c.y);
    paintRegion(c.w, c.h);
    ctx.restore();
  } else {
    paintRegion(w, h);
  }
}
