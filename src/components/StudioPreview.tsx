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

  const reciterFolder = reciters.find((r) => r.id === store.reciterId)?.folder ?? "Alafasy_128kbps";

  useEffect(() => {
    setAudioMap(new Map());
    currentAudioRef.current?.pause();
    setIsPlaying(false);
  }, [store.reciterId]);

  const handlePlay = async () => {
    if (isPlaying) {
      currentAudioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

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

    for (let i = store.currentVerseIndex; i < selectedVerses.length; i++) {
      const verse = selectedVerses[i];
      const audio = map.get(verse.verse_number);
      if (!audio) continue;

      store.setCurrentVerseIndex(i);
      currentAudioRef.current = audio;
      audio.currentTime = 0;

      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.play().catch(() => resolve());
      });

      if (!currentAudioRef.current || currentAudioRef.current.paused) {
        break;
      }
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentVerse) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = ratio.w * 2;
    canvas.height = ratio.h * 2;
    ctx.scale(2, 2);

    // Draw background
    if (store.background.type === "solid") {
      ctx.fillStyle = store.background.value;
      ctx.fillRect(0, 0, ratio.w, ratio.h);
    } else if (store.background.type === "gradient") {
      const gradient = ctx.createLinearGradient(0, 0, ratio.w, ratio.h);
      gradient.addColorStop(0, "#1a1a2e");
      gradient.addColorStop(1, "#0a0a0a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, ratio.w, ratio.h);
    } else {
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, ratio.w, ratio.h);
    }

    // Dark overlay
    ctx.fillStyle = `rgba(0, 0, 0, ${store.overlayOpacity / 100})`;
    ctx.fillRect(0, 0, ratio.w, ratio.h);

    // Arabic text
    const arabicSize = Math.min(store.arabicFontSize, ratio.w / 10);
    ctx.fillStyle = store.textColor;
    ctx.font = `${arabicSize}px "Scheherazade New", "Amiri", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const centerY = store.translationEnabled ? ratio.h * 0.4 : ratio.h * 0.5;
    const maxWidth = ratio.w * 0.85;

    wrapText(ctx, currentVerse.text_uthmani, ratio.w / 2, centerY, maxWidth, arabicSize * 1.8);

    // Translation
    if (store.translationEnabled && currentVerse.translation) {
      const transSize = Math.min(store.translationFontSize, ratio.w / 16);
      ctx.font = `${transSize}px ${store.translationFont === "serif" ? '"Georgia", serif' : '"Arial", sans-serif'}`;
      ctx.fillStyle = store.textColor + "cc";
      wrapText(
        ctx,
        currentVerse.translation,
        ratio.w / 2,
        ratio.h * 0.7,
        maxWidth,
        transSize * 1.6
      );
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

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
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

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}
