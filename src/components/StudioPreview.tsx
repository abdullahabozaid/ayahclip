"use client";

import { useRef, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { preloadVerseAudios } from "@/lib/audio";
import { getTranslationLanguage } from "@/lib/translations";
import {
  TextSegment,
  findCurrentSegmentIndex,
  loadVerseWords,
  buildPartsFromBoundaries,
} from "@/lib/playback-engine";
import { ensureFontsReady, splitWords } from "@/lib/canvas-utils";
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
import { verseTextAt, snapToSentenceBoundary } from "@/lib/audio-import";
import { buildClipRows } from "@/lib/clip-rows";
import { ensureQcfFontsReady } from "@/lib/qcf-font-loader";
import { resolveBackgroundScene } from "@/lib/background-sequence";

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
  const [audioMap, setAudioMap] = useState<Map<number, HTMLAudioElement>>(new Map());
  const [audioLoading, setAudioLoading] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const stoppedRef = useRef(false);
  const [verseSegments, setVerseSegments] = useState<Map<number, TextSegment[]>>(new Map());
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const prevSegmentRef = useRef<number>(-1);
  const animFrameRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sceneImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const sceneVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const reframeDragRef = useRef<{ x: number; y: number; mediaX: number; mediaY: number } | null>(null);

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
      // Build per-verse parts: where the user has manually split a verse, time
      // the parts to the reciter's real words; otherwise show the whole verse as
      // one part. This matches the verse editor exactly (no split = full verse).
      const partsState = useAppStore.getState().verseParts;
      const newMap = new Map<number, TextSegment[]>();
      for (const verse of selectedVerses) {
        const boundaries = partsState[verse.verse_number];
        if (boundaries && boundaries.length > 0) {
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
          segments[0].translationText,
          segments.length === 1
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
                segments[idx].translationText,
                idx === segments.length - 1
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
    const sz = FORMAT_SIZES[s.videoFormat];
    // The preview canvas IS the export frame: same resolution, same renderer.
    if (canvas.width !== sz.w) canvas.width = sz.w;
    if (canvas.height !== sz.h) canvas.height = sz.h;

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
          const tLo = snapToSentenceBoundary(tWords, Math.floor((lo / words.length) * tWords.length));
          const tHi = snapToSentenceBoundary(tWords, Math.floor((hi / words.length) * tWords.length));
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
        clipFade = clipFadeProgress(currentAudioRef.current.currentTime * 1000, fadeMs);
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
          const audio = audioMap.get(s.selectedVerseNumbers[i]);
          clipTime += Number.isFinite(audio?.duration) ? audio!.duration : 5;
        }
        clipTime += currentAudioRef.current?.currentTime ?? 0;
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
    ensureFontsReady(store.arabicFont, store.translationFont).then(() => {
      if (!cancelled) drawRef.current();
    });
    const allQcf = store.verses.flatMap((v) => v.qcfWords ?? []);
    if (allQcf.length > 0) {
      ensureQcfFontsReady(allQcf).then(() => {
        if (!cancelled) drawRef.current();
      });
    }
    document.fonts?.ready.then(() => {
      if (!cancelled) drawRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [store.arabicFont, store.translationFont, store.verses]);

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
    store.arabicFontSize,
    store.arabicFont,
    store.translationEnabled,
    store.arabicEnabled,
    store.translationFontSize,
    store.translationFont,
    store.textShadow,
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
  const displayWidth = framed ? 348 : size.w >= size.h ? 460 : 360;
  const canReframe = store.backgroundFit === "cover" &&
    (store.background.type === "image" || store.background.type === "video");

  const startReframe = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canReframe) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    reframeDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      mediaX: store.mediaTransform.x,
      mediaY: store.mediaTransform.y,
    };
  };

  const moveReframe = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = reframeDragRef.current;
    if (!start || !canReframe) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    store.setMediaTransform({
      ...store.mediaTransform,
      x: clamp(start.mediaX + ((event.clientX - start.x) / rect.width) * 2),
      y: clamp(start.mediaY + ((event.clientY - start.y) / rect.height) * 2),
    });
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <DevicePreview
        frameMode={frameMode}
        width={displayWidth}
        aspect={`${size.w} / ${size.h}`}
        showSafeZones={showSafeZones}
        safePadding={store.safePadding / 100}
      >
        <canvas
          ref={canvasRef}
          className={`h-full w-full ${canReframe ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
          onPointerDown={startReframe}
          onPointerMove={moveReframe}
          onPointerUp={() => { reframeDragRef.current = null; }}
          onPointerCancel={() => { reframeDragRef.current = null; }}
        />
      </DevicePreview>

      {canReframe && (
        <p className="-mt-4 text-[11px] text-[var(--muted)]">
          Drag the preview to reframe · use Style → Background to zoom
        </p>
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
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment transition-colors hover:border-gold disabled:opacity-25"
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
