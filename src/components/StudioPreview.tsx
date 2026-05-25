"use client";

import { useRef, useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { preloadVerseAudios } from "@/lib/audio";

const FORMAT_RATIOS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 640, h: 360 },
  "9:16": { w: 360, h: 640 },
  "1:1": { w: 480, h: 480 },
  "4:5": { w: 400, h: 500 },
};

export function StudioPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useAppStore();

  const selectedVerses = store.verses.filter((v) =>
    store.selectedVerseNumbers.includes(v.verse_number)
  );
  const currentVerse = selectedVerses[store.currentVerseIndex] ?? selectedVerses[0];
  const ratio = FORMAT_RATIOS[store.videoFormat];

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioMap, setAudioMap] = useState<Map<number, HTMLAudioElement>>(new Map());
  const [audioLoading, setAudioLoading] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const stoppedRef = useRef(false);

  const reciterFolder = reciters.find((r) => r.id === store.reciterId)?.folder ?? "Alafasy_128kbps";

  useEffect(() => {
    setAudioMap(new Map());
    currentAudioRef.current?.pause();
    stoppedRef.current = true;
    setIsPlaying(false);
  }, [store.reciterId]);

  const handlePlay = async () => {
    if (isPlaying) {
      stoppedRef.current = true;
      currentAudioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    stoppedRef.current = false;
    setIsPlaying(true);
    let map = audioMap;

    if (map.size === 0) {
      setAudioLoading(true);
      map = await preloadVerseAudios(
        reciterFolder,
        store.surah!.id,
        store.selectedVerseNumbers
      );
      setAudioMap(map);
      setAudioLoading(false);
    }

    const startIndex = useAppStore.getState().currentVerseIndex;
    for (let i = startIndex; i < selectedVerses.length; i++) {
      if (stoppedRef.current) break;

      const verse = selectedVerses[i];
      const audio = map.get(verse.verse_number);
      if (!audio) continue;

      useAppStore.getState().setCurrentVerseIndex(i);
      currentAudioRef.current = audio;
      audio.currentTime = 0;

      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.play().catch(() => resolve());
      });
    }
    stoppedRef.current = false;
    setIsPlaying(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentVerse) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = ratio.w * 2;
    canvas.height = ratio.h * 2;

    const drawContent = (bgImage?: HTMLImageElement) => {
      ctx.save();
      ctx.scale(2, 2);

      if (bgImage) {
        const scale = Math.max(ratio.w / bgImage.width, ratio.h / bgImage.height);
        const sw = bgImage.width * scale;
        const sh = bgImage.height * scale;
        ctx.drawImage(bgImage, (ratio.w - sw) / 2, (ratio.h - sh) / 2, sw, sh);
      } else {
        drawBackground(ctx, ratio.w, ratio.h, store.background);
      }

      ctx.fillStyle = `rgba(0, 0, 0, ${store.overlayOpacity / 100})`;
      ctx.fillRect(0, 0, ratio.w, ratio.h);

      const arabicSize = Math.min(store.arabicFontSize, ratio.w / 10);
      ctx.fillStyle = store.textColor;
      ctx.font = `${arabicSize}px "Scheherazade New", "Amiri", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const maxWidth = ratio.w * 0.85;

      const arabicLines = measureLines(ctx, currentVerse.text_uthmani, maxWidth);
      const arabicBlockHeight = arabicLines.length * arabicSize * 1.8;

      let transLines: string[] = [];
      let transSize = 0;
      let transBlockHeight = 0;
      if (store.translationEnabled && currentVerse.translation) {
        transSize = Math.min(store.translationFontSize, ratio.w / 16);
        const fontFamily = getFontFamily(store.translationFont);
        ctx.font = `${transSize}px ${fontFamily}`;
        transLines = measureLines(ctx, currentVerse.translation, maxWidth);
        transBlockHeight = transLines.length * transSize * 1.6;
      }

      const gap = transLines.length > 0 ? arabicSize * 0.6 : 0;
      const totalHeight = arabicBlockHeight + gap + transBlockHeight;
      const startY = (ratio.h - totalHeight) / 2 + arabicBlockHeight / 2;

      ctx.fillStyle = store.textColor;
      ctx.font = `${arabicSize}px "Scheherazade New", "Amiri", serif`;
      wrapText(ctx, currentVerse.text_uthmani, ratio.w / 2, startY, maxWidth, arabicSize * 1.8);

      if (transLines.length > 0 && currentVerse.translation) {
        const transY = startY + arabicBlockHeight / 2 + gap + transBlockHeight / 2;
        const fontFamily = getFontFamily(store.translationFont);
        ctx.font = `${transSize}px ${fontFamily}`;
        ctx.fillStyle = store.textColor + "cc";
        wrapText(ctx, currentVerse.translation, ratio.w / 2, transY, maxWidth, transSize * 1.6);
      }
      ctx.restore();
    };

    if (store.background.type === "image") {
      const img = new Image();
      img.onload = () => drawContent(img);
      img.onerror = () => drawContent();
      img.src = store.background.value;
    } else {
      drawContent();
    }
  }, [store.background, store.overlayOpacity, store.textColor, store.arabicFontSize, store.translationEnabled, store.translationFontSize, store.translationFont, store.videoFormat, store.currentVerseIndex, currentVerse, ratio]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="overflow-hidden rounded-lg border border-white/10"
        style={{
          width: Math.min(ratio.w, 480),
          aspectRatio: `${ratio.w}/${ratio.h}`,
        }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full"
        />
      </div>
      {selectedVerses.length > 0 && (
        <div className="flex items-center gap-4">
          <button
            onClick={() => store.setCurrentVerseIndex(Math.max(0, store.currentVerseIndex - 1))}
            disabled={store.currentVerseIndex === 0}
            className="rounded-lg border border-white/10 px-3 py-1 text-sm disabled:opacity-30"
            aria-label="Previous verse"
          >
            ←
          </button>
          <button
            onClick={handlePlay}
            disabled={audioLoading}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {audioLoading ? "Loading..." : isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <span className="text-sm text-gray-400">
            {store.currentVerseIndex + 1} / {selectedVerses.length}
          </span>
          <button
            onClick={() => store.setCurrentVerseIndex(Math.min(selectedVerses.length - 1, store.currentVerseIndex + 1))}
            disabled={store.currentVerseIndex === selectedVerses.length - 1}
            className="rounded-lg border border-white/10 px-3 py-1 text-sm disabled:opacity-30"
            aria-label="Next verse"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
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

function drawBackground(
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
  } else if (bg.type === "image") {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
  }
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
