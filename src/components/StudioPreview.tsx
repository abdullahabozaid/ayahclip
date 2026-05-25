"use client";

import { useRef, useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { preloadVerseAudios } from "@/lib/audio";
import {
  drawBackground,
  drawBgImage,
  drawVerseText,
  drawLetterboxBars,
  getLetterboxContentArea,
} from "@/lib/canvas-utils";

const FORMAT_RATIOS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 640, h: 360 },
  "9:16": { w: 360, h: 640 },
  "1:1": { w: 480, h: 480 },
  "4:5": { w: 400, h: 500 },
};

interface StudioPreviewProps {
  onFullscreen?: () => void;
}

export function StudioPreview({ onFullscreen }: StudioPreviewProps) {
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

      const useLetterbox = store.letterbox.enabled && store.videoFormat === "9:16";

      if (useLetterbox) {
        drawLetterboxBars(ctx, ratio.w, ratio.h, store.letterbox);

        const content = getLetterboxContentArea(ratio.w, ratio.h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(content.x, content.y, content.w, content.h);
        ctx.clip();
        ctx.translate(0, content.y);

        if (bgImage) {
          drawBgImage(ctx, bgImage, content.w, content.h);
        } else {
          drawBackground(ctx, content.w, content.h, store.background);
        }

        ctx.fillStyle = `rgba(0, 0, 0, ${store.overlayOpacity / 100})`;
        ctx.fillRect(0, 0, content.w, content.h);

        const letterboxScale = content.h / ratio.h;
        drawVerseText(
          ctx,
          content.w,
          content.h,
          currentVerse.text_uthmani,
          currentVerse.verse_number,
          currentVerse.translation,
          {
            arabicFont: store.arabicFont,
            arabicFontSize: store.arabicFontSize * letterboxScale,
            translationEnabled: store.translationEnabled,
            translationFontSize: store.translationFontSize * letterboxScale,
            translationFont: store.translationFont,
            textColor: store.textColor,
            textShadow: store.textShadow,
          }
        );

        ctx.restore();
      } else {
        if (bgImage) {
          drawBgImage(ctx, bgImage, ratio.w, ratio.h);
        } else {
          drawBackground(ctx, ratio.w, ratio.h, store.background);
        }

        ctx.fillStyle = `rgba(0, 0, 0, ${store.overlayOpacity / 100})`;
        ctx.fillRect(0, 0, ratio.w, ratio.h);

        drawVerseText(
          ctx,
          ratio.w,
          ratio.h,
          currentVerse.text_uthmani,
          currentVerse.verse_number,
          currentVerse.translation,
          {
            arabicFont: store.arabicFont,
            arabicFontSize: store.arabicFontSize,
            translationEnabled: store.translationEnabled,
            translationFontSize: store.translationFontSize,
            translationFont: store.translationFont,
            textColor: store.textColor,
            textShadow: store.textShadow,
          }
        );
      }

      ctx.restore();
    };

    if (store.background.type === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => drawContent(img);
      img.onerror = () => drawContent();
      img.src = store.background.value;
    } else {
      drawContent();
    }
  }, [
    store.background,
    store.overlayOpacity,
    store.textColor,
    store.arabicFontSize,
    store.arabicFont,
    store.translationEnabled,
    store.translationFontSize,
    store.translationFont,
    store.textShadow,
    store.letterbox,
    store.videoFormat,
    store.currentVerseIndex,
    currentVerse,
    ratio,
  ]);

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
            {audioLoading ? "Loading..." : isPlaying ? "Pause" : "Preview"}
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
          {onFullscreen && (
            <button
              onClick={onFullscreen}
              className="rounded-lg border border-white/10 px-3 py-1 text-xs text-gray-400 hover:text-white"
            >
              Full Screen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
