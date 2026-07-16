import { Verse, VideoFormat, Background, TextShadow, LetterboxConfig, SplitMaskConfig } from "@/types";
import type { VerseEmphasis } from "./store";
import { getAudioUrl } from "./api";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { ensureFontsReady, SafeAreaTarget } from "./canvas-utils";
import {
  FORMAT_SIZES,
  drawScene,
  sliceQcfForDisplay,
  type SceneContent,
  type SceneMedia,
} from "./render-core";
import { clipFadeProgress, applyAudioFadeIn } from "./clip-fade";
import { effectiveAudioBounds, verseTextAt, type VerseTiming } from "./audio-import";
import { verseWordCount, type ClipRow } from "./clip-rows";
import { ensureQcfFontsReady } from "./qcf-font-loader";
import { resolveBackgroundScene, type BackgroundScene } from "./background-sequence";
import {
  loadVerseWords,
  buildPartsFromBoundaries,
  findCurrentSegmentIndex,
  type TextSegment,
} from "./playback-engine";

interface ExportOptions {
  verses: Verse[];
  /**
   * The authoritative row list. One entry per timing in imported mode (so a
   * duplicated verse appears twice), one per selected verse in reciter mode.
   * `verses` is retained for the reciter audio path and styling lookups.
   */
  rows: ClipRow[];
  reciterFolder: string;
  surahNumber: number;
  videoFormat: VideoFormat;
  arabicFontSize: number;
  arabicFont: string;
  arabicFontWeight: number;
  arabicVerseNumber: boolean;
  translationVerseNumber: boolean;
  translationEnabled: boolean;
  arabicEnabled?: boolean;
  translationFontSize: number;
  translationFont: string;
  translationFontWeight: number;
  translationDirection?: "ltr" | "rtl";
  textColor: string;
  lineHeight: number;
  translationLineHeight: number;
  arabicTranslationGap: number;
  textPosition: number;
  textLayout?: "center" | "left-panel";
  splitMask?: SplitMaskConfig;
  overlayOpacity: number;
  overlayColor: string;
  safeAreaTarget: SafeAreaTarget;
  safePadding: number;
  background: Background;
  backgroundFit?: import("./canvas-utils").MediaFit;
  mediaTransform?: import("./canvas-utils").MediaTransform;
  backgroundSequenceEnabled?: boolean;
  backgroundScenes?: BackgroundScene[];
  fitBackdrop?: import("./canvas-utils").FitBackdrop;
  /** Sync the background video's time to each verse's audio slice (lip-sync). */
  backgroundVideoSync?: boolean;
  /** When the bg video ends: loop it, or hold the last frame. */
  videoLoopMode?: "loop" | "freeze";
  verseIntro?: import("./canvas-utils").VerseIntro;
  verseIntroMs?: number;
  /** Clip-start fade: fade the whole frame in from black over this many ms at
   *  the very start of the clip (0 = off). Distinct from the per-verse intro. */
  clipFadeMs?: number;
  /** Ramp the audio in over the same clip-start window. */
  audioFadeIn?: boolean;
  textShadow: TextShadow;
  letterbox: LetterboxConfig;
  emphasis: Record<string, VerseEmphasis>;
  emphasisStyle: "color" | "underline";
  emphasisColor: string;
  /** Continuous rounded bar behind each Arabic line. */
  highlightEnabled?: boolean;
  highlightColor?: string;
  highlightOpacity?: number;
  highlightRadius?: number;
  highlightPadding?: number;
  highlightHeight?: number;
  /** When set, use this single uploaded track (sliced per verse) instead of EveryAyah. */
  importedAudio?: { url: string; timings: VerseTiming[] };
  /** Reciter (library) clips: manual word-part boundaries per verse + the data
   *  needed to time them to the reciter's real words. */
  verseParts?: Record<number, number[]>;
  recitationId?: number;
  translationResourceId?: number;
  onProgress: (current: number, total: number) => void;
}

// For reciter clips with manual word-parts, build per-verse TextSegment[] timed
// to the reciter's real words. Only verses the user actually split get an entry.
async function buildReciterSegments(
  options: ExportOptions
): Promise<Map<number, TextSegment[]>> {
  const map = new Map<number, TextSegment[]>();
  if (options.importedAudio || !options.verseParts || options.recitationId == null) {
    return map;
  }
  for (const verse of options.verses) {
    const b = options.verseParts[verse.verse_number];
    if (!b || b.length === 0) continue;
    try {
      const words = await loadVerseWords(
        options.recitationId,
        options.surahNumber,
        verse.verse_number,
        options.translationResourceId ?? 20
      );
      const segs = buildPartsFromBoundaries(words, b, verse.translation);
      if (segs.length > 1) map.set(verse.verse_number, segs);
    } catch {
      /* leave unsplit on failure */
    }
  }
  return map;
}

