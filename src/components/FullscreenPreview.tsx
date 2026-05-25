"use client";

import { useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import {
  drawBackground,
  drawBgImage,
  drawVideoFrame,
  drawVerseText,
  drawLetterboxBars,
  getLetterboxContentArea,
} from "@/lib/canvas-utils";

const FORMAT_SIZES: Record<string, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

interface FullscreenPreviewProps {
  onClose: () => void;
}

export function FullscreenPreview({ onClose }: FullscreenPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoAnimRef = useRef<number>(0);
  const store = useAppStore();

  const selectedVerses = store.verses.filter((v) =>
    store.selectedVerseNumbers.includes(v.verse_number)
  );
  const currentVerse =
    selectedVerses[store.currentVerseIndex] ?? selectedVerses[0];
  const size = FORMAT_SIZES[store.videoFormat];
  const scale = size.w / 480;

  useEffect(() => {
    if (store.background.type !== "video") {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current = null;
      }
      cancelAnimationFrame(videoAnimRef.current);
      return;
    }

    const video = document.createElement("video");
    video.src = store.background.value;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    videoRef.current = video;

    video.addEventListener("loadeddata", () => {
      video.play();
    });

    return () => {
      video.pause();
      video.src = "";
      cancelAnimationFrame(videoAnimRef.current);
    };
  }, [store.background.type, store.background.value]);

  const renderFrame = useCallback(
    (bgImage?: HTMLImageElement, bgVideo?: HTMLVideoElement) => {
      const canvas = canvasRef.current;
      if (!canvas || !currentVerse) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = size.w;
      canvas.height = size.h;

      const displayArabic =
        store.playbackSegmentArabic ?? currentVerse.text_uthmani;
      const displayTranslation =
        store.playbackSegmentTranslation ?? currentVerse.translation;

      const useLetterbox =
        store.letterbox.enabled && store.videoFormat === "9:16";

      if (useLetterbox) {
        drawLetterboxBars(ctx, size.w, size.h, store.letterbox);

        const content = getLetterboxContentArea(size.w, size.h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(content.x, content.y, content.w, content.h);
        ctx.clip();
        ctx.translate(0, content.y);

        if (bgVideo) {
          drawVideoFrame(ctx, bgVideo, content.w, content.h);
        } else if (bgImage) {
          drawBgImage(ctx, bgImage, content.w, content.h);
        } else {
          drawBackground(ctx, content.w, content.h, store.background);
        }

        ctx.fillStyle = `rgba(0, 0, 0, ${store.overlayOpacity / 100})`;
        ctx.fillRect(0, 0, content.w, content.h);

        drawVerseText(
          ctx,
          content.w,
          content.h,
          displayArabic,
          currentVerse.verse_number,
          displayTranslation,
          {
            arabicFont: store.arabicFont,
            arabicFontSize: store.arabicFontSize,
            translationEnabled: store.translationEnabled,
            translationFontSize: store.translationFontSize,
            translationFont: store.translationFont,
            textColor: store.textColor,
            textShadow: store.textShadow,
          },
          scale
        );

        ctx.restore();
      } else {
        if (bgVideo) {
          drawVideoFrame(ctx, bgVideo, size.w, size.h);
        } else if (bgImage) {
          drawBgImage(ctx, bgImage, size.w, size.h);
        } else {
          drawBackground(ctx, size.w, size.h, store.background);
        }

        ctx.fillStyle = `rgba(0, 0, 0, ${store.overlayOpacity / 100})`;
        ctx.fillRect(0, 0, size.w, size.h);

        drawVerseText(
          ctx,
          size.w,
          size.h,
          displayArabic,
          currentVerse.verse_number,
          displayTranslation,
          {
            arabicFont: store.arabicFont,
            arabicFontSize: store.arabicFontSize,
            translationEnabled: store.translationEnabled,
            translationFontSize: store.translationFontSize,
            translationFont: store.translationFont,
            textColor: store.textColor,
            textShadow: store.textShadow,
          },
          scale
        );
      }
    },
    [currentVerse, store, size, scale]
  );

  useEffect(() => {
    if (!currentVerse) return;

    if (store.background.type === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => renderFrame(img);
      img.onerror = () => renderFrame();
      img.src = store.background.value;
    } else if (store.background.type === "video" && videoRef.current) {
      const video = videoRef.current;
      const renderLoop = () => {
        renderFrame(undefined, video);
        videoAnimRef.current = requestAnimationFrame(renderLoop);
      };
      videoAnimRef.current = requestAnimationFrame(renderLoop);
      return () => cancelAnimationFrame(videoAnimRef.current);
    } else {
      renderFrame();
    }
  }, [renderFrame]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft")
        store.setCurrentVerseIndex(Math.max(0, store.currentVerseIndex - 1));
      if (e.key === "ArrowRight")
        store.setCurrentVerseIndex(
          Math.min(selectedVerses.length - 1, store.currentVerseIndex + 1)
        );
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, store, selectedVerses.length]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-sm text-gray-400 hover:text-white"
        >
          Close (Esc)
        </button>
        <canvas
          ref={canvasRef}
          className="max-h-[85vh] w-auto rounded-lg"
          style={{ aspectRatio: `${size.w}/${size.h}` }}
        />
        <div className="flex items-center gap-4">
          <button
            onClick={() =>
              store.setCurrentVerseIndex(
                Math.max(0, store.currentVerseIndex - 1)
              )
            }
            disabled={store.currentVerseIndex === 0}
            className="rounded-lg border border-white/10 px-3 py-1 text-sm disabled:opacity-30"
          >
            ←
          </button>
          <span className="text-sm text-gray-400">
            {store.currentVerseIndex + 1} / {selectedVerses.length}
          </span>
          <button
            onClick={() =>
              store.setCurrentVerseIndex(
                Math.min(
                  selectedVerses.length - 1,
                  store.currentVerseIndex + 1
                )
              )
            }
            disabled={store.currentVerseIndex === selectedVerses.length - 1}
            className="rounded-lg border border-white/10 px-3 py-1 text-sm disabled:opacity-30"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
