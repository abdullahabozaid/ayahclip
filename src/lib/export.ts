import { Verse, VideoFormat, Background } from "@/types";
import { getAudioUrl } from "./api";

const FORMAT_SIZES: Record<VideoFormat, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

interface ExportOptions {
  verses: Verse[];
  reciterFolder: string;
  surahNumber: number;
  videoFormat: VideoFormat;
  arabicFontSize: number;
  translationEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  textColor: string;
  overlayOpacity: number;
  background: Background;
  onProgress: (current: number, total: number) => void;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function exportVideo(options: ExportOptions): Promise<Blob> {
  const size = FORMAT_SIZES[options.videoFormat];
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d")!;

  let bgImage: HTMLImageElement | undefined;
  if (options.background.type === "image") {
    try {
      bgImage = await loadImage(options.background.value);
    } catch {
      // Fall back to solid black
    }
  }

  const stream = canvas.captureStream(30);
  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();

  for (const track of destination.stream.getAudioTracks()) {
    stream.addTrack(track);
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
    videoBitsPerSecond: 5_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  for (let i = 0; i < options.verses.length; i++) {
    const verse = options.verses[i];
    options.onProgress(i + 1, options.verses.length);

    drawFrame(ctx, size.w, size.h, verse, options, bgImage);

    const audioUrl = getAudioUrl(options.reciterFolder, options.surahNumber, verse.verse_number);

    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(destination);
      source.connect(audioCtx.destination);
      source.start();

      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
      });
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  recorder.stop();
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  audioCtx.close();
  return new Blob(chunks, { type: "video/webm" });
}

function parseGradientStops(css: string): { offset: number; color: string }[] {
  const stops: { offset: number; color: string }[] = [];
  const stopRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+)%/g;
  let match;
  while ((match = stopRegex.exec(css)) !== null) {
    stops.push({ color: match[1], offset: parseInt(match[2]) / 100 });
  }
  return stops;
}

const FONT_FAMILIES: Record<string, string> = {
  serif: '"Georgia", serif',
  "sans-serif": '"Arial", sans-serif',
  cinzel: '"Cinzel", serif',
  "times-new-roman": '"Times New Roman", serif',
  lora: '"Lora", serif',
  "playfair-display": '"Playfair Display", serif',
};

function getFontFamily(font: string): string {
  return FONT_FAMILIES[font] ?? '"Georgia", serif';
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  verse: Verse,
  options: ExportOptions,
  bgImage?: HTMLImageElement
) {
  if (bgImage) {
    const scale = Math.max(w / bgImage.width, h / bgImage.height);
    const sw = bgImage.width * scale;
    const sh = bgImage.height * scale;
    ctx.drawImage(bgImage, (w - sw) / 2, (h - sh) / 2, sw, sh);
  } else if (options.background.type === "solid") {
    ctx.fillStyle = options.background.value;
    ctx.fillRect(0, 0, w, h);
  } else if (options.background.type === "gradient") {
    const stops = parseGradientStops(options.background.value);
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

  ctx.fillStyle = `rgba(0, 0, 0, ${options.overlayOpacity / 100})`;
  ctx.fillRect(0, 0, w, h);

  const scale = w / 480;
  const arabicSize = options.arabicFontSize * scale;
  ctx.fillStyle = options.textColor;
  ctx.font = `${arabicSize}px "Scheherazade New", "Amiri", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = w * 0.85;

  const arabicLines = measureLines(ctx, verse.text_uthmani, maxWidth);
  const arabicBlockHeight = arabicLines.length * arabicSize * 1.8;

  let transLines: string[] = [];
  let transSize = 0;
  let transBlockHeight = 0;
  if (options.translationEnabled && verse.translation) {
    transSize = options.translationFontSize * scale;
    const fontFamily = getFontFamily(options.translationFont);
    ctx.font = `${transSize}px ${fontFamily}`;
    transLines = measureLines(ctx, verse.translation, maxWidth);
    transBlockHeight = transLines.length * transSize * 1.6;
  }

  const gap = transLines.length > 0 ? arabicSize * 0.6 : 0;
  const totalHeight = arabicBlockHeight + gap + transBlockHeight;
  const startY = (h - totalHeight) / 2 + arabicBlockHeight / 2;

  ctx.fillStyle = options.textColor;
  ctx.font = `${arabicSize}px "Scheherazade New", "Amiri", serif`;
  wrapText(ctx, verse.text_uthmani, w / 2, startY, maxWidth, arabicSize * 1.8);

  if (transLines.length > 0 && verse.translation) {
    const transY = startY + arabicBlockHeight / 2 + gap + transBlockHeight / 2;
    const fontFamily = getFontFamily(options.translationFont);
    ctx.font = `${transSize}px ${fontFamily}`;
    ctx.fillStyle = options.textColor + "cc";
    wrapText(ctx, verse.translation, w / 2, transY, maxWidth, transSize * 1.6);
  }
}

function measureLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

function wrapText(
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
