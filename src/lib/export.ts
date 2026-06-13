import { Verse, VideoFormat, Background, TextShadow, LetterboxConfig, QcfWord } from "@/types";
import type { VerseEmphasis } from "./store";
import { getAudioUrl } from "./api";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { ensureFontsReady, SafeAreaTarget } from "./canvas-utils";
import {
  FORMAT_SIZES,
  drawScene,
  sliceQcfForDisplay,
  type SceneContent,
} from "./render-core";
import { verseTextAt, type VerseTiming } from "./audio-import";
import { ensureQcfFontsReady } from "./qcf-font-loader";
import {
  loadVerseWords,
  buildPartsFromBoundaries,
  findCurrentSegmentIndex,
  type TextSegment,
} from "./playback-engine";

interface ExportOptions {
  verses: Verse[];
  reciterFolder: string;
  surahNumber: number;
  videoFormat: VideoFormat;
  arabicFontSize: number;
  arabicFont: string;
  arabicFontWeight: number;
  arabicVerseNumber: boolean;
  translationVerseNumber: boolean;
  translationEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  translationFontWeight: number;
  translationDirection?: "ltr" | "rtl";
  textColor: string;
  lineHeight: number;
  translationLineHeight: number;
  arabicTranslationGap: number;
  textPosition: number;
  overlayOpacity: number;
  overlayColor: string;
  safeAreaTarget: SafeAreaTarget;
  safePadding: number;
  background: Background;
  backgroundFit?: import("./canvas-utils").MediaFit;
  fitBackdrop?: import("./canvas-utils").FitBackdrop;
  /** Sync the background video's time to each verse's audio slice (lip-sync). */
  backgroundVideoSync?: boolean;
  /** When the bg video ends: loop it, or hold the last frame. */
  videoLoopMode?: "loop" | "freeze";
  verseIntro?: import("./canvas-utils").VerseIntro;
  verseIntroMs?: number;
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
// on its intra-verse splits. No splits → the full verse text passes through.
function segmentFor(
  verse: Verse,
  tm: VerseTiming | undefined,
  sourceTime: number
): { ar: string; tr: string | null | undefined; isLast: boolean } {
  if (!tm?.splits?.length) {
    return { ar: verse.text_uthmani, tr: verse.translation, isLast: true };
  }
  let segIdx = 0;
  for (const sp of tm.splits) { if (sourceTime >= sp) segIdx++; else break; }
  const isLast = segIdx === tm.splits.length;
  return {
    ar: verseTextAt(tm, verse.text_uthmani, sourceTime),
    tr:
      verse.translation != null
        ? verseTextAt(tm, verse.translation, sourceTime)
        : verse.translation,
    isLast,
  };
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Export router: use the fast WebCodecs encoder when it's supported. Video
 * backgrounds are handled by seeking the bg video to each output frame's time
 * (faster-than-real-time). Any failure falls back to the real-time MediaRecorder
 * path, so export always works.
 */
export async function exportVideo(options: ExportOptions): Promise<Blob> {
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
  if (webCodecs) {
    try {
      return await exportVideoFast(options);
    } catch (e) {
      console.warn("Fast export failed; falling back to real-time recorder.", e);
    }
  }
  return exportRealtime(options);
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
  if (options.background.type === "image") {
    try {
      bgImage = await loadImage(options.background.value);
    } catch {
      // Fall back to solid black
    }
  }

  let bgVideo: HTMLVideoElement | undefined;
  if (options.background.type === "video") {
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

  for (let i = 0; i < options.verses.length; i++) {
    const verse = options.verses[i];
    options.onProgress(i + 1, options.verses.length);

    // Looked up once per verse — used both for audio slicing AND for the
    // intra-verse segment that drives on-screen text.
    const tm = options.importedAudio?.timings.find((t) => t.verseNumber === verse.verse_number);
    const sourceStart = tm?.start ?? 0;
    const vSegs = reciterSegs.get(verse.verse_number);

    let segStart = performance.now();
    let prevSegAr = "";
    const seg0 = vSegs
      ? reciterTextAt(verse, vSegs, 0)
      : segmentFor(verse, tm, sourceStart);
    prevSegAr = seg0.ar;
    drawFrame(
      ctx, size.w, size.h, verse, options, scale, bgImage, bgVideo,
      introAt(segStart), seg0.ar, seg0.tr, seg0.isLast
    );

    try {
      const source = audioCtx.createBufferSource();
      let renderWhilePlaying = !!bgVideo || hasIntro || !!tm?.splits?.length || !!vSegs;

      if (importedBuffer && options.importedAudio) {
        const start = sourceStart;
        const dur = Math.max(0.05, (tm?.end ?? importedBuffer.duration) - start);
        source.buffer = importedBuffer;
        source.connect(destination);
        source.connect(audioCtx.destination);
        source.start(0, start, dur);
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
        source.connect(destination);
        source.connect(audioCtx.destination);
        source.start();
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
              introAt(segStart), seg.ar, seg.tr, seg.isLast
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
      for (const verse of options.verses) {
        const tm = options.importedAudio.timings.find((t) => t.verseNumber === verse.verse_number);
        const start = Math.max(0, tm?.start ?? 0);
        const end = Math.min(full.duration, tm?.end ?? full.duration);
        slices.push({ buf: full, offset: start, dur: Math.max(0.05, end - start) });
      }
    } else {
      for (const verse of options.verses) {
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
  if (options.background.type === "image") {
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
  if (options.background.type === "video") {
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

  const { buffer: audioBuffer, verseDurations } = await assembleAudio(options);
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
    for (const verse of options.verses) {
      const tm = options.importedAudio.timings.find((t) => t.verseNumber === verse.verse_number);
      verseVideoStart.push(Math.max(0, tm?.start ?? 0));
    }
  }
  const lastFrameTime = Math.max(0, videoDuration - 1e-3);
  const videoTimeFor = (t: number, vi: number): number => {
    if (synced) return Math.min(verseVideoStart[vi] + (t - cum[vi]), lastFrameTime);
    if (videoLoop) return t % videoDuration;
    return Math.min(t, lastFrameTime); // freeze: hold last frame past the end
  };

  let prevSegText = "";
  let segStartT = 0;
  let lastDrawKey = " never";
  for (let f = 0; f < totalFrames; f++) {
    if (encodeError) throw encodeError;
    const t = f / FAST_FPS;
    let vi = 0;
    while (vi < cum.length - 1 && t >= cum[vi + 1]) vi++;
    const verse = options.verses[vi];
    if (bgVideo) await seekVideoFrame(bgVideo, videoTimeFor(t, vi));
    const tmFast = options.importedAudio?.timings.find(
      (x) => x.verseNumber === verse.verse_number
    );
    const vSegsFast = reciterSegs.get(verse.verse_number);
    const sourceTime = (tmFast?.start ?? 0) + (t - cum[vi]);
    const segFast = vSegsFast
      ? reciterTextAt(verse, vSegsFast, t - cum[vi])
      : segmentFor(verse, tmFast, sourceTime);
    const segKey = `${vi}:${segFast.ar}`;
    if (segKey !== prevSegText) {
      prevSegText = segKey;
      segStartT = t;
    }
    const introProgress = introMs > 0 ? Math.min(1, ((t - segStartT) * 1000) / introMs) : 1;
    // Most frames are pixel-identical to the previous one (static background,
    // text unchanged, intro finished). Re-drawing the 1080×1920 scene is the
    // expensive part of the loop — skip it when nothing on screen changed.
    // Any background video forces a redraw every frame (its pixels move).
    const drawKey = bgVideo
      ? ""
      : `${segKey}|${introProgress}|${segFast.isLast}`;
    if (bgVideo || drawKey !== lastDrawKey) {
      drawFrame(
        ctx, size.w, size.h, verse, options, scale, bgImage, bgVideo,
        introProgress, segFast.ar, segFast.tr, segFast.isLast
      );
      lastDrawKey = drawKey;
    }

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(t * 1e6),
      duration: Math.round(1e6 / FAST_FPS),
    });
    videoEncoder.encode(frame, { keyFrame: f % FAST_FPS === 0 });
    frame.close();

    // Backpressure + progress + yield so the UI stays responsive.
    if (videoEncoder.encodeQueueSize > 20) {
      while (videoEncoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    }
    if (f % 30 === 0) {
      options.onProgress(Math.min(options.verses.length, vi + 1), options.verses.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (bgVideo) {
    bgVideo.pause();
    bgVideo.src = "";
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
  options.onProgress(options.verses.length, options.verses.length);
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
  isLastPart = true
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
  };
  drawScene(ctx, options, content, { image: bgImage, video: bgVideo });
}