// Pick the on-screen text for a reciter verse at `elapsedSec` into its audio,
// honoring manual word-parts. No parts → the whole verse.
function reciterTextAt(
  verse: Verse,
  segs: TextSegment[] | undefined,
  elapsedSec: number
): { ar: string; tr: string | null | undefined; isLast: boolean } {
  if (!segs || segs.length === 0) {
    return { ar: verse.text_uthmani, tr: verse.translation, isLast: true };
  }
  const idx = findCurrentSegmentIndex(segs, elapsedSec * 1000);
  return { ar: segs[idx].arabicText, tr: segs[idx].translationText, isLast: idx === segs.length - 1 };
}

// Pick the slice of a verse's text + translation to show at `sourceTime` based
// on its intra-verse splits and word trim. No splits and no wordRange → the
// full verse text passes through.
//
// verseTextAt honours BOTH splits and wordRange, so it must be called whenever
// either is set. Short-circuiting on `splits` alone made a word-trimmed verse
// export its full text while the preview showed the trim.
function segmentFor(
  verse: Verse,
  tm: VerseTiming | undefined,
  sourceTime: number
): { ar: string; tr: string | null | undefined; isLast: boolean } {
  if (!tm || (!tm.splits?.length && !tm.wordRange)) {
    return { ar: verse.text_uthmani, tr: verse.translation, isLast: true };
  }
  let segIdx = 0;
  for (const sp of tm.splits ?? []) { if (sourceTime >= sp) segIdx++; else break; }
  const isLast = segIdx === (tm.splits?.length ?? 0);
  return {
    ar: verseTextAt(tm, verse.text_uthmani, sourceTime),
    tr:
      verse.translation != null
        ? verseTextAt(tm, verse.translation, sourceTime)
        : verse.translation,
    isLast,
  };
}

/** Test-only export. Not part of the public API. */
export const __test__segmentFor = segmentFor;

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

interface LoadedBackgroundSequence {
  images: Map<string, HTMLImageElement>;
  videos: Map<string, HTMLVideoElement>;
}

async function loadBackgroundSequence(
  scenes: BackgroundScene[],
  playVideos = false
): Promise<LoadedBackgroundSequence> {
  const images = new Map<string, HTMLImageElement>();
  const videos = new Map<string, HTMLVideoElement>();
  await Promise.all(scenes.map(async (scene) => {
    if (scene.background.type === "image") {
      try {
        images.set(scene.id, await loadImage(scene.background.value));
      } catch {
        /* renderer falls back to the scene's base background */
      }
    } else if (scene.background.type === "video") {
      const video = document.createElement("video");
      video.src = scene.background.value;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      await new Promise<void>((resolve) => {
        video.addEventListener("loadeddata", () => resolve(), { once: true });
        video.addEventListener("error", () => resolve(), { once: true });
      });
      if (video.readyState >= 2) {
        videos.set(scene.id, video);
        if (playVideos) video.play().catch(() => {});
      }
    }
  }));
  return { images, videos };
}

function sequenceMediaAt(
  scenes: BackgroundScene[],
  time: number,
  loaded: LoadedBackgroundSequence,
  syncPlayingVideos = false
): SceneMedia | undefined {
  const resolved = resolveBackgroundScene(scenes, time);
  if (!resolved) return undefined;
  const video = loaded.videos.get(resolved.scene.id);
  if (syncPlayingVideos && video && Number.isFinite(video.duration) && video.duration > 0) {
    const target = resolved.localTime % video.duration;
    if (Math.abs(video.currentTime - target) > 0.4) video.currentTime = target;
  }
  const nextVideo = resolved.next ? loaded.videos.get(resolved.next.id) : undefined;
  if (syncPlayingVideos && nextVideo && Number.isFinite(nextVideo.duration) && nextVideo.duration > 0) {
    const target = (resolved.transitionProgress * resolved.scene.transitionDuration) % nextVideo.duration;
    if (Math.abs(nextVideo.currentTime - target) > 0.4) nextVideo.currentTime = target;
  }
  return {
    background: resolved.scene.background,
    image: loaded.images.get(resolved.scene.id),
    video,
    fit: resolved.scene.fit,
    backdrop: resolved.scene.backdrop,
    transform: resolved.scene.transform,
    nextBackground: resolved.next?.background,
    nextImage: resolved.next ? loaded.images.get(resolved.next.id) : undefined,
    nextVideo,
    nextFit: resolved.next?.fit,
    nextBackdrop: resolved.next?.backdrop,
    nextTransform: resolved.next?.transform,
    transitionProgress: resolved.transitionProgress,
  };
}

