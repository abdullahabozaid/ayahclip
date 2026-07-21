"use client";

import { useRef, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useAppStore } from "@/lib/store";
import { getReciterOrDefault } from "@/lib/reciters";
import { preloadVerseAudios, type LoadedVerseAudio } from "@/lib/audio";
import { getTranslationLanguage } from "@/lib/translations";
import {
  TextSegment,
  findCurrentSegmentIndex,
  loadVerseWords,
  buildPartsFromBoundaries,
} from "@/lib/playback-engine";
import {
  ensureFontsReady,
  mediaFrameRect,
  mediaTransformPositionLabel,
  nudgeMediaTransform,
  normalizeMediaFrame,
  splitWords,
} from "@/lib/canvas-utils";
import {
  FORMAT_SIZES,
  drawScene,
  sliceQcfForDisplay,
  type SceneContent,
} from "@/lib/render-core";
import { clipFadeProgress } from "@/lib/clip-fade";
import { FrameMode } from "./PlatformChrome";
import { DevicePreview } from "./DevicePreview";
import { importedPlayer } from "@/lib/imported-player";
import { mapSplitBoundariesToWords, verseTextAt } from "@/lib/audio-import";
import { buildClipRows } from "@/lib/clip-rows";
import { ensureQcfFontsReady } from "@/lib/qcf-font-loader";
import { resolveBackgroundScene } from "@/lib/background-sequence";
import { MediaZoomControl } from "./MediaZoomControl";

// One segment spanning a whole verse — used when a reciter verse has no manual
// word-parts, so playback simply shows the full verse.
function fullVerseSegment(verse: { text_uthmani: string; translation?: string }): TextSegment {
  return {
    arabicText: verse.text_uthmani,
    translationText: verse.translation ?? "",
    startMs: 0,
    endMs: Number.MAX_SAFE_INTEGER,
  };
}

interface StudioPreviewProps {
  frameMode?: FrameMode;
  showSafeZones?: boolean;
}

