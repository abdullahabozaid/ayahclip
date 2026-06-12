"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useAppStore } from "@/lib/store";
import { getTranslationLanguage } from "@/lib/translations";
import { ensureFontsReady, splitWords } from "@/lib/canvas-utils";
import {
  FORMAT_SIZES,
  drawScene,
  sliceQcfForDisplay,
  type SceneContent,
} from "@/lib/render-core";
import { DeviceFrame } from "./DeviceFrame";
import { DEVICES, DEFAULT_DEVICE, DeviceSpec } from "@/lib/devices";
import { importedPlayer } from "@/lib/imported-player";

type ChromeMode = "none" | "tiktok" | "reels";

interface FullscreenPreviewProps {
  onClose: () => void;
}

export function FullscreenPreview({ onClose }: FullscreenPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoAnimRef = useRef<number>(0);
  const store = useAppStore();

  const [vh, setVh] = useState(800);
  const [vw, setVw] = useState(600);
  useEffect(() => {
    const update = () => {
      setVh(window.innerHeight);
      setVw(window.innerWidth);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const [device, setDevice] = useState<DeviceSpec>(DEFAULT_DEVICE);
  const [chromeMode, setChromeMode] = useState<ChromeMode>("none");
  const [showSafeZones, setShowSafeZones] = useState(false);

  const isImported = store.audioSource.mode === "imported";
  const [playing, setPlaying] = useState(importedPlayer.isPlaying());
  useEffect(() => importedPlayer.subscribe((_t, isP) => setPlaying(isP)), []);

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
  }, [store.currentVerseIndex, store.activePartIndex, store.playbackSegmentArabic, store.verseIntro, store.verseIntroMs]);

  const selectedVerses = store.verses.filter((v) =>
    store.selectedVerseNumbers.includes(v.verse_number),
  );
  const currentVerse =
    selectedVerses[store.currentVerseIndex] ?? selectedVerses[0];
  const size = FORMAT_SIZES[store.videoFormat];

  const isSE = device.cutout === "home-button";
  const screenRatio = device.screenH / device.screenW;
  const bezelOverhead = isSE ? 0.30 : 0.044;
  const totalHeightPerWidth = screenRatio + bezelOverhead;
  const maxDeviceH = vh * 0.94;
  const maxDeviceW = vw * 0.75;
  const deviceWidth = Math.min(maxDeviceW, Math.round(maxDeviceH / totalHeightPerWidth));

  const videoAspect = size.w / size.h;
  const screenAspect = device.screenW / device.screenH;
  const fitByWidth = videoAspect >= screenAspect;

  const goToVerse = (i: number) => {
    const idx = Math.max(0, Math.min(selectedVerses.length - 1, i));
    store.setCurrentVerseIndex(idx);
    const src = store.audioSource;
    if (src.mode === "imported" && src.timings[idx])
      importedPlayer.seek(src.url, src.timings[idx].start);
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

    const synced =
      store.backgroundVideoSync && store.audioSource.mode === "imported";
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
      unsub = importedPlayer.subscribe((time, isP) => {
        if (video.readyState < 2) return;
        if (Math.abs(video.currentTime - time) > 0.2) {
          try {
            video.currentTime = time;
          } catch {
            /* not seekable yet */
          }
        }
        if (isP && video.paused) video.play().catch(() => {});
        if (!isP && !video.paused) video.pause();
      });
    }

    return () => {
      unsub?.();
      video.pause();
      video.src = "";
      cancelAnimationFrame(videoAnimRef.current);
    };
  }, [
    store.background.type,
    store.background.value,
    store.backgroundVideoSync,
    store.audioSource.mode,
    store.videoLoopMode,
  ]);

  const renderFrame = useCallback(
    (bgImage?: HTMLImageElement, bgVideo?: HTMLVideoElement) => {
      const canvas = canvasRef.current;
      if (!canvas || !currentVerse) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = size.w;
      canvas.height = size.h;

      let displayArabic: string;
      let displayTranslation: string | undefined;
      let isLastPart = true;

      if (store.playbackSegmentArabic != null) {
        displayArabic = store.playbackSegmentArabic;
        displayTranslation =
          store.playbackSegmentTranslation ?? currentVerse.translation;
        isLastPart = store.playbackSegmentIsLast;
      } else {
        const boundaries =
          store.verseParts[currentVerse.verse_number] ?? [];
        if (boundaries.length > 0) {
          const words = splitWords(currentVerse.text_uthmani);
          const sorted = [...boundaries].sort((a, b) => a - b);
          const cuts = [
            0,
            ...sorted.map((b) => Math.min(b, words.length)),
            words.length,
          ];
          const pi = Math.min(store.activePartIndex, cuts.length - 2);
          const lo = cuts[pi];
          const hi = cuts[pi + 1];
          displayArabic = words.slice(lo, hi).join(" ");
          if (currentVerse.translation) {
            const tWords = currentVerse.translation
              .split(/\s+/)
              .filter(Boolean);
            const tLo = Math.floor((lo / words.length) * tWords.length);
            const tHi = Math.floor((hi / words.length) * tWords.length);
            displayTranslation = tWords.slice(tLo, tHi).join(" ");
          } else {
            displayTranslation = currentVerse.translation;
          }
          isLastPart = pi === cuts.length - 2;
        } else {
          displayArabic = currentVerse.text_uthmani;
          displayTranslation = currentVerse.translation;
        }
      }

      const segPlaying = store.playbackSegmentArabic != null;
      const verseEmphasis = segPlaying
        ? undefined
        : store.emphasis[currentVerse.verse_key];
      const wordHi =
        store.audioSource.mode === "imported" &&
        store.wordHighlight &&
        store.activeWordIndex != null
          ? store.activeWordIndex
          : null;
      const introProgress =
        store.verseIntro === "none"
          ? 1
          : Math.min(
              1,
              (performance.now() - verseShownAtRef.current) /
                store.verseIntroMs,
            );

      const content: SceneContent = {
        arabicText: displayArabic,
        verseNumber: currentVerse.verse_number,
        translation: displayTranslation ?? undefined,
        isLastPart,
        qcfWords: sliceQcfForDisplay(currentVerse, displayArabic, isLastPart),
        arabicEmphasis: wordHi != null ? [wordHi] : verseEmphasis?.arabic,
        translationEmphasis: verseEmphasis?.translation,
        emphasisStyleOverride: wordHi != null ? "color" : undefined,
        emphasisColorOverride:
          wordHi != null ? store.emphasisColor || "#c9a24b" : undefined,
        introProgress,
      };

      drawScene(
        ctx,
        {
          ...store,
          translationDirection: getTranslationLanguage(store.translationLanguage)
            .direction as "ltr" | "rtl",
        },
        content,
        { image: bgImage, video: bgVideo }
      );
    },
    [currentVerse, store, size, introTick, device.id],
  );

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
          Math.min(selectedVerses.length - 1, store.currentVerseIndex + 1),
        );
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, store, selectedVerses.length]);

  const brands = [
    { key: "apple" as const, label: "Apple" },
    { key: "samsung" as const, label: "Samsung" },
    { key: "google" as const, label: "Google" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      style={{ height: vh }}
      onClick={onClose}
    >
      {/* Device — fills the viewport, centered */}
      <div onClick={(e) => e.stopPropagation()}>
        <DeviceFrame
          device={device}
          width={deviceWidth}
          chromeMode={chromeMode === "none" ? undefined : chromeMode}
          showSafeZones={showSafeZones}
          safePadding={store.safePadding / 100}
        >
          <div className="flex h-full w-full items-center justify-center">
            <canvas
              ref={canvasRef}
              className="block"
              style={
                fitByWidth
                  ? { width: "100%", aspectRatio: `${size.w} / ${size.h}` }
                  : { height: "100%", aspectRatio: `${size.w} / ${size.h}` }
              }
            />
          </div>
        </DeviceFrame>
      </div>

      {/* Overlay: top-left — chrome & safe toggles */}
      <div
        className="pointer-events-auto absolute left-4 top-0 flex items-center gap-1.5 rounded-b-xl bg-black/60 px-3 py-2 backdrop-blur-md"
        style={{ top: "max(0.5rem, env(safe-area-inset-top))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {(["none", "tiktok", "reels"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setChromeMode(m)}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              chromeMode === m
                ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                : "text-white/60 hover:text-white"
            }`}
          >
            {m === "none" ? "Clean" : m === "tiktok" ? "TikTok" : "Reels"}
          </button>
        ))}
        {chromeMode !== "none" && (
          <button
            onClick={() => setShowSafeZones((v) => !v)}
            className={`ml-0.5 flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] transition-colors ${
              showSafeZones
                ? "bg-red-500/30 text-red-300 ring-1 ring-red-400/50"
                : "text-white/50 hover:text-white"
            }`}
          >
            <span className="h-2 w-2 rounded-sm border border-current" />
            Safe
          </button>
        )}
      </div>

      {/* Overlay: top-right — close */}
      <button
        onClick={onClose}
        className="pointer-events-auto absolute right-4 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm text-white/80 backdrop-blur-md transition-colors hover:text-white"
        style={{ top: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        Close
        <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/40 sm:inline">Esc</kbd>
      </button>

      {/* Overlay: left — verse nav (vertical) */}
      <div
        className="pointer-events-auto absolute left-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => goToVerse(store.currentVerseIndex - 1)}
          disabled={store.currentVerseIndex === 0}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/70 backdrop-blur-md transition-colors hover:text-white disabled:opacity-25"
          aria-label="Previous verse"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 15l-6-6-6 6" />
          </svg>
        </button>

        <span className="rounded-full bg-black/60 px-2 py-1 font-display text-[11px] tabular-nums text-white/60 backdrop-blur-md">
          {store.currentVerseIndex + 1}/{selectedVerses.length}
        </span>

        <button
          onClick={() => goToVerse(store.currentVerseIndex + 1)}
          disabled={store.currentVerseIndex === selectedVerses.length - 1}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/70 backdrop-blur-md transition-colors hover:text-white disabled:opacity-25"
          aria-label="Next verse"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {isImported && (
          <button
            onClick={() => {
              const src = store.audioSource;
              if (src.mode === "imported") importedPlayer.toggle(src.url);
            }}
            className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--gold)] text-[var(--ink-deep)]"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-0.5" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Overlay: bottom — device picker */}
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 overflow-x-auto bg-gradient-to-t from-black/80 via-black/60 to-transparent px-4 pb-2 pt-6"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center gap-3">
          {brands.map((brand) => (
            <div key={brand.key} className="flex items-center gap-1">
              <span className="mr-1 text-[9px] font-semibold uppercase tracking-widest text-white/25">
                {brand.label}
              </span>
              {DEVICES.filter((d) => d.brand === brand.key).map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDevice(d)}
                  className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] transition-all ${
                    device.id === d.id
                      ? "bg-[var(--gold)] font-medium text-[var(--ink-deep)] shadow-[0_0_12px_rgba(201,162,75,0.3)]"
                      : "text-white/45 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  {d.name.replace(/^iPhone /, "").replace(/^Galaxy /, "").replace(/^Pixel /, "")}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