async function seekSequenceMedia(
  media: SceneMedia | undefined,
  time: number,
  nextTime = 0
): Promise<void> {
  if (!media) return;
  if (media.video && Number.isFinite(media.video.duration) && media.video.duration > 0) {
    await seekVideoFrame(media.video, time % media.video.duration);
  }
  if (media.nextVideo && Number.isFinite(media.nextVideo.duration) && media.nextVideo.duration > 0) {
    await seekVideoFrame(media.nextVideo, nextTime % media.nextVideo.duration);
  }
}

/**
 * Export router: use the fast WebCodecs encoder when it's supported. Video
 * backgrounds are handled by seeking the bg video to each output frame's time
 * (faster-than-real-time). Any failure falls back to the real-time MediaRecorder
 * path, so export always works.
 */
export interface ExportResult {
  blob: Blob;
  /** Set when the fast encoder couldn't be used — explains the slow path. */
  fallbackReason?: string;
}

export async function exportVideo(options: ExportOptions): Promise<Blob> {
  return (await exportVideoWithInfo(options)).blob;
}

export async function exportVideoWithInfo(options: ExportOptions): Promise<ExportResult> {
  // Guarantee the Arabic web font is loaded before any frame is drawn — a system
  // fallback would corrupt the Quranic text in the exported file.
  await ensureFontsReady(options.arabicFont, options.translationFont);
  const allQcf = options.verses.flatMap((v) => v.qcfWords ?? []);
  if (allQcf.length > 0) await ensureQcfFontsReady(allQcf);

  const webCodecs =
    typeof VideoEncoder !== "undefined" &&
    typeof AudioEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof AudioData !== "undefined";
  let fallbackReason: string | undefined;
  if (webCodecs) {
    try {
      return { blob: await exportVideoFast(options) };
    } catch (e) {
      fallbackReason = e instanceof Error ? e.message : String(e);
      console.warn("Fast export failed; falling back to real-time recorder.", e);
    }
  } else {
    fallbackReason = "This browser lacks WebCodecs (fast encoding) — using the real-time recorder.";
  }
  return { blob: await exportRealtime(options), fallbackReason };
}

/** Seek a video to a time and resolve once the frame is ready. A short timeout
 *  guards against a 'seeked' event that never fires (so export can't hang). */
function seekVideoFrame(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.max(0, time);
    if (Math.abs(video.currentTime - target) < 1e-3 && video.readyState >= 2) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", finish);
      resolve();
    };
    video.addEventListener("seeked", finish);
    try {
      video.currentTime = target;
    } catch {
      finish();
    }
    setTimeout(finish, 200);
  });
}

