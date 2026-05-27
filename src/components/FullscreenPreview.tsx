"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useAppStore } from "@/lib/store";
import { getTranslationLanguage } from "@/lib/translations";
import {
  drawBackground,
  drawBgImage,
  drawVideoFrame,
  drawVerseText,
  drawLetterboxBars,
  getLetterboxContentArea,
  rgbaFromHex,
  safeInsetFor,
  ensureFontsReady,
} from "@/lib/canvas-utils";
import { FrameMode } from "./PlatformChrome";
import { DevicePreview } from "./DevicePreview";
import { importedPlayer } from "@/lib/imported-player";

const FORMAT_SIZES: Record<string, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

interface FullscreenPreviewProps {
  onClose: () => void;
  frameMode?: FrameMode;
  showSafeZones?: boolean;
}

export function FullscreenPreview({
  onClose,
  frameMode = "studio",
  showSafeZones = false,
}: FullscreenPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoAnimRef = useRef<number>(0);
  const store = useAppStore();

  const [vh, setVh] = useState(800);
  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const isImported = store.audioSource.mode === "imported";
  const [playing, setPlaying] = useState(importedPlayer.isPlaying());
  useEffect(() => importedPlayer.subscribe((_t, isP) => setPlaying(isP)), []);

  // Verse entrance animation timing (mirrors the studio preview).
  const verseShownAtRef = useRef(0);
  const [introTick, setIntroTick] = useState(0);
  useEffect(() => {
    verseShownAtRef.current = performance.now();
    if (store.verseIntro === "none") return;
    let raf = 0;
    const animate = () => {
      setIntroTick((t) => t + 1);
      if (performance.now() - verseShownAtRef.current < store.verseIntroMs) {
        raf = requestAnimationFrame(animate);
      }
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [store.currentVerseIndex, store.verseIntro, store.verseIntroMs]);

  const selectedVerses = store.verses.filter((v) =>
    store.selectedVerseNumbers.includes(v.verse_number)
  );
  const currentVerse =
    selectedVerses[store.currentVerseIndex] ?? selectedVerses[0];
  const size = FORMAT_SIZES[store.videoFormat];
  const scale = size.w / 480;

  const goToVerse = (i: number) => {
    const idx = Math.max(0, Math.min(selectedVerses.length - 1, i));
    store.setCurrentVerseIndex(idx);
    const src = store.audioSource;
    if (src.mode === "imported" && src.timings[idx]) importedPlayer.seek(src.url, src.timings[idx].start);
  };

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

    const synced = store.backgroundVideoSync && store.audioSource.mode === "imported";
    const video = document.createElement("video");
    video.src = store.background.value;
    video.muted = true;
    video.loop = !synced && store.videoLoopMode !== "freeze";
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    videoRef.current = video;

    video.addEventListener("loadeddata", () => {
      if (synced) video.currentTime = importedPlayer.currentTime();
      else video.play();
    });

    let unsub: (() => void) | undefined;
    if (synced) {
      unsub = importedPlayer.subscribe((time, playing) => {
        if (video.readyState < 2) return;
        if (Math.abs(video.currentTime - time) > 0.2) {
          try {
            video.currentTime = time;
          } catch {
            /* not seekable yet */
          }
        }
        if (playing && video.paused) video.play().catch(() => {});
        if (!playing && !video.paused) video.pause();
      });
    }

    return () => {
      unsub?.();
      video.pause();
      video.src = "";
      cancelAnimationFrame(videoAnimRef.current);
    };
  }, [store.background.type, store.background.value, store.backgroundVideoSync, store.audioSource.mode, store.videoLoopMode]);

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
      const transDir = getTranslationLanguage(store.translationLanguage).direction as "ltr" | "rtl";

      // Emphasis only on the static full-verse view (not mid-playback segments).
      const segPlaying = store.playbackSegmentArabic != null;
      const verseEmphasis = segPlaying ? undefined : store.emphasis[currentVerse.verse_key];
      // Live word highlight during imported playback overrides manual emphasis.
      const wordHi =
        store.audioSource.mode === "imported" && store.wordHighlight && store.activeWordIndex != null
          ? store.activeWordIndex
          : null;
      const arabicEmphasisArr = wordHi != null ? [wordHi] : verseEmphasis?.arabic;
      const effEmphasisStyle = wordHi != null ? "color" : store.emphasisStyle;
      const effEmphasisColor = wordHi != null ? store.emphasisColor || "#c9a24b" : store.emphasisColor;
      const introProgress =
        store.verseIntro === "none"
          ? 1
          : Math.min(1, (performance.now() - verseShownAtRef.current) / store.verseIntroMs);

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
          drawVideoFrame(ctx, bgVideo, content.w, content.h, store.backgroundFit, store.fitBackdrop);
        } else if (bgImage) {
          drawBgImage(ctx, bgImage, content.w, content.h, store.backgroundFit, store.fitBackdrop);
        } else {
          drawBackground(ctx, content.w, content.h, store.background);
        }

        ctx.fillStyle = rgbaFromHex(store.overlayColor, store.overlayOpacity / 100);
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
            translationDirection: transDir,
            textColor: store.textColor,
            textShadow: store.textShadow,
            lineHeight: store.lineHeight,
            verticalPosition: store.textPosition,
            safeInset: safeInsetFor(store.safeAreaTarget, store.safePadding / 100),
            arabicFontWeight: store.arabicFontWeight,
            arabicVerseNumber: store.arabicVerseNumber,
            translationFontWeight: store.translationFontWeight,
            arabicEmphasis: arabicEmphasisArr,
            translationEmphasis: verseEmphasis?.translation,
            emphasisStyle: effEmphasisStyle,
            emphasisColor: effEmphasisColor,
            introStyle: store.verseIntro,
            introProgress,
          },
          scale
        );

        ctx.restore();
      } else {
        if (bgVideo) {
          drawVideoFrame(ctx, bgVideo, size.w, size.h, store.backgroundFit, store.fitBackdrop);
        } else if (bgImage) {
          drawBgImage(ctx, bgImage, size.w, size.h, store.backgroundFit, store.fitBackdrop);
        } else {
          drawBackground(ctx, size.w, size.h, store.background);
        }

        ctx.fillStyle = rgbaFromHex(store.overlayColor, store.overlayOpacity / 100);
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
            translationDirection: transDir,
            textColor: store.textColor,
            textShadow: store.textShadow,
            lineHeight: store.lineHeight,
            verticalPosition: store.textPosition,
            safeInset: safeInsetFor(store.safeAreaTarget, store.safePadding / 100),
            arabicFontWeight: store.arabicFontWeight,
            arabicVerseNumber: store.arabicVerseNumber,
            translationFontWeight: store.translationFontWeight,
            arabicEmphasis: arabicEmphasisArr,
            translationEmphasis: verseEmphasis?.translation,
            emphasisStyle: effEmphasisStyle,
            emphasisColor: effEmphasisColor,
            introStyle: store.verseIntro,
            introProgress,
          },
          scale
        );
      }
    },
    [currentVerse, store, size, scale, frameMode, introTick]
  );

  // Repaint once the Arabic web font is ready so Quran diacritics aren't drawn
  // with a mis-rendering system fallback.
  useEffect(() => {
    let cancelled = false;
    ensureFontsReady(store.arabicFont, store.translationFont).then(() => {
      if (!cancelled) renderFrame();
    });
    document.fonts?.ready.then(() => {
      if (!cancelled) renderFrame();
    });
    return () => {
      cancelled = true;
    };
  }, [store.arabicFont, store.translationFont, renderFrame]);

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

  const framed = frameMode !== "studio";
  const framedWidth = Math.min(440, Math.round((vh * 0.74 * 9) / 16));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[var(--ink-deep)] px-2 py-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{ height: vh }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="btn-ghost absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex items-center gap-2 rounded-full px-4 py-2 text-sm"
      >
        Close
        <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[var(--muted)] sm:inline">Esc</kbd>
      </button>

      <div
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {framed ? (
          <DevicePreview
            frameMode={frameMode}
            width={framedWidth}
            showSafeZones={showSafeZones}
            safePadding={store.safePadding / 100}
          >
            <canvas ref={canvasRef} className="h-full w-full" />
          </DevicePreview>
        ) : (
          <canvas
            ref={canvasRef}
            className="min-h-0 w-auto rounded-2xl border border-[var(--hairline)] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)]"
            style={{ aspectRatio: `${size.w}/${size.h}`, maxHeight: Math.max(160, vh - 150), maxWidth: "100%" }}
          />
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={() => goToVerse(store.currentVerseIndex - 1)}
            disabled={store.currentVerseIndex === 0}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment transition-colors hover:border-gold disabled:opacity-25"
            aria-label="Previous verse"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {isImported && (
            <button
              onClick={() => {
                const src = store.audioSource;
                if (src.mode === "imported") importedPlayer.toggle(src.url);
              }}
              className="btn-gold flex h-12 w-12 items-center justify-center rounded-full"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-0.5" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          )}

          <span className="font-display text-sm tabular-nums text-[var(--muted)]">
            {store.currentVerseIndex + 1} <span className="text-gold/40">/</span> {selectedVerses.length}
          </span>
          <button
            onClick={() => goToVerse(store.currentVerseIndex + 1)}
            disabled={store.currentVerseIndex === selectedVerses.length - 1}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment transition-colors hover:border-gold disabled:opacity-25"
            aria-label="Next verse"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
