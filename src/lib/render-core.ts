import {
  Background,
  SplitMaskConfig,
  TextShadow,
  TextOutline,
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
  drawSplitMask,
  getLetterboxContentArea,
  rgbaFromHex,
  safeInsetFor,
  SafeAreaTarget,
  MediaFit,
  FitBackdrop,
  VerseIntro,
  EmphasisStyle,
  DrawVerseOptions,
  MediaTransform,
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
  arabicInkThickness?: number;
  arabicVerseNumber: boolean;
  translationVerseNumber: boolean;
  translationEnabled: boolean;
  arabicEnabled?: boolean;
  translationFontSize: number;
  translationFont: string;
  translationFontWeight: number;
  translationDirection?: "ltr" | "rtl";
  textColor: string;
  translationColor?: string;
  textShadow: TextShadow;
  textOutline?: TextOutline;
  lineHeight: number;
  translationLineHeight: number;
  arabicTranslationGap: number;
  textPosition: number;
  textLayout?: "center" | "left-panel";
  splitMask?: SplitMaskConfig;
  overlayOpacity: number;
  overlayColor: string;
  safeAreaTarget: SafeAreaTarget;
  safePadding: number;
  background: Background;
  backgroundFit?: MediaFit;
  fitBackdrop?: FitBackdrop;
  mediaTransform?: MediaTransform;
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
  highlightHeight?: number;
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
  /** Clip-start fade: 1 = fully shown, 0 = black. Fades the whole frame in at
   *  the very start of the clip. Defaults to 1 (no fade) when omitted. */
  clipFadeProgress?: number;
}

export interface SceneMedia {
  image?: HTMLImageElement;
  video?: HTMLVideoElement;
  /** Optional per-frame override used by B-roll sequences. */
  background?: Background;
  fit?: MediaFit;
  backdrop?: FitBackdrop;
  transform?: MediaTransform;
  nextImage?: HTMLImageElement;
  nextVideo?: HTMLVideoElement;
  nextBackground?: Background;
  nextFit?: MediaFit;
  nextBackdrop?: FitBackdrop;
  nextTransform?: MediaTransform;
  transitionProgress?: number;
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
  // Quran.com's Unicode verse text can expose a waqf mark as a separate token
  // while one QCF glyph keeps the word and that mark together. Map by the raw
  // source-token span covered by each glyph instead of assuming 1 token = 1
  // glyph, otherwise every partial verse after a waqf can shift by one word.
  const allTokens = verse.text_uthmani.split(/\s+/).filter(Boolean);
  const partTokens = displayArabic.split(/\s+/).filter(Boolean);
  let tokenOffset = 0;
  for (let i = 0; i <= allTokens.length - partTokens.length; i++) {
    if (allTokens.slice(i, i + partTokens.length).every((word, j) => word === partTokens[j])) {
      tokenOffset = i;
      break;
    }
  }
  const tokenEnd = tokenOffset + partTokens.length;
  let coveredTokens = 0;
  const sliced = fullQcf
    .filter((word) => word.char_type_name !== "end")
    .filter((word) => {
      const wordStart = coveredTokens;
      coveredTokens += Math.max(1, word.text_uthmani.split(/\s+/).filter(Boolean).length);
      return coveredTokens > tokenOffset && wordStart < tokenEnd;
    });
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
    arabicEnabled: style.arabicEnabled,
    translationFontSize: style.translationFontSize,
    translationFont: style.translationFont,
    translationDirection: style.translationDirection,
    textColor: style.textColor,
    translationColor: style.translationColor,
    textShadow: style.textShadow,
    textOutline: style.textOutline,
    lineHeight: style.lineHeight,
    translationLineHeight: style.translationLineHeight,
    arabicTranslationGap: style.arabicTranslationGap,
    verticalPosition: style.textPosition,
    textLayout: style.textLayout,
    splitMask: style.splitMask,
    safeInset: safeInsetFor(style.safeAreaTarget, style.safePadding / 100),
    arabicFontWeight: style.arabicFontWeight,
    arabicInkThickness: style.arabicInkThickness,
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
    highlightEnabled: style.highlightEnabled,
    highlightColor: style.highlightColor,
    highlightOpacity: style.highlightOpacity,
    highlightRadius: style.highlightRadius,
    highlightPadding: style.highlightPadding,
    highlightHeight: style.highlightHeight,
  };

  const paintRegion = (rw: number, rh: number) => {
    const paintBackground = (
      background: Background,
      image: HTMLImageElement | undefined,
      video: HTMLVideoElement | undefined,
      fit: MediaFit | undefined,
      backdrop: FitBackdrop | undefined,
      transform: MediaTransform | undefined
    ) => {
      if (video) drawVideoFrame(ctx, video, rw, rh, fit, backdrop, transform);
      else if (image) drawBgImage(ctx, image, rw, rh, fit, backdrop, transform);
      else drawBackground(ctx, rw, rh, background);
    };

    paintBackground(
      media.background ?? style.background,
      media.image,
      media.video,
      media.fit ?? style.backgroundFit,
      media.backdrop ?? style.fitBackdrop,
      media.transform ?? style.mediaTransform
    );

    const transition = Math.max(0, Math.min(1, media.transitionProgress ?? 0));
    if (transition > 0 && media.nextBackground) {
      ctx.save();
      ctx.globalAlpha = transition;
      paintBackground(
        media.nextBackground,
        media.nextImage,
        media.nextVideo,
        media.nextFit,
        media.nextBackdrop,
        media.nextTransform
      );
      ctx.restore();
    }
    ctx.fillStyle = rgbaFromHex(style.overlayColor, style.overlayOpacity / 100);
    ctx.fillRect(0, 0, rw, rh);
    if (style.textLayout === "left-panel") {
      drawSplitMask(ctx, rw, rh, style.splitMask);
    }
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

  // Clip-start fade: paint black over the finished frame so the background AND
  // verse fade in together. Applied last, over everything (including letterbox
  // bars), and never touches text rendering — so Quranic glyphs are unaffected.
  const fade = content.clipFadeProgress ?? 1;
  if (fade < 1) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, 1 - fade));
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
