import { TextShadow, TextOutline, LetterboxConfig, QcfWord, SplitMaskConfig } from "@/types";
import { qcfFontFamily } from "./qcf-font-loader";

export type SafeAreaTarget = "none" | "tiktok" | "reels";

export interface SafeInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Reserved-UI margins as a fraction of the 9:16 frame (platform safe-zone research). */
export const SAFE_ZONES: Record<"tiktok" | "reels", SafeInset> = {
  tiktok: { top: 0.075, bottom: 0.18, left: 0.03, right: 0.15 },
  reels: { top: 0.06, bottom: 0.17, left: 0.06, right: 0.11 },
};

export const DEFAULT_SPLIT_MASK: SplitMaskConfig = {
  side: "left",
  color: "#050507",
  opacity: 1,
  solidWidth: 50,
  fadeWidth: 20,
};

export function normalizeSplitMask(
  config: Partial<SplitMaskConfig> | undefined
): SplitMaskConfig {
  const source = { ...DEFAULT_SPLIT_MASK, ...config };
  const solidWidth = Math.max(0, Math.min(100, source.solidWidth));
  const fadeWidth = Math.max(0, Math.min(100 - solidWidth, source.fadeWidth));
  return {
    side: source.side === "right" ? "right" : "left",
    color: /^(?:#[0-9a-f]{3}|#[0-9a-f]{6})$/i.test(source.color)
      ? source.color
      : DEFAULT_SPLIT_MASK.color,
    opacity: Math.max(0, Math.min(1, source.opacity)),
    solidWidth,
    fadeWidth,
  };
}

export function drawSplitMask(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  config?: Partial<SplitMaskConfig>
) {
  const mask = normalizeSplitMask(config);
  const solid = (mask.solidWidth / 100) * w;
  const fade = (mask.fadeWidth / 100) * w;
  const total = solid + fade;
  if (total <= 0 || mask.opacity <= 0) return;
  const opaque = rgbaFromHex(mask.color, mask.opacity);
  const transparent = rgbaFromHex(mask.color, 0);

  if (fade <= 0) {
    ctx.fillStyle = opaque;
    ctx.fillRect(mask.side === "left" ? 0 : w - solid, 0, solid, h);
    return;
  }

  if (mask.side === "left") {
    const gradient = ctx.createLinearGradient(0, 0, total, 0);
    gradient.addColorStop(0, opaque);
    gradient.addColorStop(solid / total, opaque);
    gradient.addColorStop(1, transparent);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, total, h);
  } else {
    const gradient = ctx.createLinearGradient(w - total, 0, w, 0);
    gradient.addColorStop(0, transparent);
    gradient.addColorStop(fade / total, opaque);
    gradient.addColorStop(1, opaque);
    ctx.fillStyle = gradient;
    ctx.fillRect(w - total, 0, total, h);
  }
}

/** Safe inset for a platform, plus an optional uniform extra padding (fraction of the frame). */
export function safeInsetFor(
  target: SafeAreaTarget,
  padding = 0
): SafeInset | undefined {
  if (target === "none") return undefined;
  const base = SAFE_ZONES[target];
  const p = Math.max(0, padding);
  return {
    top: Math.min(0.45, base.top + p),
    bottom: Math.min(0.45, base.bottom + p),
    left: Math.min(0.45, base.left + p),
    right: Math.min(0.45, base.right + p),
  };
}

export const ARABIC_FONTS: Record<string, string> = {
  qcf: '"UthmanicHafs", serif',
  "uthmanic-hafs": '"UthmanicHafs", serif',
  "amiri-quran": '"Amiri Quran", "UthmanicHafs", serif',
  "scheherazade-new": '"Scheherazade New", "UthmanicHafs", serif',
  "noto-naskh-arabic": '"Noto Naskh Arabic", "UthmanicHafs", serif',
};

export const ARABIC_FONT_WEIGHTS: Record<string, readonly number[]> = {
  qcf: [400],
  "uthmanic-hafs": [400],
  "amiri-quran": [400],
  "scheherazade-new": [400, 500, 600, 700],
  "noto-naskh-arabic": [400, 500, 600, 700],
};

export const TRANSLATION_FONTS: Record<string, string> = {
  serif: '"Georgia", serif',
  "sans-serif": '"Arial", sans-serif',
  outfit: '"Outfit", "Arial", sans-serif',
  cinzel: '"Cinzel", serif',
  "times-new-roman": '"Times New Roman", serif',
  lora: '"Lora", serif',
  "playfair-display": '"Playfair Display", serif',
};

const TRANSLATION_FONT_VARIABLES: Record<string, string> = {
  outfit: "--font-outfit",
  cinzel: "--font-cinzel",
  lora: "--font-lora",
  "playfair-display": "--font-playfair",
};

const ARABIC_FONT_VARIABLES: Record<string, string> = {
  "amiri-quran": "--font-amiri-quran",
  "scheherazade-new": "--font-scheherazade",
  "noto-naskh-arabic": "--font-noto-naskh",
};

export function getArabicFontFamily(font: string): string {
  const variable = ARABIC_FONT_VARIABLES[font];
  if (variable && typeof document !== "undefined") {
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(variable)
      .trim();
    if (resolved) return `${resolved}, "UthmanicHafs", serif`;
  }
  return ARABIC_FONTS[font] ?? '"UthmanicHafs", serif';
}

/** Never ask the canvas to synthesize a Quran font weight that the selected
 * face does not ship. Scheherazade New is the intentional bold-capable mode. */
export function supportedArabicFontWeight(font: string, weight = 400): number {
  const available = ARABIC_FONT_WEIGHTS[font] ?? [400];
  return available.includes(weight) ? weight : available[0];
}

export function shouldUseQcf(font: string, words: readonly QcfWord[] | undefined): boolean {
  return font === "qcf" && Boolean(words?.length);
}

export function getTranslationFontFamily(font: string): string {
  const variable = TRANSLATION_FONT_VARIABLES[font];
  if (variable && typeof document !== "undefined") {
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(variable)
      .trim();
    if (resolved) return `${resolved}, sans-serif`;
  }
  return TRANSLATION_FONTS[font] ?? '"Georgia", serif';
}