async function exportRealtime(options: ExportOptions): Promise<Blob> {
  const size = FORMAT_SIZES[options.videoFormat];
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d")!;

  let bgImage: HTMLImageElement | undefined;
  if (!options.backgroundSequenceEnabled && options.background.type === "image") {
    try {
      bgImage = await loadImage(options.background.value);
    } catch {
      // Fall back to solid black
    }
  }

  let bgVideo: HTMLVideoElement | undefined;
  if (!options.backgroundSequenceEnabled && options.background.type === "video") {
    bgVideo = document.createElement("video");
    bgVideo.src = options.background.value;
    bgVideo.muted = true;
    // Synced video is positioned per verse; "freeze" holds the last frame at the end.
    bgVideo.loop = !options.backgroundVideoSync && options.videoLoopMode !== "freeze";
    bgVideo.playsInline = true;
    bgVideo.crossOrigin = "anonymous";
    await new Promise<void>((resolve) => {
      bgVideo!.addEventListener("loadeddata", () => {
        bgVideo!.play();
        resolve();
      });
      bgVideo!.addEventListener("error", () => resolve());
    });
  }

  const sequenceScenes = options.backgroundSequenceEnabled ? options.backgroundScenes ?? [] : [];
  const sequenceLoaded = sequenceScenes.length > 0
    ? await loadBackgroundSequence(sequenceScenes, true)
    : undefined;

  const stream = canvas.captureStream(30);
  const audioCtx = new AudioContext();
  try {
  // iOS starts the AudioContext suspended; without resuming, the recorded track
  // is silent. Safe to call everywhere.
  if (audioCtx.state === "suspended") {
    await audioCtx.resume().catch(() => {});
  }
  const destination = audioCtx.createMediaStreamDestination();

  for (const track of destination.stream.getAudioTracks()) {
    stream.addTrack(track);
  }

  // Optional clip-start audio fade: route every verse source through one gain
  // node, ramped 0→1 once when the first verse's audio actually begins (so the
  // ramp aligns with playback even if the first fetch was slow).
  const audioFadeOn = !!options.audioFadeIn && (options.clipFadeMs ?? 0) > 0;
  const master = audioCtx.createGain();
  master.connect(destination);
  master.connect(audioCtx.destination);
  let audioRampScheduled = false;
  const scheduleAudioRamp = () => {
    if (!audioFadeOn || audioRampScheduled) return;
    audioRampScheduled = true;
    const t0 = audioCtx.currentTime;
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(1, t0 + options.clipFadeMs! / 1000);
  };

  // Prefer MP4 (H.264 + AAC) so clips upload cleanly to TikTok/Instagram/YouTube;
  // fall back to WebM only if the browser can't record MP4.
  const MIME_PREFERENCE = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mimeType =
    MIME_PREFERENCE.find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  const scale = size.w / 480;

  // For imported audio, decode the single track once and slice it per verse.
  let importedBuffer: AudioBuffer | undefined;
  if (options.importedAudio) {
    try {
      const resp = await fetch(options.importedAudio.url);
      importedBuffer = await audioCtx.decodeAudioData(await resp.arrayBuffer());
    } catch {
      importedBuffer = undefined;
    }
  }

  const hasIntro = !!options.verseIntro && options.verseIntro !== "none";
  const introMs = options.verseIntroMs ?? 450;
  const introAt = (verseStart: number) =>
    hasIntro ? Math.min(1, (performance.now() - verseStart) / introMs) : 1;

  // Reciter clips: per-verse word-parts timed to the reciter (empty for uploads).
  const reciterSegs = await buildReciterSegments(options);

  // Clip-start fade anchor: the clip begins as the loop starts drawing verse 0.
  const clipFadeMs = options.clipFadeMs ?? 0;
  const clipStartMs = performance.now();
  const clipFadeAt = () => clipFadeProgress(performance.now() - clipStartMs, clipFadeMs);

  for (let i = 0; i < options.rows.length; i++) {
    const { verse, timing: tm } = options.rows[i];
    options.onProgress(i + 1, options.rows.length);

    // The row's own timing — NOT a lookup by verse number, which cannot
    // distinguish a duplicated verse's two rows. Drives audio slicing AND the
    // intra-verse segment that picks on-screen text.
    //
    // Text tracks the same playhead the audio plays from. A front word-trim
    // (wordRange.from > 0) moves the audio start to effectiveAudioBounds().lo,
    // and the preview (imported-player) times its split segments off the true
    // playhead too — so the split-segment time must use lo, not tm.start, or
    // splits transition at the wrong moment vs the preview. lo === tm.start when
    // there is no front trim, so this is a no-op for the common case.
    const sourceStart = tm
      ? effectiveAudioBounds(tm, verseWordCount(verse.text_uthmani))[0]
      : 0;
    const vSegs = reciterSegs.get(verse.verse_number);

    let segStart = performance.now();
    let prevSegAr = "";
    const seg0 = vSegs
      ? reciterTextAt(verse, vSegs, 0)
      : segmentFor(verse, tm, sourceStart);
    prevSegAr = seg0.ar;
    drawFrame(
      ctx, size.w, size.h, verse, options, scale, bgImage, bgVideo,
      introAt(segStart), seg0.ar, seg0.tr, seg0.isLast, clipFadeAt(),
      sequenceLoaded ? sequenceMediaAt(sequenceScenes, (performance.now() - clipStartMs) / 1000, sequenceLoaded, true) : undefined
    );

    try {
      const source = audioCtx.createBufferSource();
      // The clip-start fade animates during the first verse, so keep drawing
      // frames through verse 0 even when nothing else would require it.
      let renderWhilePlaying =
        !!bgVideo || hasIntro || !!tm?.splits?.length || !!vSegs || (clipFadeMs > 0 && i === 0);

      if (importedBuffer && options.importedAudio) {
        // Word-trimmed verses must play only their kept span — the same span
        // imported-player.ts uses for preview. Slicing start..end here is what
        // made the export re-include trimmed words.
        const [lo, hi] = tm
          ? effectiveAudioBounds(tm, verseWordCount(verse.text_uthmani))
          : [0, importedBuffer.duration];
        const start = lo;
        const dur = Math.max(0.05, hi - lo);
        source.buffer = importedBuffer;
        source.connect(master);
        source.start(0, start, dur);
        scheduleAudioRamp();
        if (bgVideo && options.backgroundVideoSync) {
          try {
            bgVideo.currentTime = start;
          } catch {
            /* not seekable */
          }
          bgVideo.play().catch(() => {});
        }
        renderWhilePlaying = true;
      } else {
        const audioUrl = getAudioUrl(options.reciterFolder, options.surahNumber, verse.verse_number);
        const response = await fetch(audioUrl);
        const audioBuffer = await audioCtx.decodeAudioData(await response.arrayBuffer());
        source.buffer = audioBuffer;
        source.connect(master);
        source.start();
        scheduleAudioRamp();
      }

      if (renderWhilePlaying) {
        const verseStartTime = segStart;
        await new Promise<void>((resolve) => {
          let frameId: number;
          source.onended = () => {
            cancelAnimationFrame(frameId);
            resolve();
          };
          const renderLoop = () => {
            const elapsed = (performance.now() - verseStartTime) / 1000;
            const seg = vSegs
              ? reciterTextAt(verse, vSegs, elapsed)
              : segmentFor(verse, tm, sourceStart + elapsed);
            if (seg.ar !== prevSegAr) {
              prevSegAr = seg.ar;
              segStart = performance.now();
            }
            drawFrame(
              ctx, size.w, size.h, verse, options, scale, bgImage, bgVideo,
              introAt(segStart), seg.ar, seg.tr, seg.isLast, clipFadeAt(),
              sequenceLoaded ? sequenceMediaAt(sequenceScenes, (performance.now() - clipStartMs) / 1000, sequenceLoaded, true) : undefined
            );
            frameId = requestAnimationFrame(renderLoop);
          };
          frameId = requestAnimationFrame(renderLoop);
        });
      } else {
        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
        });
      }
    } catch (err) {
      // Don't abort the whole export for one bad verse, but say which one
      // failed — a silent skip produces an incomplete video with no clue why.
      console.warn(`[export] verse ${verse.verse_key} failed; skipping`, err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (bgVideo) {
    bgVideo.pause();
    bgVideo.src = "";
  }
  if (sequenceLoaded) {
    for (const video of sequenceLoaded.videos.values()) {
      video.pause();
      video.src = "";
    }
  }

  recorder.stop();
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  return new Blob(chunks, { type: mimeType });
  } finally {
    // AudioContexts are a capped system resource (~6 per tab) — leak them on a
    // failed export and the app goes silent until reload.
    audioCtx.close().catch(() => {});
  }
}

const FAST_FPS = 30;

/** Build the final audio (verse slices concatenated back-to-back, gaps excluded)
 *  into one buffer, plus each verse's duration in that output timeline. */
async function assembleAudio(
  options: ExportOptions
): Promise<{ buffer: AudioBuffer; verseDurations: number[] }> {
  const RATE = 48000;
  const slices: { buf: AudioBuffer; offset: number; dur: number }[] = [];
  const ac = new AudioContext();
  try {
    if (options.importedAudio) {
      const full = await ac.decodeAudioData(
        await (await fetch(options.importedAudio.url)).arrayBuffer()
      );
      for (const { verse, timing: tm } of options.rows) {
        const [lo, hi] = tm
          ? effectiveAudioBounds(tm, verseWordCount(verse.text_uthmani))
          : [0, full.duration];
        const start = Math.max(0, lo);
        const end = Math.min(full.duration, hi);
        slices.push({ buf: full, offset: start, dur: Math.max(0.05, end - start) });
      }
    } else {
      for (const { verse } of options.rows) {
        const r = await fetch(getAudioUrl(options.reciterFolder, options.surahNumber, verse.verse_number));
        const b = await ac.decodeAudioData(await r.arrayBuffer());
        slices.push({ buf: b, offset: 0, dur: b.duration });
      }
    }
  } finally {
    ac.close();
  }

  const verseDurations = slices.map((s) => s.dur);
  const total = Math.max(0.1, verseDurations.reduce((a, b) => a + b, 0));
  const offline = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE);
  let cursor = 0;
  for (const s of slices) {
    const node = offline.createBufferSource();
    node.buffer = s.buf;
    node.connect(offline.destination);
    node.start(cursor, s.offset, s.dur);
    cursor += s.dur;
  }
  const buffer = await offline.startRendering();
  return { buffer, verseDurations };
}

