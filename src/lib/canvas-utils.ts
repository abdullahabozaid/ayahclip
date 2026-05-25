import { TextShadow, LetterboxConfig } from "@/types";

export const ARABIC_FONTS: Record<string, string> = {
  uthmanic: '"KFGQPC HAFS Uthmanic Script", serif',
  "noto-naskh": '"Noto Naskh Arabic", serif',
};

export const TRANSLATION_FONTS: Record<string, string> = {
  serif: '"Georgia", serif',
  "sans-serif": '"Arial", sans-serif',
  cinzel: '"Cinzel", serif',
  "times-new-roman": '"Times New Roman", serif',
  lora: '"Lora", serif',
  "playfair-display": '"Playfair Display", serif',
};

export function getArabicFontFamily(font: string): string {
  return ARABIC_FONTS[font] ?? '"KFGQPC HAFS Uthmanic Script", serif';
}

export function getTranslationFontFamily(font: string): string {
  return TRANSLATION_FONTS[font] ?? '"Georgia", serif';
}

export function measureLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const lines = measureLines(ctx, text, maxWidth);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}

export function parseGradientStops(
  css: string
): { offset: number; color: string }[] {
  const stops: { offset: number; color: string }[] = [];
  const stopRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+)%/g;
  let match;
  while ((match = stopRegex.exec(css)) !== null) {
    stops.push({ color: match[1], offset: parseInt(match[2]) / 100 });
  }
  return stops;
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
    const gradient = ctx.createLinearGradient(0, 0, w, h);
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
  translationFontSize: number;
  translationFont: string;
  textColor: string;
  textShadow: TextShadow;
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

  ctx.fillStyle = options.textColor;
  ctx.font = `${arabicSize}px ${arabicFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = w * 0.85;

  const arabicLines = measureLines(ctx, arabicText, maxWidth);
  const arabicBlockHeight = arabicLines.length * arabicSize * 1.8;

  let transLines: string[] = [];
  let transSize = 0;
  let transBlockHeight = 0;
  if (options.translationEnabled && translation) {
    transSize = options.translationFontSize * scale;
    const fontFamily = getTranslationFontFamily(options.translationFont);
    ctx.font = `${transSize}px ${fontFamily}`;
    const translationText = `${verseNumber}. ${translation}`;
    transLines = measureLines(ctx, translationText, maxWidth);
    transBlockHeight = transLines.length * transSize * 1.6;
  }

  const gap = transLines.length > 0 ? arabicSize * 0.6 : 0;
  const totalHeight = arabicBlockHeight + gap + transBlockHeight;
  const startY = (h - totalHeight) / 2 + arabicBlockHeight / 2;

  applyShadow(ctx, options.textShadow, scale);

  ctx.fillStyle = options.textColor;
  ctx.font = `${arabicSize}px ${arabicFamily}`;
  wrapText(ctx, arabicText, w / 2, startY, maxWidth, arabicSize * 1.8);

  if (transLines.length > 0 && translation) {
    const transY = startY + arabicBlockHeight / 2 + gap + transBlockHeight / 2;
    const fontFamily = getTranslationFontFamily(options.translationFont);
    ctx.font = `${transSize}px ${fontFamily}`;
    ctx.fillStyle = options.textColor + "cc";
    const translationText = `${verseNumber}. ${translation}`;
    wrapText(ctx, translationText, w / 2, transY, maxWidth, transSize * 1.6);
  }

  clearShadow(ctx);
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

export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  w: number,
  h: number
) {
  const videoScale = Math.max(w / video.videoWidth, h / video.videoHeight);
  const sw = video.videoWidth * videoScale;
  const sh = video.videoHeight * videoScale;
  ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh);
}

export function drawBgImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number
) {
  const imgScale = Math.max(w / img.width, h / img.height);
  const sw = img.width * imgScale;
  const sh = img.height * imgScale;
  ctx.drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh);
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
