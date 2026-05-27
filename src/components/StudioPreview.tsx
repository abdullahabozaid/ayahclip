"use client";

import { useRef, useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { preloadVerseAudios } from "@/lib/audio";
import { getTranslationLanguage } from "@/lib/translations";
import {
  TextSegment,
  loadVerseSegments,
  findCurrentSegmentIndex,
} from "@/lib/playback-engine";
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

const FORMAT_RATIOS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 640, h: 360 },
  "9:16": { w: 360, h: 640 },
  "1:1": { w: 480, h: 480 },
  "4:5": { w: 400, h: 500 },
};

interface StudioPreviewProps {
  frameMode?: FrameMode;
  showSafeZones?: boolean;
}

export function StudioPreview({ frameMode = "studio", showSafeZones = false }: StudioPreviewProps) {
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
  const [verseSegments, setVerseSegments] = useState<Map<number, TextSegment[]>>(new Map());
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const prevSegmentRef = useRef<number>(-1);
  const animFrameRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Verse entrance animation: reset the timestamp whenever the verse (or intro
  // setting) changes. The fade/blur/slide is drawn by the unified animation loop
  // below — no per-frame React state, so playback stays smooth.
  const verseShownAtRef = useRef(0);
  useEffect(() => {
    verseShownAtRef.current = performance.now();
  }, [store.currentVerseIndex, store.verseIntro, store.verseIntroMs]);

  const reciterFolder = reciters.find((r) => r.id === store.reciterId)?.folder ?? "Alafasy_128kbps";

  useEffect(() => {
    setAudioMap(new Map());
    currentAudioRef.current?.pause();
    stoppedRef.current = true;
    setIsPlaying(false);
  }, [store.reciterId]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (store.background.type !== "video") {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current = null;
      }
      return;
    }

    const synced = store.backgroundVideoSync && store.audioSource.mode === "imported";
    const video = document.createElement("video");
    video.src = store.background.value;
    video.muted = true;
    // Loop unless synced or the user wants the last frame held when it ends.
    video.loop = !synced && store.videoLoopMode !== "freeze";
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    videoRef.current = video;

    video.addEventListener("loadeddata", () => {
      if (synced) video.currentTime = importedPlayer.currentTime();
      else video.play();
    });

    // Lip-sync: follow the recitation player's time, correcting drift, so the
    // background video frames match the audio being recited.
    let unsub: (() => void) | undefined;
    if (synced) {
      unsub = importedPlayer.subscribe((time, playing) => {
        if (video.readyState < 2) return;
        if (Math.abs(video.currentTime - time) > 0.2) {
          try {
            video.currentTime = time;
          } catch {
            /* seek may throw if not seekable yet */
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
    };
  }, [store.background.type, store.background.value, store.backgroundVideoSync, store.audioSource.mode, store.videoLoopMode]);

  // Imported audio plays through the shared player (also used by the timeline and
  // fullscreen) so there is only ever one track and one playhead.
  useEffect(() => {
    return importedPlayer.subscribe((_t, isP) => {
      if (useAppStore.getState().audioSource.mode === "imported") setIsPlaying(isP);
    });
  }, []);
  useEffect(
    () => () => {
      if (useAppStore.getState().audioSource.mode === "imported") importedPlayer.stop();
    },
    []
  );

  const handlePlay = async () => {
    // Imported audio: single shared player drives play/pause + verse index.
    if (store.audioSource.mode === "imported") {
      importedPlayer.toggle(store.audioSource.url);
      return;
    }

    if (isPlaying) {
      stoppedRef.current = true;
      currentAudioRef.current?.pause();
      cancelAnimationFrame(animFrameRef.current);
      useAppStore.getState().setPlaybackSegment(null, null);
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

    const reciter = reciters.find((r) => r.id === store.reciterId);
    if (!reciter) {
      setIsPlaying(false);
      return;
    }

    const lang = getTranslationLanguage(useAppStore.getState().translationLanguage);
    let segMap = verseSegments;
    if (segMap.size === 0) {
      const newMap = new Map<number, TextSegment[]>();
      for (const verse of selectedVerses) {
        const segs = await loadVerseSegments(
          reciter.quranComRecitationId,
          store.surah!.id,
          verse.verse_number,
          lang.resourceId
        );
        if (segs.length > 0) newMap.set(verse.verse_number, segs);
      }
      setVerseSegments(newMap);
      segMap = newMap;
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
      prevSegmentRef.current = -1;

      const segments = segMap.get(verse.verse_number);

      if (segments && segments.length > 0) {
        setActiveSegmentIndex(0);
        useAppStore.getState().setPlaybackSegment(
          segments[0].arabicText,
          segments[0].translationText
        );
      }

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          cancelAnimationFrame(animFrameRef.current);
          resolve();
        };

        audio.play().catch(() => resolve());

        if (segments && segments.length > 1) {
          const animate = () => {
            if (stoppedRef.current) return;
            const timeMs = audio.currentTime * 1000;
            const idx = findCurrentSegmentIndex(segments, timeMs);

            if (idx !== prevSegmentRef.current) {
              prevSegmentRef.current = idx;
              setActiveSegmentIndex(idx);
              useAppStore.getState().setPlaybackSegment(
                segments[idx].arabicText,
                segments[idx].translationText
              );
            }

            animFrameRef.current = requestAnimationFrame(animate);
          };
          animFrameRef.current = requestAnimationFrame(animate);
        }
      });
    }

    useAppStore.getState().setPlaybackSegment(null, null);
    stoppedRef.current = false;
    setIsPlaying(false);
    setVerseSegments(new Map());
  };

  // Mirror local React state into refs so the animation loop can read the latest
  // values without re-subscribing or being part of the render cycle.
  const verseSegmentsRef = useRef(verseSegments);
  verseSegmentsRef.current = verseSegments;
  const activeSegmentIndexRef = useRef(activeSegmentIndex);
  activeSegmentIndexRef.current = activeSegmentIndex;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const bgImageElRef = useRef<HTMLImageElement | null>(null);

  // One canvas paint, reading the latest store + playback state live. Called both
  // for one-shot redraws (settings changes) and every frame by the animation loop.
  const drawRef = useRef<() => void>(() => {});
  drawRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = useAppStore.getState();
    const r = FORMAT_RATIOS[s.videoFormat];
    if (canvas.width !== r.w * 2) canvas.width = r.w * 2;
    if (canvas.height !== r.h * 2) canvas.height = r.h * 2;

    const verses = s.verses.filter((v) => s.selectedVerseNumbers.includes(v.verse_number));
    const cv = verses[s.currentVerseIndex] ?? verses[0];
    if (!cv) return;

    const segments = verseSegmentsRef.current.get(cv.verse_number ?? 0);
    const playing = isPlayingRef.current;
    const useSegments = !!(playing && segments && segments.length > 1);
    const segIdx = activeSegmentIndexRef.current;
    const displayArabic = useSegments
      ? segments![segIdx]?.arabicText ?? cv.text_uthmani
      : cv.text_uthmani;
    const displayTranslation = useSegments
      ? segments![segIdx]?.translationText ?? cv.translation
      : cv.translation;
    const transDir = getTranslationLanguage(s.translationLanguage).direction as "ltr" | "rtl";

    // Word emphasis applies to the static full-verse view (not mid-playback segments).
    const verseEmphasis = s.emphasis[cv.verse_key];
    const manualArabicEmphasis = useSegments ? undefined : verseEmphasis?.arabic;
    const translationEmphasis = useSegments ? undefined : verseEmphasis?.translation;

    // Live word-by-word highlight during imported playback overrides manual emphasis.
    const wordHi =
      s.audioSource.mode === "imported" && playing && s.wordHighlight && s.activeWordIndex != null
        ? s.activeWordIndex
        : null;
    const arabicEmphasis = wordHi != null ? [wordHi] : manualArabicEmphasis;
    const effEmphasisStyle = wordHi != null ? "color" : s.emphasisStyle;
    const effEmphasisColor = wordHi != null ? s.emphasisColor || "#c9a24b" : s.emphasisColor;
    const introProgress =
      s.verseIntro === "none"
        ? 1
        : Math.min(1, (performance.now() - verseShownAtRef.current) / s.verseIntroMs);

    const bgVideo = s.background.type === "video" ? videoRef.current ?? undefined : undefined;
    const bgImage = s.background.type === "image" ? bgImageElRef.current ?? undefined : undefined;

    const textOpts = {
      arabicFont: s.arabicFont,
      arabicFontSize: s.arabicFontSize,
      translationEnabled: s.translationEnabled,
      translationFontSize: s.translationFontSize,
      translationFont: s.translationFont,
      translationDirection: transDir,
      textColor: s.textColor,
      textShadow: s.textShadow,
      lineHeight: s.lineHeight,
      verticalPosition: s.textPosition,
      safeInset: safeInsetFor(s.safeAreaTarget, s.safePadding / 100),
      arabicFontWeight: s.arabicFontWeight,
      arabicVerseNumber: s.arabicVerseNumber,
      translationFontWeight: s.translationFontWeight,
      arabicEmphasis,
      translationEmphasis,
      emphasisStyle: effEmphasisStyle,
      emphasisColor: effEmphasisColor,
      introStyle: s.verseIntro,
      introProgress,
    };

    ctx.save();
    ctx.scale(2, 2);

    const useLetterbox = s.letterbox.enabled && s.videoFormat === "9:16";
    if (useLetterbox) {
      drawLetterboxBars(ctx, r.w, r.h, s.letterbox);
      const content = getLetterboxContentArea(r.w, r.h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(content.x, content.y, content.w, content.h);
      ctx.clip();
      ctx.translate(0, content.y);
      if (bgVideo) drawVideoFrame(ctx, bgVideo, content.w, content.h, s.backgroundFit, s.fitBackdrop);
      else if (bgImage) drawBgImage(ctx, bgImage, content.w, content.h, s.backgroundFit, s.fitBackdrop);
      else drawBackground(ctx, content.w, content.h, s.background);
      ctx.fillStyle = rgbaFromHex(s.overlayColor, s.overlayOpacity / 100);
      ctx.fillRect(0, 0, content.w, content.h);
      drawVerseText(ctx, content.w, content.h, displayArabic, cv.verse_number, displayTranslation, textOpts);
      ctx.restore();
    } else {
      if (bgVideo) drawVideoFrame(ctx, bgVideo, r.w, r.h, s.backgroundFit, s.fitBackdrop);
      else if (bgImage) drawBgImage(ctx, bgImage, r.w, r.h, s.backgroundFit, s.fitBackdrop);
      else drawBackground(ctx, r.w, r.h, s.background);
      ctx.fillStyle = rgbaFromHex(s.overlayColor, s.overlayOpacity / 100);
      ctx.fillRect(0, 0, r.w, r.h);
      drawVerseText(ctx, r.w, r.h, displayArabic, cv.verse_number, displayTranslation, textOpts);
    }

    ctx.restore();
  };

  // Load an image background into a ref so the draw loop can paint it synchronously.
  useEffect(() => {
    if (store.background.type !== "image") {
      bgImageElRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      bgImageElRef.current = img;
      drawRef.current();
    };
    img.onerror = () => {
      bgImageElRef.current = null;
      drawRef.current();
    };
    img.src = store.background.value;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [store.background.type, store.background.value]);

  // Arabic web fonts may not be loaded when we first paint. Drawing Quran text
  // with a system fallback mis-renders diacritics, so repaint once the chosen
  // fonts are ready (and again when all document fonts settle).
  useEffect(() => {
    let cancelled = false;
    ensureFontsReady(store.arabicFont, store.translationFont).then(() => {
      if (!cancelled) drawRef.current();
    });
    document.fonts?.ready.then(() => {
      if (!cancelled) drawRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [store.arabicFont, store.translationFont]);

  // Unified redraw: paints once on any settings/verse change, and runs a single
  // rAF loop while animating (playing, video background, or a verse intro in
  // progress). All per-frame motion — word highlight, intro, video — is drawn
  // here without touching React state.
  useEffect(() => {
    let raf = 0;
    const hasVideoBg = store.background.type === "video";
    const loop = () => {
      drawRef.current();
      const s = useAppStore.getState();
      const introActive =
        s.verseIntro !== "none" && performance.now() - verseShownAtRef.current < s.verseIntroMs;
      if (isPlayingRef.current || hasVideoBg || introActive) {
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [
    store.background,
    store.backgroundFit,
    store.fitBackdrop,
    store.overlayOpacity,
    store.overlayColor,
    store.safeAreaTarget,
    store.safePadding,
    store.lineHeight,
    store.textPosition,
    store.arabicFontWeight,
    store.arabicVerseNumber,
    store.translationFontWeight,
    store.emphasis,
    store.emphasisStyle,
    store.emphasisColor,
    store.wordHighlight,
    store.verseIntro,
    store.verseIntroMs,
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
    isPlaying,
    verseSegments,
    frameMode,
  ]);

  const framed = frameMode !== "studio";
  const displayWidth = framed ? 348 : Math.min(ratio.w, 460);

  return (
    <div className="flex flex-col items-center gap-6">
      <DevicePreview
        frameMode={frameMode}
        width={displayWidth}
        aspect={`${ratio.w} / ${ratio.h}`}
        showSafeZones={showSafeZones}
        safePadding={store.safePadding / 100}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </DevicePreview>

      {selectedVerses.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const i = Math.max(0, store.currentVerseIndex - 1);
              store.setCurrentVerseIndex(i);
              const src = store.audioSource;
              if (src.mode === "imported" && src.timings[i]) importedPlayer.seek(src.url, src.timings[i].start);
            }}
            disabled={store.currentVerseIndex === 0}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment transition-colors hover:border-gold disabled:opacity-25"
            aria-label="Previous verse"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={handlePlay}
            disabled={audioLoading}
            className="btn-gold flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-50"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {audioLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--ink-deep)]/40 border-t-[var(--ink-deep)]" />
            ) : isPlaying ? (
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

          <button
            onClick={() => {
              const i = Math.min(selectedVerses.length - 1, store.currentVerseIndex + 1);
              store.setCurrentVerseIndex(i);
              const src = store.audioSource;
              if (src.mode === "imported" && src.timings[i]) importedPlayer.seek(src.url, src.timings[i].start);
            }}
            disabled={store.currentVerseIndex === selectedVerses.length - 1}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment transition-colors hover:border-gold disabled:opacity-25"
            aria-label="Next verse"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <span className="ml-1 font-display text-sm tabular-nums text-[var(--muted)]">
            {store.currentVerseIndex + 1} <span className="text-gold/40">/</span> {selectedVerses.length}
          </span>
        </div>
      )}
    </div>
  );
}