/** First AVC codec string the encoder will accept for this resolution. */
async function pickAvcCodec(width: number, height: number): Promise<string> {
  const candidates = ["avc1.640034", "avc1.4d0034", "avc1.640028", "avc1.4d0028", "avc1.42e01f"];
  for (const codec of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height });
      if (supported) return codec;
    } catch {
      /* try next */
    }
  }
  return "avc1.42e01f";
}

/** Faster-than-real-time export via WebCodecs (encodes frames as fast as it can
 *  draw them) muxed to MP4. Backgrounds are image/gradient/solid (no video). */
export async function exportVideoFast(options: ExportOptions): Promise<Blob> {
  const size = FORMAT_SIZES[options.videoFormat];

  let bgImage: HTMLImageElement | undefined;
  if (!options.backgroundSequenceEnabled && options.background.type === "image") {
    try {
      bgImage = await loadImage(options.background.value);
    } catch {
      bgImage = undefined;
    }
  }

  // Video background: load it so we can seek to each output frame's time. If it
  // can't load/decode, throw to fall back to the real-time recorder.
  let bgVideo: HTMLVideoElement | undefined;
  let videoDuration = 0;
  if (!options.backgroundSequenceEnabled && options.background.type === "video") {
    bgVideo = document.createElement("video");
    bgVideo.src = options.background.value;
    bgVideo.muted = true;
    bgVideo.playsInline = true;
    bgVideo.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      bgVideo!.addEventListener("loadeddata", () => resolve());
      bgVideo!.addEventListener("error", () => reject(new Error("background video failed to load")));
    });
    videoDuration = bgVideo.duration;
    if (!Number.isFinite(videoDuration) || videoDuration <= 0) {
      throw new Error("background video has no usable duration");
    }
  }
  const sequenceScenesFast = options.backgroundSequenceEnabled ? options.backgroundScenes ?? [] : [];
  const sequenceLoadedFast = sequenceScenesFast.length > 0
    ? await loadBackgroundSequence(sequenceScenesFast)
    : undefined;

  const { buffer: audioBuffer, verseDurations } = await assembleAudio(options);
  // Optional audio fade-in: ramp the first clipFadeMs of the concatenated clip
  // (sample 0) up from silence, synced to the visual fade.
  if (options.audioFadeIn && (options.clipFadeMs ?? 0) > 0) {
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      applyAudioFadeIn(audioBuffer.getChannelData(c), audioBuffer.sampleRate, options.clipFadeMs!);
    }
  }
  const totalDur = Math.max(0.1, verseDurations.reduce((a, b) => a + b, 0));
  const cum: number[] = [];
  {
    let acc = 0;
    for (const d of verseDurations) {
      cum.push(acc);
      acc += d;
    }
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: size.w, height: size.h },
    audio: { codec: "aac", numberOfChannels: 2, sampleRate: audioBuffer.sampleRate },
    fastStart: "in-memory",
  });

  let encodeError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  // Prefer the hardware encoder when available — often several times faster
  // than software at 1080×1920. Fall back to the default (any) if the hint is
  // unsupported for this codec/resolution.
  const codec = await pickAvcCodec(size.w, size.h);
  const baseVideoCfg = {
    codec,
    width: size.w,
    height: size.h,
    bitrate: 8_000_000,
    framerate: FAST_FPS,
  } as const;
  let configured = false;
  try {
    const hw = { ...baseVideoCfg, hardwareAcceleration: "prefer-hardware" as const };
    const { supported } = await VideoEncoder.isConfigSupported(hw);
    if (supported) {
      videoEncoder.configure(hw);
      configured = true;
    }
  } catch {
    /* hint unsupported — use default below */
  }
  if (!configured) videoEncoder.configure(baseVideoCfg);

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  audioEncoder.configure({
    codec: "mp4a.40.2",
    numberOfChannels: 2,
    sampleRate: audioBuffer.sampleRate,
    bitrate: 160_000,
  });

  // ---- Video: draw + encode every frame across the output timeline ----
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d")!;
  const scale = size.w / 480;
  const introMs = options.verseIntro && options.verseIntro !== "none" ? options.verseIntroMs ?? 450 : 0;
  const clipFadeMsFast = options.clipFadeMs ?? 0;
  const totalFrames = Math.max(1, Math.ceil(totalDur * FAST_FPS));
  // Reciter clips: per-verse word-parts timed to the reciter (empty for uploads).
  const reciterSegs = await buildReciterSegments(options);

  // Map an output-timeline time to a time in the background video. Synced clips
  // (lip-sync) follow each verse's audio start; otherwise the video loops or
  // holds its last frame, matching the live preview / real-time export.
  const synced = !!(bgVideo && options.backgroundVideoSync && options.importedAudio);
  const videoLoop = !synced && options.videoLoopMode !== "freeze";
  const verseVideoStart: number[] = [];
  if (synced && options.importedAudio) {
    for (const { timing: tm } of options.rows) {
      verseVideoStart.push(Math.max(0, tm?.start ?? 0));
    }
  }
  const lastFrameTime = Math.max(0, videoDuration - 1e-3);
  const videoTimeFor = (t: number, vi: number): number => {
    if (synced) return Math.min(verseVideoStart[vi] + (t - cum[vi]), lastFrameTime);
    if (videoLoop) return t % videoDuration;
    return Math.min(t, lastFrameTime); // freeze: hold last frame past the end
  };

  // Pre-compute what's on screen at every frame tick (pure arithmetic — cheap).
  // Most of a clip is static: the same verse text, intro finished, no bg video.
  // Instead of drawing + encoding 30 identical frames per second, we encode ONE
  // frame per static run with a longer duration (H.264 and the muxer handle
  // variable frame durations natively). Animated spans (intro in progress) and
  // video backgrounds still get every frame.
  interface FramePlan {
    t: number;
    vi: number; // verse shown on screen (leads the audio by the intro duration)
    audioVi: number; // verse whose audio is playing (for bg-video sync)
    ar: string;
    tr: string | null | undefined;
    isLast: boolean;
    introProgress: number;
    clipFade: number;
    key: string;
  }
  // Fade-in lead: show the next verse `introLead` before its recitation so its
  // intro animation finishes as the words begin (mirrors the live preview in
  // imported-player). Verse-level only — within a verse, parts track the audio.
  const introLead = introMs / 1000;
  const plan: FramePlan[] = new Array(totalFrames);
  {
    let prevSegText = "";
    let segStartT = 0;
    for (let f = 0; f < totalFrames; f++) {
      const t = f / FAST_FPS;
      const td = t + introLead;
      let vi = 0;
      while (vi < cum.length - 1 && td >= cum[vi + 1]) vi++; // display verse (leads)
      let audioVi = 0;
      while (audioVi < cum.length - 1 && t >= cum[audioVi + 1]) audioVi++; // audio verse
      // Row-indexed: vi indexes cum[], which is now one entry per ROW, so the
      // row's own timing is the right one even for a duplicated verse.
      const row = options.rows[vi];
      const verse = row.verse;
      const tmFast = row.timing;
      const vSegsFast = reciterSegs.get(verse.verse_number);
      // Real-time offset into the displayed verse (0 during the lead window, so a
      // leading verse shows its first part) — parts never lead, only the verse.
      const localT = Math.max(0, t - cum[vi]);
      // Origin is the audio start (effectiveAudioBounds().lo), matching the
      // realtime path and the preview: a front word-trim moves the audio start
      // past tm.start, so split timing must use lo. lo === tm.start when there is
      // no front trim.
      const audioLo = tmFast
        ? effectiveAudioBounds(tmFast, verseWordCount(verse.text_uthmani))[0]
        : 0;
      const sourceTime = audioLo + localT;
      const segFast = vSegsFast
        ? reciterTextAt(verse, vSegsFast, localT)
        : segmentFor(verse, tmFast, sourceTime);
      const segKey = `${vi}:${segFast.ar}`;
      if (segKey !== prevSegText) {
        prevSegText = segKey;
        segStartT = t;
      }
      const introProgress = introMs > 0 ? Math.min(1, ((t - segStartT) * 1000) / introMs) : 1;
      // Clip-start fade: clip begins at t=0 on the output timeline.
      const clipFade = clipFadeProgress(t * 1000, clipFadeMsFast);
      plan[f] = {
        t, vi, audioVi,
        ar: segFast.ar,
        tr: segFast.tr,
        isLast: segFast.isLast,
        introProgress,
        clipFade,
        // clipFade is part of the dedupe key so each distinct fade frame is
        // encoded (run-length encoding must not collapse the fade animation).
        key: `${segKey}|${introProgress}|${clipFade}|${segFast.isLast}|${(() => {
          const scene = sequenceScenesFast.length ? resolveBackgroundScene(sequenceScenesFast, t) : undefined;
          return scene ? `${scene.index}:${scene.transitionProgress.toFixed(3)}` : "single";
        })()}`,
      };
    }
  }

  // Keyframe at least once a second so players can seek.
  let lastKeyT = -1;
  let f = 0;
  while (f < totalFrames) {
    if (encodeError) throw encodeError;
    const p = plan[f];
    const verse = options.rows[p.vi].verse;
    if (bgVideo) await seekVideoFrame(bgVideo, videoTimeFor(p.t, p.audioVi));
    const sequenceMedia = sequenceLoadedFast
      ? sequenceMediaAt(sequenceScenesFast, p.t, sequenceLoadedFast)
      : undefined;
    if (sequenceMedia) {
      const resolved = resolveBackgroundScene(sequenceScenesFast, p.t);
      await seekSequenceMedia(
        sequenceMedia,
        resolved?.localTime ?? 0,
        resolved ? resolved.transitionProgress * resolved.scene.transitionDuration : 0
      );
    }

    drawFrame(
      ctx, size.w, size.h, verse, options, scale, bgImage, bgVideo,
      p.introProgress, p.ar, p.tr, p.isLast, p.clipFade, sequenceMedia
    );

    // Length of the static run starting here (1 when a bg video animates,
    // capped at 1s so keyframes stay regular).
    let runLen = 1;
    if (!bgVideo && !sequenceLoadedFast) {
      while (
        runLen < FAST_FPS &&
        f + runLen < totalFrames &&
        plan[f + runLen].key === p.key
      ) {
        runLen++;
      }
    }

    const keyFrame = p.t - lastKeyT >= 1 || f === 0;
    if (keyFrame) lastKeyT = p.t;
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(p.t * 1e6),
      duration: Math.round((runLen / FAST_FPS) * 1e6),
    });
    videoEncoder.encode(frame, { keyFrame });
    frame.close();
    f += runLen;

    // Backpressure + progress + yield so the UI stays responsive.
    if (videoEncoder.encodeQueueSize > 20) {
      while (videoEncoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    }
    options.onProgress(Math.min(options.rows.length, p.vi + 1), options.rows.length);
    await new Promise((r) => setTimeout(r, 0));
  }

  if (bgVideo) {
    bgVideo.pause();
    bgVideo.src = "";
  }
  if (sequenceLoadedFast) {
    for (const video of sequenceLoadedFast.videos.values()) {
      video.pause();
      video.src = "";
    }
  }

  // ---- Audio: encode the rendered buffer in planar chunks ----
  const channels = audioBuffer.numberOfChannels;
  const len = audioBuffer.length;
  const rate = audioBuffer.sampleRate;
  const chans: Float32Array[] = [];
  for (let c = 0; c < channels; c++) chans.push(audioBuffer.getChannelData(c));
  const CHUNK = 8192;
  for (let i = 0; i < len; i += CHUNK) {
    if (encodeError) throw encodeError;
    const frames = Math.min(CHUNK, len - i);
    const planar = new Float32Array(frames * channels);
    for (let c = 0; c < channels; c++) planar.set(chans[c].subarray(i, i + frames), c * frames);
    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate: rate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((i / rate) * 1e6),
      data: planar,
    });
    audioEncoder.encode(audioData);
    audioData.close();
    if (audioEncoder.encodeQueueSize > 20) {
      while (audioEncoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    }
  }

  await videoEncoder.flush();
  await audioEncoder.flush();
  if (encodeError) throw encodeError;
  muxer.finalize();
  options.onProgress(options.rows.length, options.rows.length);
  const { buffer } = muxer.target as ArrayBufferTarget;
  return new Blob([buffer], { type: "video/mp4" });
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  verse: Verse,
  options: ExportOptions,
  _scale: number,
  bgImage?: HTMLImageElement,
  bgVideo?: HTMLVideoElement,
  introProgress = 1,
  /** Override Arabic text (intra-verse split segment). Falls back to verse.text_uthmani. */
  displayArabic?: string,
  /** Override translation. Falls back to verse.translation. */
  displayTranslation?: string | null,
  isLastPart = true,
  /** Clip-start fade progress (1 = fully shown, 0 = black). */
  clipFade = 1,
  sequenceMedia?: SceneMedia
) {
  // When showing a mid-verse segment, manual word emphasis indices wouldn't
  // line up with the partial text — so emphasis only applies on the full verse.
  const showingFullVerse =
    displayArabic == null || displayArabic === verse.text_uthmani;
  const ve = showingFullVerse ? options.emphasis[verse.verse_key] : undefined;
  const arText = displayArabic ?? verse.text_uthmani;
  const trText =
    displayTranslation === undefined ? verse.translation : displayTranslation ?? undefined;

  const content: SceneContent = {
    arabicText: arText,
    verseNumber: verse.verse_number,
    translation: trText ?? undefined,
    isLastPart,
    qcfWords: sliceQcfForDisplay(verse, arText, isLastPart),
    arabicEmphasis: ve?.arabic,
    translationEmphasis: ve?.translation,
    introProgress,
    clipFadeProgress: clipFade,
  };
  drawScene(ctx, options, content, sequenceMedia ?? { image: bgImage, video: bgVideo });
}