export function StudioPreview({ frameMode = "studio", showSafeZones = false }: StudioPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRootRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const store = useAppStore();

  const selectedVerses = store.verses.filter((v) =>
    store.selectedVerseNumbers.includes(v.verse_number)
  );
  const importedTimings = store.audioSource.mode === "imported" ? store.audioSource.timings : null;
  // currentVerseIndex is a ROW index — TimelineEditor sets it from the timings
  // array, where a verse can appear twice (duplicateVerse). Rows (one per
  // timing) are therefore authoritative for the current verse, the navigation
  // bounds and the counter. selectedVerses stays only for the reciter-mode
  // playback loop below (keyed by verse number, never duplicated).
  const rows = buildClipRows(store.verses, store.selectedVerseNumbers, importedTimings ?? undefined);
  const currentVerse = rows[store.currentVerseIndex]?.verse ?? rows[0]?.verse;
  const size = FORMAT_SIZES[store.videoFormat];

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioMap, setAudioMap] = useState<Map<number, LoadedVerseAudio>>(new Map());
  const [audioLoading, setAudioLoading] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioWindowRef = useRef<LoadedVerseAudio | null>(null);
  const playbackResolveRef = useRef<(() => void) | null>(null);
  const stoppedRef = useRef(false);
  const [verseSegments, setVerseSegments] = useState<Map<number, TextSegment[]>>(new Map());
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const prevSegmentRef = useRef<number>(-1);
  const animFrameRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sceneImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const sceneVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [canvasTool, setCanvasTool] = useState<"media" | "frame">("media");
  const reframeDragRef = useRef<{
    x: number;
    y: number;
    mediaX: number;
    mediaY: number;
    frameX: number;
    frameY: number;
  } | null>(null);

  const sequenceMediaKey = store.backgroundScenes
    .map((scene) => `${scene.id}:${scene.background.type}:${scene.background.value}`)
    .join("|");

  useEffect(() => {
    if (!store.backgroundSequenceEnabled) {
      sceneImagesRef.current = new Map();
      for (const video of sceneVideosRef.current.values()) {
        video.pause();
        video.src = "";
      }
      sceneVideosRef.current = new Map();
      return;
    }

    const images = new Map<string, HTMLImageElement>();
    const videos = new Map<string, HTMLVideoElement>();
    for (const scene of useAppStore.getState().backgroundScenes) {
      if (scene.background.type === "image") {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => drawRef.current();
        img.src = scene.background.value;
        images.set(scene.id, img);
      } else if (scene.background.type === "video") {
        const video = document.createElement("video");
        video.src = scene.background.value;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.crossOrigin = "anonymous";
        video.addEventListener("loadeddata", () => {
          video.play().catch(() => {});
          drawRef.current();
        });
        videos.set(scene.id, video);
      }
    }
    sceneImagesRef.current = images;
    sceneVideosRef.current = videos;
    return () => {
      for (const video of videos.values()) {
        video.pause();
        video.src = "";
      }
    };
  }, [store.backgroundSequenceEnabled, sequenceMediaKey]);

  // Verse entrance animation: reset the timestamp whenever the verse (or intro
  // setting) changes. The fade/blur/slide is drawn by the unified animation loop
  // below — no per-frame React state, so playback stays smooth.
  const verseShownAtRef = useRef(0);
  useEffect(() => {
    verseShownAtRef.current = performance.now();
  }, [store.currentVerseIndex, store.activePartIndex, store.playbackSegmentArabic, store.verseIntro, store.verseIntroMs]);

  const reciter = getReciterOrDefault(store.reciterId);
  const verseSelectionKey = store.selectedVerseNumbers.join(",");

  useEffect(() => {
    playbackResolveRef.current?.();
    setAudioMap(new Map());
    currentAudioRef.current?.pause();
    currentAudioWindowRef.current = null;
    stoppedRef.current = true;
    setIsPlaying(false);
  }, [store.reciterId, store.surah?.id, verseSelectionKey]);

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
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
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
  // fullscreen) so there is only ever one track and one playhead. We also use
  // its emit on every seek/play frame to drive a preview-tick — this keeps the
  // canvas in sync with the playhead even when the user edits while paused.
  const [, setPreviewTick] = useState(0);
  useEffect(() => {
    return importedPlayer.subscribe((_t, isP) => {
      if (useAppStore.getState().audioSource.mode === "imported") {
        setIsPlaying(isP);
        setPreviewTick((n) => (n + 1) & 0xffff);
      }
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
      playbackResolveRef.current?.();
      cancelAnimationFrame(animFrameRef.current);
      useAppStore.getState().setPlaybackSegment(null, null);
      setIsPlaying(false);
      setVerseSegments(new Map());
      return;
    }

    stoppedRef.current = false;
    setIsPlaying(true);
    let map = audioMap;

    if (map.size === 0) {
      setAudioLoading(true);
      map = await preloadVerseAudios(
        reciter,
        store.surah!.id,
        store.selectedVerseNumbers
      );
      setAudioMap(map);
      setAudioLoading(false);
    }

    const lang = getTranslationLanguage(useAppStore.getState().translationLanguage);
    let segMap = verseSegments;
    if (segMap.size === 0) {
      // Build per-verse parts: where the user has manually split a verse, time
      // the parts to the reciter's real words; otherwise show the whole verse as
      // one part. This matches the verse editor exactly (no split = full verse).
      const partsState = useAppStore.getState().verseParts;
      const newMap = new Map<number, TextSegment[]>();
      for (const verse of selectedVerses) {
        const boundaries = partsState[verse.verse_number];
        if (boundaries && boundaries.length > 0 && reciter.quranComRecitationId != null) {
          try {
            const words = await loadVerseWords(
              reciter.quranComRecitationId,
              store.surah!.id,
              verse.verse_number,
              lang.resourceId
            );
            const segs = buildPartsFromBoundaries(words, boundaries, verse.translation);
            newMap.set(
              verse.verse_number,
              segs.length > 0 ? segs : [fullVerseSegment(verse)]
            );
            continue;
          } catch {
            /* fall through to full verse */
          }
        }
        newMap.set(verse.verse_number, [fullVerseSegment(verse)]);
      }
      setVerseSegments(newMap);
      segMap = newMap;
    }

    const startIndex = useAppStore.getState().currentVerseIndex;
    for (let i = startIndex; i < selectedVerses.length; i++) {
      if (stoppedRef.current) break;

      const verse = selectedVerses[i];
      const loadedAudio = map.get(verse.verse_number);
      if (!loadedAudio) continue;
      const audio = loadedAudio.element;

      useAppStore.getState().setCurrentVerseIndex(i);
      currentAudioRef.current = audio;
      currentAudioWindowRef.current = loadedAudio;
      audio.currentTime = loadedAudio.startSeconds;
      prevSegmentRef.current = -1;

      const segments = segMap.get(verse.verse_number);

      if (segments && segments.length > 0) {
        setActiveSegmentIndex(0);
        useAppStore.getState().setPlaybackSegment(
          segments[0].arabicText,
          segments[0].translationText,
          segments.length === 1
        );
      }

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (playbackResolveRef.current === finish) playbackResolveRef.current = null;
          cancelAnimationFrame(animFrameRef.current);
          resolve();
        };
        playbackResolveRef.current = finish;
        audio.onended = finish;

        audio.play().catch(finish);

        const animate = () => {
          if (stoppedRef.current || settled) return;
          if (
            loadedAudio.endSeconds != null &&
            audio.currentTime >= loadedAudio.endSeconds - 0.01
          ) {
            audio.pause();
            finish();
            return;
          }
          if (segments && segments.length > 1) {
            const timeMs = (audio.currentTime - loadedAudio.startSeconds) * 1000;
            const idx = findCurrentSegmentIndex(segments, timeMs);

            if (idx !== prevSegmentRef.current) {
              prevSegmentRef.current = idx;
              setActiveSegmentIndex(idx);
              useAppStore.getState().setPlaybackSegment(
                segments[idx].arabicText,
                segments[idx].translationText,
                idx === segments.length - 1
              );
            }

          }
          animFrameRef.current = requestAnimationFrame(animate);
        };
        animFrameRef.current = requestAnimationFrame(animate);
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
    const sz = FORMAT_SIZES[s.videoFormat];
    // Same renderer and coordinate space as export (drawScene composes in
    // FORMAT_SIZES coordinates via the transform below), but the backing store
    // matches the on-screen size × devicePixelRatio, capped at the export
    // resolution. Rasterizing at display density is what keeps text crisp: a
    // full 1080-px backing squeezed into a ~292-px box leaves the compositor
    // to minify a huge bitmap in one bilinear pass, which blurs Arabic
    // diacritics and translation text on every screen.
    // Before layout settles clientWidth is 0; fall back to the full export
    // width (the redraw effect keyed on the measured stage repaints once the
    // real box exists, so this only affects the very first frame).
    const cssWidth = canvas.clientWidth || sz.w;
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    const backingW = Math.max(1, Math.min(sz.w, Math.round(cssWidth * dpr)));
    const drawScale = backingW / sz.w;
    const backingH = Math.max(1, Math.round(sz.h * drawScale));
    if (canvas.width !== backingW) canvas.width = backingW;
    if (canvas.height !== backingH) canvas.height = backingH;
    ctx.setTransform(drawScale, 0, 0, drawScale, 0, 0);
    // High-quality resampling for the scaled background photo/video. Text is
    // drawn as vectors in the scaled coordinate space, so it stays crisp
    // regardless; this only sharpens raster media.
    ctx.imageSmoothingQuality = "high";

    // Same row model as export: cv and seg MUST come from one row, or a
    // duplicated verse shows the wrong text against the duplicate's audio.
    const drawRows = buildClipRows(
      s.verses,
      s.selectedVerseNumbers,
      s.audioSource.mode === "imported" ? s.audioSource.timings : undefined
    );
    const drawRow = drawRows[s.currentVerseIndex] ?? drawRows[0];
    const cv = drawRow?.verse;
    if (!cv) return;

    const segments = verseSegmentsRef.current.get(cv.verse_number ?? 0);
    const playing = isPlayingRef.current;
    const useSegments = !!(playing && segments && segments.length > 1);
    const segIdx = activeSegmentIndexRef.current;
    // Imported mode: compute the on-screen text directly from the verse's
    // timing (splits + word-trim) at the current playhead. This is what makes
    // edits *visible* while paused — the player only pushes playbackSegment*
    // during play, so anything we read from the store goes stale the moment the
    // user pauses to edit. Reciter mode keeps the segments-map flow below.
    let displayArabic: string;
    let displayTranslation: string | undefined;
    let isLastPart = true;
    if (s.audioSource.mode === "imported") {
      const seg = drawRow?.timing;
      const t = importedPlayer.currentTime();
      displayArabic = seg ? verseTextAt(seg, cv.text_uthmani, t) : cv.text_uthmani;
      displayTranslation =
        seg && cv.translation ? verseTextAt(seg, cv.translation, t) : cv.translation;
      if (seg?.splits?.length) {
        let partIdx = 0;
        for (const sp of seg.splits) { if (t >= sp) partIdx++; else break; }
        isLastPart = partIdx === seg.splits.length;
      }
    } else if (playing && useSegments) {
      displayArabic = segments![segIdx]?.arabicText ?? cv.text_uthmani;
      displayTranslation = segments![segIdx]?.translationText ?? cv.translation;
      isLastPart = segIdx === segments!.length - 1;
    } else {
      const boundaries = s.verseParts[cv.verse_number] ?? [];
      if (boundaries.length > 0) {
        const words = splitWords(cv.text_uthmani);
        const sorted = [...boundaries].sort((a, b) => a - b);
        const cuts = [0, ...sorted.map((b) => Math.min(b, words.length)), words.length];
        const pi = Math.min(s.activePartIndex, cuts.length - 2);
        const lo = cuts[pi];
        const hi = cuts[pi + 1];
        displayArabic = words.slice(lo, hi).join(" ");
        if (cv.translation) {
          const tWords = cv.translation.split(/\s+/).filter(Boolean);
          const translationCuts = [
            0,
            ...mapSplitBoundariesToWords(tWords, sorted, words.length),
            tWords.length,
          ];
          const tLo = translationCuts[pi];
          const tHi = translationCuts[pi + 1];
          displayTranslation = tWords.slice(tLo, tHi).join(" ");
        } else {
          displayTranslation = cv.translation;
        }
        isLastPart = pi === cuts.length - 2;
      } else {
        displayArabic = cv.text_uthmani;
        displayTranslation = cv.translation;
      }
    }

    // Word emphasis applies to the static full-verse view (not mid-playback segments).
    const verseEmphasis = s.emphasis[cv.verse_key];
    const manualArabicEmphasis = useSegments ? undefined : verseEmphasis?.arabic;
    const translationEmphasis = useSegments ? undefined : verseEmphasis?.translation;

    // Live word-by-word highlight during imported playback overrides manual emphasis.
    const wordHi =
      s.audioSource.mode === "imported" && playing && s.wordHighlight && s.activeWordIndex != null
        ? s.activeWordIndex
        : null;
    const introProgress =
      s.verseIntro === "none"
        ? 1
        : Math.min(1, (performance.now() - verseShownAtRef.current) / s.verseIntroMs);

    // Clip-start fade: the whole frame eases in from black during the first
    // clipFadeMs of playback from the very start (verse 0), driven by the audio
    // playhead so it tracks the recitation. A static/paused preview, or any
    // verse after the first, shows the fully faded-in scene.
    const fadeMs = s.clipFadeMs ?? 0;
    let clipFade = 1;
    if (fadeMs > 0 && playing && s.currentVerseIndex === 0) {
      if (s.audioSource.mode === "imported") {
        const t0 = s.audioSource.timings[0]?.start ?? 0;
        clipFade = clipFadeProgress((importedPlayer.currentTime() - t0) * 1000, fadeMs);
      } else if (currentAudioRef.current && !currentAudioRef.current.paused) {
        const start = currentAudioWindowRef.current?.startSeconds ?? 0;
        clipFade = clipFadeProgress((currentAudioRef.current.currentTime - start) * 1000, fadeMs);
      }
    }
    // Optional audio fade-in, matched to the visual fade. Managed whenever a
    // fade is configured so toggling it off restores full volume.
    if (fadeMs > 0) {
      const vol = s.audioFadeIn && playing && s.currentVerseIndex === 0 ? clipFade : 1;
      if (s.audioSource.mode === "imported") importedPlayer.setVolume(vol);
      else if (currentAudioRef.current) currentAudioRef.current.volume = vol;
    }

    const content: SceneContent = {
      arabicText: displayArabic,
      verseNumber: cv.verse_number,
      translation: displayTranslation ?? undefined,
      isLastPart,
      qcfWords: sliceQcfForDisplay(cv, displayArabic, isLastPart),
      arabicEmphasis: wordHi != null ? [wordHi] : manualArabicEmphasis,
      translationEmphasis,
      emphasisStyleOverride: wordHi != null ? "color" : undefined,
      emphasisColorOverride: wordHi != null ? s.emphasisColor || "#c9a24b" : undefined,
      introProgress,
      clipFadeProgress: clipFade,
    };

    let sceneMedia: Parameters<typeof drawScene>[3] | undefined;
    if (s.backgroundSequenceEnabled && s.backgroundScenes.length > 0) {
      let clipTime = 0;
      if (playing && s.audioSource.mode === "imported") {
        const timings = s.audioSource.timings;
        for (let i = 0; i < s.currentVerseIndex; i++) {
          clipTime += Math.max(0, timings[i].end - timings[i].start);
        }
        const currentTiming = timings[s.currentVerseIndex];
        if (currentTiming) {
          clipTime += Math.max(0, importedPlayer.currentTime() - currentTiming.start);
        }
      } else if (playing) {
        for (let i = 0; i < s.currentVerseIndex; i++) {
          const loaded = audioMap.get(s.selectedVerseNumbers[i]);
          const duration = loaded?.durationSeconds ?? loaded?.element.duration;
          clipTime += Number.isFinite(duration) ? duration! : 5;
        }
        const currentStart = currentAudioWindowRef.current?.startSeconds ?? 0;
        clipTime += Math.max(0, (currentAudioRef.current?.currentTime ?? 0) - currentStart);
      }

      const selectedScene = s.backgroundScenes.find((scene) => scene.id === s.activeBackgroundSceneId);
      const resolved = playing
        ? resolveBackgroundScene(s.backgroundScenes, clipTime)
        : selectedScene
          ? { index: s.backgroundScenes.indexOf(selectedScene), scene: selectedScene, localTime: 0, transitionProgress: 0 }
          : resolveBackgroundScene(s.backgroundScenes, 0);
      if (resolved) {
        const currentVideo = sceneVideosRef.current.get(resolved.scene.id);
        if (playing && currentVideo && Number.isFinite(currentVideo.duration) && currentVideo.duration > 0) {
          const target = resolved.localTime % currentVideo.duration;
          if (Math.abs(currentVideo.currentTime - target) > 0.35) currentVideo.currentTime = target;
        }
        const nextVideo = resolved.next ? sceneVideosRef.current.get(resolved.next.id) : undefined;
        if (playing && nextVideo && Number.isFinite(nextVideo.duration) && nextVideo.duration > 0) {
          const nextLocal = resolved.transitionProgress * resolved.scene.transitionDuration;
          if (Math.abs(nextVideo.currentTime - nextLocal) > 0.35) nextVideo.currentTime = nextLocal;
        }
        sceneMedia = {
          background: resolved.scene.background,
          image: sceneImagesRef.current.get(resolved.scene.id),
          video: currentVideo,
          fit: resolved.scene.fit,
          backdrop: resolved.scene.backdrop,
          transform: resolved.scene.transform,
          nextBackground: resolved.next?.background,
          nextImage: resolved.next ? sceneImagesRef.current.get(resolved.next.id) : undefined,
          nextVideo,
          nextFit: resolved.next?.fit,
          nextBackdrop: resolved.next?.backdrop,
          nextTransform: resolved.next?.transform,
          transitionProgress: resolved.transitionProgress,
        };
      }
    }

    drawScene(
      ctx,
      {
        ...s,
        translationDirection: getTranslationLanguage(s.translationLanguage)
          .direction as "ltr" | "rtl",
      },
      content,
      sceneMedia ?? {
        image: s.background.type === "image" ? bgImageElRef.current ?? undefined : undefined,
        video: s.background.type === "video" ? videoRef.current ?? undefined : undefined,
      }
    );
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
    ensureFontsReady(
      store.arabicFont,
      store.translationFont,
      store.arabicFontWeight,
      store.translationFontWeight,
    ).then(() => {
      if (!cancelled) drawRef.current();
    });
    const allQcf = store.arabicFont === "qcf"
      ? store.verses.flatMap((v) => v.qcfWords ?? [])
      : [];
    if (allQcf.length > 0) {
      ensureQcfFontsReady(allQcf)
        .then(() => {
          if (!cancelled) drawRef.current();
        })
        .catch(() => {
          if (!cancelled) drawRef.current();
        });
    }
    document.fonts?.ready.then(() => {
      if (!cancelled) drawRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [
    store.arabicFont,
    store.arabicFontWeight,
    store.arabicInkThickness,
    store.translationFont,
    store.translationFontWeight,
    store.verses,
  ]);

  // Unified redraw: paints once on any settings/verse change, and runs a single
  // rAF loop while animating (playing, video background, or a verse intro in
  // progress). All per-frame motion — word highlight, intro, video — is drawn
  // here without touching React state.
  useEffect(() => {
    let raf = 0;
    const hasVideoBg = store.background.type === "video" ||
      (store.backgroundSequenceEnabled && store.backgroundScenes.some((scene) => scene.background.type === "video"));
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
    store.backgroundSequenceEnabled,
    store.backgroundScenes,
    store.activeBackgroundSceneId,
    store.backgroundFit,
    store.mediaTransform,
    store.mediaFrame,
    store.fitBackdrop,
    store.overlayOpacity,
    store.overlayColor,
    store.textLayout,
    store.splitMask,
    store.safeAreaTarget,
    store.safePadding,
    store.lineHeight,
    store.textPosition,
    store.arabicFontWeight,
    store.arabicInkThickness,
    store.arabicVerseNumber,
    store.translationVerseNumber,
    store.translationFontWeight,
    store.emphasis,
    store.emphasisStyle,
    store.emphasisColor,
    store.wordHighlight,
    store.highlightEnabled,
    store.highlightColor,
    store.highlightOpacity,
    store.highlightRadius,
    store.highlightPadding,
    store.highlightHeight,
    store.verseIntro,
    store.verseIntroMs,
    store.textColor,
    store.translationColor,
    store.arabicFontSize,
    store.arabicFont,
    store.translationEnabled,
    store.arabicEnabled,
    store.translationFontSize,
    store.translationFont,
    store.textShadow,
    store.textOutline,
    store.letterbox,
    store.videoFormat,
    store.currentVerseIndex,
    store.playbackSegmentArabic,
    store.playbackSegmentTranslation,
    // For imported mode: edits to timings (splits / wordRange / boundaries)
    // must rerun the draw effect so the preview reflects them immediately.
    importedTimings,
    store.verseParts,
    store.activePartIndex,
    currentVerse,
    isPlaying,
    verseSegments,
    frameMode,
  ]);

  const framed = frameMode !== "studio";
  const canReframe = store.background.type === "image" || store.background.type === "video";
  const phoneStage = stageSize.width > 0 && stageSize.width < 768;
  // Portrait clips are the common case; let the preview grow into whatever
  // vertical space the stage offers (governed below by widthFromHeight) instead
  // of pinning it to a small fixed cap that left the canvas marooned in a void.
  // This is display sizing only — the export renderer path is untouched.
  const preferredWidth = phoneStage ? 220 : framed ? 292 : size.w >= size.h ? 640 : 560;
  const chromeWidthRatio = framed ? 1.09 : 1;
  const chromeHeightRatio = framed ? 16 / 9 + 0.09 : size.h / size.w;
  const controlsHeight = (canReframe && framed ? 64 : 0) + (rows.length > 0 ? 64 : 0);
  const widthFromStage = stageSize.width > 0
    ? Math.max(140, (stageSize.width - 32) / chromeWidthRatio)
    : preferredWidth;
  const widthFromHeight = stageSize.height > 0
    ? Math.max(140, (stageSize.height - 32 - controlsHeight) / chromeHeightRatio)
    : preferredWidth;
  const displayWidth = Math.round(Math.min(preferredWidth, widthFromStage, widthFromHeight));
  const frameGuide = mediaFrameRect(size.w, size.h, store.mediaFrame);

  // The bottom editor can consume a large share of a laptop viewport. Measure
  // the real preview stage and shrink the device proportionally so its bottom,
  // platform chrome, and playback controls remain visible at true 100% zoom.
  useEffect(() => {
    const parent = previewRootRef.current?.parentElement;
    if (!parent) return;
    const update = () => setStageSize({ width: parent.clientWidth, height: parent.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  // The backing store follows the on-screen canvas size (see drawRef), so a
  // stage resize while paused must repaint at the new density — the animation
  // loop only covers playback.
  useEffect(() => {
    const frame = requestAnimationFrame(() => drawRef.current());
    return () => cancelAnimationFrame(frame);
  }, [displayWidth, stageSize.width, stageSize.height]);

  const startReframe = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canReframe) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    reframeDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      mediaX: store.mediaTransform.x,
      mediaY: store.mediaTransform.y,
      frameX: store.mediaFrame.x,
      frameY: store.mediaFrame.y,
    };
  };

  const moveReframe = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = reframeDragRef.current;
    if (!start || !canReframe) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (canvasTool === "frame" && store.mediaFrame.shape !== "full") {
      store.setMediaFrame(normalizeMediaFrame({
        ...store.mediaFrame,
        x: start.frameX + (event.clientX - start.x) / rect.width * 100,
        y: start.frameY + (event.clientY - start.y) / rect.height * 100,
      }));
    } else {
      store.setMediaTransform({
        ...store.mediaTransform,
        x: start.mediaX + (event.clientX - start.x) / rect.width,
        y: start.mediaY + (event.clientY - start.y) / rect.height,
      });
    }
  };

  const nudgeReframe = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (!canReframe) return;
    const direction = event.key === "ArrowLeft"
      ? "left"
      : event.key === "ArrowRight"
        ? "right"
        : event.key === "ArrowUp"
          ? "up"
          : event.key === "ArrowDown"
            ? "down"
            : null;
    if (!direction) return;
    event.preventDefault();
    if (canvasTool === "frame" && store.mediaFrame.shape !== "full") {
      const step = event.shiftKey ? 5 : 1;
      store.setMediaFrame(normalizeMediaFrame({
        ...store.mediaFrame,
        x: store.mediaFrame.x + (direction === "left" ? -step : direction === "right" ? step : 0),
        y: store.mediaFrame.y + (direction === "up" ? -step : direction === "down" ? step : 0),
      }));
    } else {
      store.setMediaTransform(nudgeMediaTransform(store.mediaTransform, direction, event.shiftKey));
    }
  };

  return (
    <div ref={previewRootRef} className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2">
      <DevicePreview
        frameMode={frameMode}
        width={displayWidth}
        aspect={`${size.w} / ${size.h}`}
        showSafeZones={showSafeZones}
        safePadding={store.safePadding / 100}
      >
        <canvas
          ref={canvasRef}
          tabIndex={canReframe ? 0 : -1}
          aria-label={canReframe ? `${canvasTool === "media" ? "Media" : "Frame"} preview. Drag to move or use the arrow keys.` : "Clip preview"}
          className={`h-full w-full ${canReframe ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
          onPointerDown={startReframe}
          onPointerMove={moveReframe}
          onPointerUp={() => { reframeDragRef.current = null; }}
          onPointerCancel={() => { reframeDragRef.current = null; }}
          onKeyDown={nudgeReframe}
        />
        {canReframe && canvasTool === "frame" && store.mediaFrame.shape !== "full" && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 border border-gold shadow-[0_0_0_1px_rgba(5,5,7,0.75),0_0_12px_rgba(201,162,75,0.35)]"
            style={{
              left: `${frameGuide.x / size.w * 100}%`,
              top: `${frameGuide.y / size.h * 100}%`,
              width: `${frameGuide.w / size.w * 100}%`,
              height: `${frameGuide.h / size.h * 100}%`,
              borderRadius: store.mediaFrame.shape === "circle"
                ? "50%"
                : `${frameGuide.radius / Math.max(1, Math.min(frameGuide.w, frameGuide.h)) * 100}%`,
            }}
          >
            <span className="absolute left-1 top-1 rounded bg-[var(--ink-deep)]/85 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-gold-soft">Frame</span>
          </div>
        )}
      </DevicePreview>

      {canReframe && framed && (
        <div className="-mt-2 flex max-w-full flex-col items-center gap-2 text-[11px] lg:flex-row lg:gap-3">
          <div className="flex rounded-full border border-[var(--hairline)] bg-[var(--ink-deep)] p-1" aria-label="Canvas drag tool">
            <button
              type="button"
              onClick={() => setCanvasTool("media")}
              className={`min-h-9 rounded-full px-3 transition-colors ${canvasTool === "media" ? "bg-[var(--gold)] text-[var(--ink-deep)]" : "text-[var(--muted)] hover:text-parchment"}`}
            >
              Move media
            </button>
            <button
              type="button"
              onClick={() => setCanvasTool("frame")}
              disabled={store.mediaFrame.shape === "full"}
              className={`min-h-9 rounded-full px-3 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${canvasTool === "frame" ? "bg-[var(--gold)] text-[var(--ink-deep)]" : "text-[var(--muted)] hover:text-parchment"}`}
            >
              Move frame
            </button>
          </div>
          <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
          <span role="status" aria-label="Current media framing" className="text-[var(--muted)]">
            {canvasTool === "frame" && store.mediaFrame.shape !== "full"
              ? `${store.mediaFrame.x.toFixed(0)}% across · ${store.mediaFrame.y.toFixed(0)}% down`
              : mediaTransformPositionLabel(store.mediaTransform)}
          </span>
          <MediaZoomControl
            value={store.mediaTransform.scale}
            onChange={(scale) => store.setMediaTransform({ ...store.mediaTransform, scale })}
          />
          <button
            type="button"
            onClick={() => store.setMediaTransform({ ...store.mediaTransform, x: 0, y: 0 })}
            className="min-h-10 rounded-full border border-[var(--hairline-soft)] px-3 text-parchment transition-colors hover:border-gold"
          >
            Center media
          </button>
          <span className="text-[var(--muted-deep)]">Drag or use arrow keys</span>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const i = Math.max(0, store.currentVerseIndex - 1);
              if (isPlaying && store.audioSource.mode === "reciter") {
                stoppedRef.current = true;
                currentAudioRef.current?.pause();
                cancelAnimationFrame(animFrameRef.current);
                setIsPlaying(false);
                setVerseSegments(new Map());
              }
              store.setPlaybackSegment(null, null);
              store.setCurrentVerseIndex(i);
              const src = store.audioSource;
              if (src.mode === "imported" && src.timings[i]) importedPlayer.seek(src.url, src.timings[i].start);
            }}
            disabled={store.currentVerseIndex === 0}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment transition-colors hover:border-gold disabled:opacity-25 sm:h-9 sm:w-9"
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
              const i = Math.min(rows.length - 1, store.currentVerseIndex + 1);
              if (isPlaying && store.audioSource.mode === "reciter") {
                stoppedRef.current = true;
                currentAudioRef.current?.pause();
                cancelAnimationFrame(animFrameRef.current);
                setIsPlaying(false);
                setVerseSegments(new Map());
              }
              store.setPlaybackSegment(null, null);
              store.setCurrentVerseIndex(i);
              const src = store.audioSource;
              if (src.mode === "imported" && src.timings[i]) importedPlayer.seek(src.url, src.timings[i].start);
            }}
            disabled={store.currentVerseIndex === rows.length - 1}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment transition-colors hover:border-gold disabled:opacity-25 sm:h-9 sm:w-9"
            aria-label="Next verse"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <span className="ml-1 font-display text-sm tabular-nums text-[var(--muted)]">
            {store.currentVerseIndex + 1} <span className="text-gold/40">/</span> {rows.length}
          </span>
        </div>
      )}
    </div>
  );
}