// Single-quoted primary family for each font id — used to ask the browser to
// actually load the web font before we paint Arabic to a canvas. If we draw
// before the font is ready, the browser falls back to a system Arabic font that
// mis-places Quranic marks (e.g. a stray small-meem) — unacceptable for Quran
// text. See ensureFontsReady.
const ARABIC_PRIMARY: Record<string, string> = {
  qcf: '"UthmanicHafs"',
  "uthmanic-hafs": '"UthmanicHafs"',
  "amiri-quran": '"Amiri Quran"',
  "scheherazade-new": '"Scheherazade New"',
  "noto-naskh-arabic": '"Noto Naskh Arabic"',
};
const TRANSLATION_PRIMARY: Record<string, string> = {
  serif: "Georgia",
  "sans-serif": "Arial",
  outfit: '"Outfit"',
  cinzel: '"Cinzel"',
  "times-new-roman": '"Times New Roman"',
  lora: '"Lora"',
  "playfair-display": '"Playfair Display"',
};

/**
 * Make sure the chosen Arabic (and translation) web fonts are downloaded and
 * ready for canvas use. Canvas text silently falls back to a system font if the
 * web font hasn't loaded yet, which corrupts the rendering of Quranic diacritics
 * — so every canvas paint of verse text must await this first.
 */
export async function ensureFontsReady(
  arabicFont: string,
  translationFont: string,
  arabicWeight = 400,
  translationWeight = 400,
  options: { timeoutMs?: number; throwOnTimeout?: boolean } = {},
): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const ar = ARABIC_FONT_VARIABLES[arabicFont]
    ? getArabicFontFamily(arabicFont).split(",")[0]
    : ARABIC_PRIMARY[arabicFont] ?? '"UthmanicHafs"';
  const tr = getTranslationFontFamily(translationFont) || TRANSLATION_PRIMARY[translationFont] || "Georgia";
  const safeArabicWeight = supportedArabicFontWeight(arabicFont, arabicWeight);
  const sample = "بِسْمِ ٱللَّهِ ﴿١﴾";
  try {
    const fontLoads = Promise.all([
      document.fonts.load(`${safeArabicWeight} 32px ${ar}`, sample),
      document.fonts.load(`${translationWeight} 24px ${tr}`, "Aa"),
    ]);
    // A missing or browser-generated font family can leave FontFaceSet.load()
    // pending indefinitely. Previews may fall back and repaint later; export
    // opts into a longer, strict timeout so it never records the wrong face.
    const timeoutMs = Math.max(1, options.timeoutMs ?? 800);
    const completed = await Promise.race([
      fontLoads.then(([arabicFaces]) => ({ finished: true as const, arabicFaces })),
      new Promise<{ finished: false; arabicFaces: FontFace[] }>((resolve) =>
        window.setTimeout(() => resolve({ finished: false, arabicFaces: [] }), timeoutMs),
      ),
    ]);
    // FontFaceSet.load resolves with an empty list when no matching @font-face
    // exists. Treat that as a strict export failure; otherwise canvas silently
    // records a platform fallback even though the wait technically completed.
    const arabicFaceReady = completed.finished && completed.arabicFaces.length > 0;
    if (!arabicFaceReady && options.throwOnTimeout) {
      throw new Error("The selected Quran font did not finish loading. Please retry the export.");
    }
  } catch (error) {
    if (options.throwOnTimeout) throw error;
    /* Preview is best-effort: repaint again when document.fonts.ready settles. */
  }
}

export function rgbaFromHex(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// A token made up ONLY of Arabic combining marks / Quranic waqf & pause symbols
// (e.g. the small high three dots ۛ U+06DB). In Uthmani text these are written as
// space-separated tokens, but they MUST stay glued to their word — letting one
// wrap onto a new line corrupts the recitation.

/**
 * Pair the QPC Hafs face with the Unicode source designed for it. Recognition,
 * timing, and matching continue to use text_uthmani; only the painted text is
 * substituted. Never delete a Quranic mark to accommodate a font fallback.
 */
export function arabicTextForFont(
  text: string,
  font: string,
  qcfWords?: readonly QcfWord[],
): string {
  if (font !== "uthmanic-hafs" || !qcfWords?.length) return text;
  const renderWords = qcfWords.filter((word) => word.char_type_name !== "end");
  if (renderWords.length === 0 || renderWords.some((word) => !word.text_qpc_hafs)) {
    return text;
  }
  return renderWords.map((word) => word.text_qpc_hafs).join(" ");
}

const MARK_ONLY =
  /^[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿﹰ-ﹿ]+$/u;

/** Split text into the same "words" (wrap-units) the renderer uses, so emphasis
 *  indices from the UI line up exactly with what's drawn. */
export function splitWords(text: string): string[] {
  return toWrapUnits(text);
}

function toWrapUnits(text: string): string[] {
  const units: string[] = [];
  for (const tok of text.split(" ")) {
    if (tok === "") continue;
    if (MARK_ONLY.test(tok) && units.length > 0) {
      // Glue the mark to the preceding word so they wrap as one unit.
      units[units.length - 1] += ` ${tok}`;
    } else {
      units.push(tok);
    }
  }
  return units;
}

interface WrapUnit {
  text: string;
  index: number;
}

/** Greedy word-wrap that keeps each unit's original index (for per-word emphasis). */
function wrapUnitsToLines(
  ctx: CanvasRenderingContext2D,
  units: string[],
  maxWidth: number
): WrapUnit[][] {
  const lines: WrapUnit[][] = [];
  let cur: WrapUnit[] = [];
  let curText = "";
  units.forEach((word, index) => {
    const test = curText ? `${curText} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && cur.length) {
      lines.push(cur);
      cur = [{ text: word, index }];
      curText = word;
    } else {
      cur.push({ text: word, index });
      curText = test;
    }
  });
  if (cur.length) lines.push(cur);
  return lines;
}

export function measureLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  return wrapUnitsToLines(ctx, toWrapUnits(text), maxWidth).map((l) =>
    l.map((u) => u.text).join(" ")
  );
}

export type EmphasisStyle = "color" | "underline";

interface EmphasisOpts {
  /** Word indices to emphasise (into the text's own word list, before any offset). */
  indices: Set<number>;
  style: EmphasisStyle;
  color: string;
  baseColor: string;
  /** Render-unit indices below this are skipped (e.g. the "12." translation prefix). */
  indexOffset: number;
  fontSize: number;
  rtl: boolean;
  outline?: TextOutline;
  /** Arabic-only ink added beneath the fill; omitted for translations. */
  inkThickness?: number;
  scale?: number;
}

/** Draw the crisp edge independently from shadow/glow. Keeping the outline in
 * its own no-shadow pass avoids doubling the glow while preserving every mark. */
export function strokeTextWithOutline(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  outline: TextOutline | undefined,
  scale = 1,
  innerInkWidth = 0,
) {
  if (!outline?.enabled || outline.width <= 0) return;
  ctx.save();
  clearShadow(ctx);
  ctx.strokeStyle = outline.color;
  // Keep the visible edge outside any same-color ink stroke. Without adding
  // the inner ink width here, thicker Quran ink would consume the crisp edge.
  ctx.lineWidth = Math.max(0.5, (outline.width + innerInkWidth) * scale);
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);
  ctx.restore();
}

/** Thicken the actual Quran ink without asking the browser to synthesize a
 * bold face. This preserves the selected font's shaping and Quranic marks. */
export function strokeTextWithInk(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  thickness = 0,
  scale = 1,
) {
  if (thickness <= 0) return;
  ctx.save();
  ctx.strokeStyle = String(ctx.fillStyle);
  ctx.lineWidth = Math.max(0.25, thickness * scale);
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);
  ctx.restore();
}

/** Word-by-word draw used only when some word is emphasised. Mirrors wrapText's line
 *  breaks; each unit is a single fillText so intra-word shaping & marks stay intact. */
function drawEmphasizedBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  opts: EmphasisOpts
) {
  const lines = wrapUnitsToLines(ctx, toWrapUnits(text), maxWidth);
  const spaceW = ctx.measureText(" ").width;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";

  const drawUnit = (u: WrapUnit, x: number, y: number, width: number) => {
    const emph = opts.indices.has(u.index - opts.indexOffset);
    ctx.fillStyle = emph && opts.style === "color" ? opts.color : opts.baseColor;
    strokeTextWithOutline(ctx, u.text, x, y, opts.outline, opts.scale, opts.inkThickness);
    strokeTextWithInk(ctx, u.text, x, y, opts.inkThickness, opts.scale);
    ctx.fillText(u.text, x, y);
    if (emph && opts.style === "underline") {
      // Underline only the base letters, not trailing standalone marks (e.g. waqf ۛ)
      // that toWrapUnits glued on after a space. In RTL the base word sits at the right.
      const sp = u.text.indexOf(" ");
      const baseW = sp >= 0 ? ctx.measureText(u.text.slice(0, sp)).width : width;
      const ux = opts.rtl ? x + width - baseW : x;
      ctx.save();
      ctx.strokeStyle = opts.color;
      ctx.lineWidth = Math.max(1, opts.fontSize * 0.05);
      const uy = y + opts.fontSize * 0.46;
      ctx.beginPath();
      ctx.moveTo(ux, uy);
      ctx.lineTo(ux + baseW, uy);
      ctx.stroke();
      ctx.restore();
    }
  };

  let y = startY;
  for (const line of lines) {
    const widths = line.map((u) => ctx.measureText(u.text).width);
    const lineW = widths.reduce((a, b) => a + b, 0) + spaceW * (line.length - 1);
    const leftEdge = centerX - lineW / 2;
    if (opts.rtl) {
      let x = leftEdge + lineW; // first reading word sits at the right
      line.forEach((u, i) => {
        x -= widths[i];
        drawUnit(u, x, y, widths[i]);
        x -= spaceW;
      });
    } else {
      let x = leftEdge;
      line.forEach((u, i) => {
        drawUnit(u, x, y, widths[i]);
        x += widths[i] + spaceW;
      });
    }
    y += lineHeight;
  }

  ctx.textAlign = prevAlign;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  outline?: TextOutline,
  scale = 1,
  inkThickness = 0,
) {
  const lines = measureLines(ctx, text, maxWidth);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    strokeTextWithOutline(ctx, lines[i], x, startY + i * lineHeight, outline, scale, inkThickness);
    strokeTextWithInk(ctx, lines[i], x, startY + i * lineHeight, inkThickness, scale);
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}

export function parseGradientStops(
  css: string
): { offset: number; color: string }[] {
  const stops: { offset: number; color: string }[] = [];
  const stopRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+([\d.]+)%/g;
  let match;
  while ((match = stopRegex.exec(css)) !== null) {
    stops.push({ color: match[1], offset: Number(match[2]) / 100 });
  }
  return stops;
}

export function parseGradientAngle(css: string): number {
  const match = css.match(/linear-gradient\(\s*(-?[\d.]+)deg\s*,/i);
  return match ? Number(match[1]) : 180;
}

export interface LinearGradientSpec {
  angle: number;
  stops: { offset: number; color: string }[];
}

export function parseLinearGradient(css: string): LinearGradientSpec {
  return {
    angle: parseGradientAngle(css),
    stops: parseGradientStops(css),
  };
}

export function serializeLinearGradient(spec: LinearGradientSpec): string {
  const angle = ((Number.isFinite(spec.angle) ? spec.angle : 180) % 360 + 360) % 360;
  const stops = spec.stops
    .map((stop) => ({
      color: stop.color,
      offset: Math.max(0, Math.min(1, stop.offset)),
    }))
    .sort((a, b) => a.offset - b.offset);
  const safeStops = stops.length >= 2
    ? stops
    : [
      { color: "#1a1a2e", offset: 0 },
      { color: "#0a0a0a", offset: 1 },
    ];
  return `linear-gradient(${Number(angle.toFixed(2))}deg, ${safeStops
    .map((stop) => `${stop.color} ${Number((stop.offset * 100).toFixed(2))}%`)
    .join(", ")})`;
}

export function gradientLineForAngle(angleDegrees: number, w: number, h: number) {
  // CSS angles start at the upward vertical and rotate clockwise.
  const radians = (angleDegrees * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const halfLength = Math.abs(dx) * w / 2 + Math.abs(dy) * h / 2;
  const cx = w / 2;
  const cy = h / 2;
  return {
    x0: cx - dx * halfLength,
    y0: cy - dy * halfLength,
    x1: cx + dx * halfLength,
    y1: cy + dy * halfLength,
  };
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: { type: string; value: string }
) {
  if (bg.type === "solid") {
    ctx.fillStyle = bg.value;
    ctx.fillRect(0, 0, w, h);
  } else if (bg.type === "gradient") {
    const stops = parseGradientStops(bg.value);
    const line = gradientLineForAngle(parseGradientAngle(bg.value), w, h);
    const gradient = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
    if (stops.length >= 2) {
      for (const s of stops) gradient.addColorStop(s.offset, s.color);
    } else {
      gradient.addColorStop(0, "#1a1a2e");
      gradient.addColorStop(1, "#0a0a0a");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
  }
}

export function applyShadow(
  ctx: CanvasRenderingContext2D,
  shadow: TextShadow,
  scale: number = 1
) {
  if (shadow.enabled) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur * scale;
    ctx.shadowOffsetX = shadow.offsetX * scale;
    ctx.shadowOffsetY = shadow.offsetY * scale;
  }
}

export function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export interface DrawVerseOptions {
  arabicFont: string;
  arabicFontSize: number;
  translationEnabled: boolean;
  /** Hide Arabic for translation-led compositions. Defaults to true. */
  arabicEnabled?: boolean;
  translationFontSize: number;
  translationFont: string;
  translationDirection?: "ltr" | "rtl";
  textColor: string;
  /** Independent translation color; falls back to a softened Quran color. */
  translationColor?: string;
  textShadow: TextShadow;
  textOutline?: TextOutline;
  /** Line-height multiplier applied to the base 1.8 Arabic. Default 1. */
  lineHeight?: number;
  /** Line-height multiplier applied to the base 1.6 translation. Falls back to lineHeight. */
  translationLineHeight?: number;
  /** Vertical placement of the text block: 0 = top, 50 = center, 100 = bottom. Default 50. */
  verticalPosition?: number;
  /** Centered default or a compact block in the dark left side of the frame. */
  textLayout?: "center" | "left-panel";
  /** Reading-panel geometry. Text stays inside the creator's solid region. */
  splitMask?: Partial<SplitMaskConfig>;
  /** When set, text is laid out within this inset box (fractions of w/h) to dodge platform UI. */
  safeInset?: SafeInset;
  /** CSS font-weight for the Arabic text (default 400). */
  arabicFontWeight?: number;
  /** Arabic-only ink thickness in style pixels. Works with fixed-weight Mushaf faces. */
  arabicInkThickness?: number;
  /** CSS font-weight for the translation text (default 400). */
  translationFontWeight?: number;
  /** Word indices (into the Arabic verse words) to emphasise. */
  arabicEmphasis?: number[];
  /** Word indices (into the translation words, excluding the verse-number prefix) to emphasise. */
  translationEmphasis?: number[];
  emphasisStyle?: EmphasisStyle;
  emphasisColor?: string;
  /** Append the ayah number (in ornate brackets, Mushaf-style) to the Arabic line. */
  arabicVerseNumber?: boolean;
  /** Prepend the verse number (e.g. "1.") to the translation line. */
  translationVerseNumber?: boolean;
  /** Gap between Arabic and translation blocks as a multiplier of arabicFontSize. Default 0.6. */
  arabicTranslationGap?: number;
  /** Entrance animation for the text as a verse appears, plus its progress (0..1). */
  introStyle?: VerseIntro;
  introProgress?: number;
  /** QCF v2 word glyphs for pixel-perfect Mushaf rendering. */
  qcfWords?: QcfWord[];
  /** Continuous rounded bar behind each Arabic line. */
  highlightEnabled?: boolean;
  highlightColor?: string;
  highlightOpacity?: number;
  /** 0..1 of the bar's half-height; 1 = full pill. */
  highlightRadius?: number;
  /** Extra reach beyond the text, as a multiplier of arabicFontSize. */
  highlightPadding?: number;
  /** Bar height as a fraction of the full line box (0..1, default 1). The bar
   *  is anchored to the BOTTOM of the line, so a low value reads as a marker
   *  stroke across the lower part of the words. */
  highlightHeight?: number;
}

export interface SplitTextRegion {
  centerX: number;
  maxWidth: number;
}

/** Keep split-layout text attached to the panel the creator actually drew. */
export function splitTextRegion(
  frameWidth: number,
  config?: Partial<SplitMaskConfig>,
): SplitTextRegion {
  const mask = normalizeSplitMask(config);
  const solidWidth = frameWidth * (mask.solidWidth / 100);
  const horizontalPadding = Math.min(frameWidth * 0.045, solidWidth * 0.14);
  const maxWidth = Math.max(frameWidth * 0.16, solidWidth - horizontalPadding * 2);
  return {
    centerX: mask.side === "left"
      ? solidWidth / 2
      : frameWidth - solidWidth / 2,
    maxWidth,
  };
}

export interface ArabicTextFitResult {
  lineCount: number;
  targetLines: number;
  recommendedFontSize: number;
  cramped: boolean;
}

/** Measure the same wrap path as export and recommend a reversible split fit. */
export function analyzeArabicTextFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: {
    arabicFont: string;
    arabicFontWeight: number;
    arabicFontSize: number;
    qcfWords?: QcfWord[];
    arabicVerseNumber?: boolean;
    splitMask?: Partial<SplitMaskConfig>;
    frameWidth?: number;
    minimumFontSize?: number;
  },
): ArabicTextFitResult {
  const frameWidth = options.frameWidth ?? 1080;
  const scale = frameWidth / 480;
  const region = splitTextRegion(frameWidth, options.splitMask);
  const useQcf = shouldUseQcf(options.arabicFont, options.qcfWords);
  const qcfWords = useQcf
    ? (options.arabicVerseNumber
        ? options.qcfWords!
        : options.qcfWords!.filter((word) => word.char_type_name !== "end"))
    : [];
  const wordCount = Math.max(1, splitWords(text).length);
  const targetLines = wordCount <= 6 ? 2 : wordCount <= 15 ? 3 : wordCount <= 28 ? 4 : 5;
  const minimumFontSize = Math.max(18, options.minimumFontSize ?? 18);
  const weight = supportedArabicFontWeight(options.arabicFont, options.arabicFontWeight);
  const family = getArabicFontFamily(options.arabicFont);

  const countAt = (styleSize: number) => {
    const fontSize = styleSize * scale;
    ctx.font = `${weight} ${fontSize}px ${family}`;
    return useQcf
      ? measureQcfLines(ctx, qcfWords, fontSize, region.maxWidth)
      : measureLines(ctx, arabicTextForFont(text, options.arabicFont, options.qcfWords), region.maxWidth).length;
  };

  const lineCount = countAt(options.arabicFontSize);
  let recommendedFontSize = options.arabicFontSize;
  while (recommendedFontSize > minimumFontSize && countAt(recommendedFontSize) > targetLines) {
    recommendedFontSize -= 1;
  }
  return {
    lineCount,
    targetLines,
    recommendedFontSize,
    cramped: lineCount > targetLines,
  };
}

export type VerseIntro = "none" | "fade" | "blur" | "slide" | "scale";

const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]);
}

// --------------- QCF v2 word-by-word rendering ---------------

interface QcfUnit {
  word: QcfWord;
  wordIndex: number;
}

function measureQcfWord(
  ctx: CanvasRenderingContext2D,
  word: QcfWord,
  fontSize: number
): number {
  ctx.font = `400 ${fontSize}px ${qcfFontFamily(word.page_number)}`;
  return ctx.measureText(word.code_v2).width;
}

function wrapQcfWords(
  ctx: CanvasRenderingContext2D,
  words: QcfWord[],
  fontSize: number,
  maxWidth: number
): QcfUnit[][] {
  const lines: QcfUnit[][] = [];
  let cur: QcfUnit[] = [];
  let curWidth = 0;
  let wordIdx = 0;

  for (const word of words) {
    const w = measureQcfWord(ctx, word, fontSize);
    const gap = cur.length > 0 ? fontSize * 0.15 : 0;
    if (cur.length > 0 && curWidth + gap + w > maxWidth) {
      lines.push(cur);
      cur = [{ word, wordIndex: wordIdx }];
      curWidth = w;
    } else {
      cur.push({ word, wordIndex: wordIdx });
      curWidth += gap + w;
    }
    if (word.char_type_name === "word") wordIdx++;
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

function measureQcfLines(
  ctx: CanvasRenderingContext2D,
  words: QcfWord[],
  fontSize: number,
  maxWidth: number
): number {
  return wrapQcfWords(ctx, words, fontSize, maxWidth).length;
}

function qcfLineWidths(
  ctx: CanvasRenderingContext2D,
  words: QcfWord[],
  fontSize: number,
  maxWidth: number
): number[] {
  const gap = fontSize * 0.15;
  return wrapQcfWords(ctx, words, fontSize, maxWidth).map((line) => {
    const ws = line.map((u) => measureQcfWord(ctx, u.word, fontSize));
    return ws.reduce((a, b) => a + b, 0) + gap * (line.length - 1);
  });
}

function drawQcfBlock(
  ctx: CanvasRenderingContext2D,
  words: QcfWord[],
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  fontSize: number,
  emphasis?: EmphasisOpts,
  outline?: TextOutline,
  scale = 1,
  inkThickness = 0,
) {
  const lines = wrapQcfWords(ctx, words, fontSize, maxWidth);
  const gap = fontSize * 0.15;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";

  let y = startY;
  for (const line of lines) {
    const widths = line.map((u) => measureQcfWord(ctx, u.word, fontSize));
    const lineW = widths.reduce((a, b) => a + b, 0) + gap * (line.length - 1);

    let x = centerX + lineW / 2;
    for (let i = 0; i < line.length; i++) {
      x -= widths[i];
      const u = line[i];
      ctx.font = `400 ${fontSize}px ${qcfFontFamily(u.word.page_number)}`;

      const isWord = u.word.char_type_name === "word";
      const emph = isWord && emphasis?.indices.has(u.wordIndex);
      if (emph && emphasis!.style === "color") {
        ctx.fillStyle = emphasis!.color;
      } else {
        ctx.fillStyle = emphasis?.baseColor ?? ctx.fillStyle;
      }

      strokeTextWithOutline(ctx, u.word.code_v2, x, y, outline, scale, inkThickness);
      strokeTextWithInk(ctx, u.word.code_v2, x, y, inkThickness, scale);
      ctx.fillText(u.word.code_v2, x, y);

      if (emph && emphasis!.style === "underline") {
        ctx.save();
        ctx.strokeStyle = emphasis!.color;
        ctx.lineWidth = Math.max(1, fontSize * 0.05);
        const uy = y + fontSize * 0.46;
        ctx.beginPath();
        ctx.moveTo(x, uy);
        ctx.lineTo(x + widths[i], uy);
        ctx.stroke();
        ctx.restore();
      }

      x -= gap;
    }
    y += lineHeight;
  }

  ctx.textAlign = prevAlign;
}

// Shared offscreen layer for the intro animation. drawVerseText runs every rAF
// frame while a verse animates in — allocating a fresh 1080×1920 canvas per
// frame churns GPU memory for nothing. Use is synchronous (paint → composite
// within one call), so a single cached canvas is safe.
let introCanvas: HTMLCanvasElement | null = null;
function getIntroCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (!introCanvas) introCanvas = document.createElement("canvas");
  return introCanvas;
}

export function drawVerseText(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  arabicText: string,
  verseNumber: number,
  translation: string | undefined,
  options: DrawVerseOptions,
  scale: number = 1
) {
  const arabicSize = options.arabicFontSize * scale;
  const arabicFamily = getArabicFontFamily(options.arabicFont);
  const arabicWeight = supportedArabicFontWeight(
    options.arabicFont,
    options.arabicFontWeight,
  );
  const transWeight = options.translationFontWeight ?? 400;

  const useQcf = shouldUseQcf(options.arabicFont, options.qcfWords);
  const qcfWords = options.qcfWords ?? [];
  const qcfRenderWords = useQcf
    ? (options.arabicVerseNumber
        ? qcfWords
        : qcfWords.filter((w) => w.char_type_name !== "end"))
    : [];

  const cleanArabic = arabicTextForFont(arabicText, options.arabicFont, options.qcfWords);
  const arabicDisplay = options.arabicVerseNumber
    ? `${cleanArabic} ﴿${toArabicDigits(verseNumber)}﴾`
    : cleanArabic;

  ctx.fillStyle = options.textColor;
  ctx.font = `${arabicWeight} ${arabicSize}px ${arabicFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const inset = options.safeInset;
  const boxTop = h * (inset?.top ?? 0);
  const boxH = h - boxTop - h * (inset?.bottom ?? 0);
  const leftPanel = options.textLayout === "left-panel";
  const splitRegion = splitTextRegion(w, options.splitMask);
  const centerX = leftPanel ? splitRegion.centerX : w / 2;
  const maxWidth = leftPanel
    ? splitRegion.maxWidth
    : inset
      ? w * (1 - 2 * Math.max(inset.left, inset.right))
      : w * 0.85;

  const arLh = options.lineHeight ?? 1;
  const trLh = options.translationLineHeight ?? arLh;
  const arabicLineH = arabicSize * 1.8 * arLh;
  const transLineH = options.translationFontSize * scale * 1.6 * trLh;

  const arabicEnabled = options.arabicEnabled !== false;
  const arabicLineCount = arabicEnabled
    ? useQcf
      ? measureQcfLines(ctx, qcfRenderWords, arabicSize, maxWidth)
      : measureLines(ctx, arabicDisplay, maxWidth).length
    : 0;
  const arabicBlockHeight = arabicLineCount * arabicLineH;

  let transLines: string[] = [];
  let transSize = 0;
  let transBlockHeight = 0;
  const showTransNum = options.translationVerseNumber !== false;
  if (options.translationEnabled && translation) {
    transSize = options.translationFontSize * scale;
    const fontFamily = getTranslationFontFamily(options.translationFont);
    ctx.font = `${transWeight} ${transSize}px ${fontFamily}`;
    const translationText = showTransNum ? `${verseNumber}. ${translation}` : translation;
    transLines = measureLines(ctx, translationText, maxWidth);
    transBlockHeight = transLines.length * transLineH;
  }

  const gap = arabicLineCount > 0 && transLines.length > 0
    ? arabicSize * (options.arabicTranslationGap ?? 0.6)
    : 0;
  const totalHeight = arabicBlockHeight + gap + transBlockHeight;

  // Vertical placement within the layout box: 0 = top, 50 = center, 100 = bottom.
  const pos = (options.verticalPosition ?? 50) / 100;
  const blockCenterY = boxTop + totalHeight / 2 + pos * Math.max(0, boxH - totalHeight);
  const startY = blockCenterY - totalHeight / 2 + arabicBlockHeight / 2;

  const emphasisStyle = options.emphasisStyle ?? "color";
  const emphasisColor = options.emphasisColor ?? "#c9a24b";

  // Paint the full verse block (Arabic + translation + shadow) at FULL opacity
  // onto the given context. Kept as a unit so the entrance animation can render
  // it once and then composite the result — never drawing the complex Quranic
  // glyphs at partial alpha, which corrupts the marks on some renderers (iOS).
  // All block-drawing below treats `startY`/`transY` as the BLOCK CENTER.
  // wrapText already centers its lines; drawQcfBlock and drawEmphasizedBlock
  // take the FIRST line's y and grow downward, so convert center → first-line
  // here. Mixing the two conventions was the old bug where multi-line Arabic
  // drifted down and the Arabic↔translation gap changed with line count.
  const arabicFirstLineY = (centerYV: number) =>
    centerYV - ((arabicLineCount - 1) * arabicLineH) / 2;

  const paintText = (tctx: CanvasRenderingContext2D) => {
    tctx.textAlign = "center";
    tctx.textBaseline = "middle";

    // Continuous highlight bar behind each Arabic line. Drawn first (no shadow),
    // purely behind the glyphs — text layout/shaping is untouched. Reveals
    // right-to-left (reading direction) while the verse intro plays.
    if (arabicEnabled && options.highlightEnabled) {
      const introPNow = options.introProgress ?? 1;
      const hasIntroAnim = (options.introStyle ?? "none") !== "none";
      const reveal = hasIntroAnim ? 1 - Math.pow(1 - Math.min(1, introPNow), 3) : 1;
      tctx.save();
      clearShadow(tctx);
      tctx.font = `${arabicWeight} ${arabicSize}px ${arabicFamily}`;
      let lineWidths: number[];
      if (useQcf) {
        lineWidths = qcfLineWidths(tctx, qcfRenderWords, arabicSize, maxWidth);
      } else {
        tctx.direction = "rtl";
        lineWidths = measureLines(tctx, arabicDisplay, maxWidth).map(
          (l) => tctx.measureText(l).width
        );
        tctx.direction = "ltr";
      }
      const pad = arabicSize * (options.highlightPadding ?? 0.25);
      const fullBoxH = arabicSize * 1.25 + pad;
      // Height fraction, anchored to the bottom of the line box: at 1 the bar
      // wraps the whole line; low values read as a marker stroke across the
      // lower part of the words.
      const heightFrac = Math.min(1, Math.max(0.1, options.highlightHeight ?? 1));
      const boxH = fullBoxH * heightFrac;
      const radius = (boxH / 2) * Math.min(1, Math.max(0, options.highlightRadius ?? 1));
      tctx.fillStyle = rgbaFromHex(
        options.highlightColor ?? "#1f2a44",
        options.highlightOpacity ?? 1
      );
      lineWidths.forEach((lw, i) => {
        const fullW = lw + pad * 2;
        const revealedW = fullW * reveal;
        if (revealedW < 1) return;
        const yC = arabicFirstLineY(startY) + i * arabicLineH; // textBaseline is middle
        const barTop = yC + fullBoxH / 2 - boxH; // bottom-anchored
        const x = centerX + fullW / 2 - revealedW; // anchored right, grows leftward
        tctx.beginPath();
        if (typeof tctx.roundRect === "function") {
          tctx.roundRect(x, barTop, revealedW, boxH, radius);
        } else {
          tctx.rect(x, barTop, revealedW, boxH);
        }
        tctx.fill();
      });
      tctx.restore();
    }

    applyShadow(tctx, options.textShadow, scale);

    tctx.fillStyle = options.textColor;
    tctx.font = `${arabicWeight} ${arabicSize}px ${arabicFamily}`;
    tctx.direction = "rtl";

    if (!arabicEnabled) {
      // Translation-only composition; the shared block metrics place the
      // translation at the requested vertical position below.
    } else if (useQcf) {
      const qcfEmph =
        options.arabicEmphasis && options.arabicEmphasis.length > 0
          ? {
              indices: new Set(options.arabicEmphasis),
              style: emphasisStyle,
              color: emphasisColor,
              baseColor: options.textColor,
              indexOffset: 0,
              fontSize: arabicSize,
              rtl: true,
            }
          : undefined;
      drawQcfBlock(
        tctx, qcfRenderWords, centerX, arabicFirstLineY(startY), maxWidth, arabicLineH,
        arabicSize, qcfEmph, options.textOutline, scale, options.arabicInkThickness
      );
    } else if (options.arabicEmphasis && options.arabicEmphasis.length > 0) {
      drawEmphasizedBlock(tctx, arabicDisplay, centerX, arabicFirstLineY(startY), maxWidth, arabicLineH, {
        indices: new Set(options.arabicEmphasis),
        style: emphasisStyle,
        color: emphasisColor,
        baseColor: options.textColor,
        indexOffset: 0,
        fontSize: arabicSize,
        rtl: true,
        outline: options.textOutline,
        inkThickness: options.arabicInkThickness,
        scale,
      });
    } else {
      wrapText(tctx, arabicDisplay, centerX, startY, maxWidth, arabicLineH, options.textOutline, scale, options.arabicInkThickness);
    }
    tctx.direction = "ltr";

    if (transLines.length > 0 && translation) {
      const transY = startY + arabicBlockHeight / 2 + gap + transBlockHeight / 2;
      const fontFamily = getTranslationFontFamily(options.translationFont);
      tctx.font = `${transWeight} ${transSize}px ${fontFamily}`;
      const transBase = options.translationColor ?? options.textColor + "cc";
      tctx.fillStyle = transBase;
      const transRtl = options.translationDirection === "rtl";
      if (transRtl) tctx.direction = "rtl";
      const translationText = showTransNum ? `${verseNumber}. ${translation}` : translation;
      if (options.translationEmphasis && options.translationEmphasis.length > 0) {
        const transFirstLineY = transY - ((transLines.length - 1) * transLineH) / 2;
        drawEmphasizedBlock(tctx, translationText, centerX, transFirstLineY, maxWidth, transLineH, {
          indices: new Set(options.translationEmphasis),
          style: emphasisStyle,
          color: emphasisColor,
          baseColor: transBase,
          indexOffset: showTransNum ? 1 : 0,
          fontSize: transSize,
          rtl: transRtl,
          outline: options.textOutline,
          scale,
        });
      } else {
        wrapText(tctx, translationText, centerX, transY, maxWidth, transLineH, options.textOutline, scale);
      }
      tctx.direction = "ltr";
    }

    clearShadow(tctx);
  };

  // Entrance animation: render the verse to an offscreen layer at full opacity,
  // then composite that raster with the alpha/blur/transform. Compositing an
  // already-rendered image is uniform and safe — unlike drawing the shaped Arabic
  // text directly at partial alpha, which can distort the diacritics.
  const introStyle = options.introStyle ?? "none";
  const introP = options.introProgress ?? 1;
  const animating = introStyle !== "none" && introP < 1;

  if (!animating) {
    paintText(ctx);
    return;
  }

  const tm = ctx.getTransform();
  const off = getIntroCanvas();
  const octx = off?.getContext("2d") ?? null;
  if (!off || !octx) {
    // No offscreen available — draw directly (correctness over animation).
    paintText(ctx);
    return;
  }
  const offW = Math.max(1, Math.ceil(w * tm.a));
  const offH = Math.max(1, Math.ceil(h * tm.d));
  if (off.width !== offW) off.width = offW;
  if (off.height !== offH) off.height = offH;
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, offW, offH);
  octx.scale(tm.a, tm.d); // match the caller's logical coordinate system
  paintText(octx);

  ctx.save();
  if (introStyle === "slide") {
    ctx.globalAlpha = Math.min(1, 0.25 + introP);
    ctx.translate(0, (1 - introP) * 36 * scale);
  } else {
    ctx.globalAlpha = introP;
  }
  if (introStyle === "blur") ctx.filter = `blur(${(1 - introP) * 9 * scale}px)`;
  if (introStyle === "scale") {
    const s = 0.9 + 0.1 * introP;
    ctx.translate(centerX, blockCenterY);
    ctx.scale(s, s);
    ctx.translate(-centerX, -blockCenterY);
  }
  ctx.drawImage(off, 0, 0, w, h);
  ctx.restore();
}

export function drawTransition(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  outgoingText: {
    arabic: string;
    translation: string;
    verseNumber: number;
  } | null,
  incomingText: {
    arabic: string;
    translation: string;
    verseNumber: number;
  },
  progress: number,
  options: DrawVerseOptions,
  scale: number = 1
) {
  if (outgoingText && progress < 1) {
    ctx.globalAlpha = 1 - progress;
    drawVerseText(
      ctx,
      w,
      h,
      outgoingText.arabic,
      outgoingText.verseNumber,
      outgoingText.translation || undefined,
      options,
      scale
    );
  }

  ctx.globalAlpha = outgoingText ? progress : 1;
  drawVerseText(
    ctx,
    w,
    h,
    incomingText.arabic,
    incomingText.verseNumber,
    incomingText.translation || undefined,
    options,
    scale
  );

  ctx.globalAlpha = 1;
}

export type MediaFit = "cover" | "contain";
export type FitBackdrop = "blur" | "black";
export interface MediaTransform {
  scale: number;
  x: number;
  y: number;
}

export const DEFAULT_MEDIA_TRANSFORM: MediaTransform = { scale: 1, x: 0, y: 0 };

export type MediaNudgeDirection = "left" | "right" | "up" | "down";

/** Move media by a predictable viewport-relative keyboard step. Position is
 * intentionally unbounded: creators may push media partly or entirely outside
 * the frame when building split compositions and deliberate crops. */
export function nudgeMediaTransform(
  transform: MediaTransform,
  direction: MediaNudgeDirection,
  coarse = false,
): MediaTransform {
  const step = coarse ? 0.1 : 0.03;
  return {
    ...transform,
    x: direction === "left"
      ? transform.x - step
      : direction === "right"
        ? transform.x + step
        : transform.x,
    y: direction === "up"
      ? transform.y - step
      : direction === "down"
        ? transform.y + step
        : transform.y,
  };
}

/** Human-readable framing feedback shared by Template Studio and Studio. */
export function mediaTransformPositionLabel(transform: MediaTransform): string {
  const horizontal = Math.round(transform.x * 100);
  const vertical = Math.round(transform.y * 100);
  const horizontalLabel = horizontal === 0
    ? "horizontally centered"
    : `${Math.abs(horizontal)}% ${horizontal < 0 ? "left" : "right"}`;
  const verticalLabel = vertical === 0
    ? "vertically centered"
    : `${Math.abs(vertical)}% ${vertical < 0 ? "up" : "down"}`;
  return `${horizontalLabel} · ${verticalLabel} · ${transform.scale.toFixed(2)}× zoom`;
}

/** Draw image/video into w×h. "cover" fills + crops (zoom); "contain" shows the
 *  whole media as-is, centered with rounded corners over a backdrop (a blurred fill
 *  of itself, or solid black) so nothing is stretched or cropped. */
function drawMedia(
  ctx: CanvasRenderingContext2D,
  media: CanvasImageSource,
  mw: number,
  mh: number,
  w: number,
  h: number,
  fit: MediaFit,
  backdrop: FitBackdrop = "blur",
  transform: MediaTransform = DEFAULT_MEDIA_TRANSFORM
) {
  if (mw <= 0 || mh <= 0) return;
  if (fit === "contain") {
    // Backdrop so the frame isn't empty: blurred+darkened cover, or solid black.
    if (backdrop === "black") {
      ctx.save();
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else {
      const cover = Math.max(w / mw, h / mh);
      const bw = mw * cover;
      const bh = mh * cover;
      ctx.save();
      ctx.filter = `blur(${Math.max(8, Math.round(w * 0.05))}px) brightness(0.5)`;
      ctx.drawImage(media, (w - bw) / 2, (h - bh) / 2, bw, bh);
      ctx.restore();
    }
    // Start from a whole-media contain fit, then apply the same creator zoom and
    // viewport-relative positioning contract as cover. At scale=1 and x/y=0
    // this is the original centered result; offsets remain free even when the
    // media has no natural overflow on that axis.
    const contain = Math.min(w / mw, h / mh) * Math.max(0.1, transform.scale);
    const sw = mw * contain;
    const sh = mh * contain;
    const x = (w - sw) / 2 + transform.x * w;
    const y = (h - sh) / 2 + transform.y * h;
    const r = Math.min(sw, sh) * 0.06;
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, sw, sh, r);
    else ctx.rect(x, y, sw, sh);
    ctx.clip();
    ctx.drawImage(media, x, y, sw, sh);
    ctx.restore();
    return;
  }
  const scale = Math.max(w / mw, h / mh) * Math.max(0.1, transform.scale);
  const sw = mw * scale;
  const sh = mh * scale;
  ctx.drawImage(
    media,
    (w - sw) / 2 + transform.x * w,
    (h - sh) / 2 + transform.y * h,
    sw,
    sh,
  );
}

export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  w: number,
  h: number,
  fit: MediaFit = "cover",
  backdrop: FitBackdrop = "blur",
  transform: MediaTransform = DEFAULT_MEDIA_TRANSFORM
) {
  drawMedia(ctx, video, video.videoWidth, video.videoHeight, w, h, fit, backdrop, transform);
}

export function drawBgImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  fit: MediaFit = "cover",
  backdrop: FitBackdrop = "blur",
  transform: MediaTransform = DEFAULT_MEDIA_TRANSFORM
) {
  drawMedia(ctx, img, img.width, img.height, w, h, fit, backdrop, transform);
}

export function drawLetterboxBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  letterbox: LetterboxConfig
) {
  if (letterbox.barStyle === "solid") {
    ctx.fillStyle = letterbox.barColor;
    ctx.fillRect(0, 0, w, h);
  } else if (letterbox.barStyle === "gradient") {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, letterbox.barColor);
    gradient.addColorStop(0.5, "#000000");
    gradient.addColorStop(1, letterbox.barColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
  }
}

export function getLetterboxContentArea(
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } {
  const contentH = w * (9 / 16);
  const contentY = (h - contentH) / 2;
  return { x: 0, y: contentY, w, h: contentH };
}
