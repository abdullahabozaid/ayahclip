import { Verse, VideoFormat, Background, TextShadow, LetterboxConfig } from "@/types";
import { getAudioUrl } from "./api";
import {
  drawBackground,
  drawBgImage,
  drawVideoFrame,
  drawVerseText,
  drawLetterboxBars,
  getLetterboxContentArea,
} from "./canvas-utils";

const FORMAT_SIZES: Record<VideoFormat, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

interface ExportOptions {
  verses: Verse[];
  reciterFolder: string;
  surahNumber: number;
  videoFormat: VideoFormat;
  arabicFontSize: number;
  arabicFont: string;
  translationEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  textColor: string;
  overlayOpacity: number;
  background: Background;
  textShadow: TextShadow;
  letterbox: LetterboxConfig;
  onProgress: (current: number, total: number) => void;
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

export async function exportVideo(options: ExportOptions): Promise<Blob> {
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
    bgVideo.loop = true;
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
  const destination = audioCtx.createMediaStreamDestination();

  for (const track of destination.stream.getAudioTracks()) {
    stream.addTrack(track);
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
    videoBitsPerSecond: 5_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  const scale = size.w / 480;

  for (let i = 0; i < options.verses.length; i++) {
    const verse = options.verses[i];
    options.onProgress(i + 1, options.verses.length);

    drawFrame(ctx, size.w, size.h, verse, options, scale, bgImage, bgVideo);

    const audioUrl = getAudioUrl(options.reciterFolder, options.surahNumber, verse.verse_number);

    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(destination);
      source.connect(audioCtx.destination);
      source.start();

      if (bgVideo) {
        await new Promise<void>((resolve) => {
          let frameId: number;
          source.onended = () => {
            cancelAnimationFrame(frameId);
            resolve();
          };
          const renderLoop = () => {
            drawFrame(ctx, size.w, size.h, verse, options, scale, bgImage, bgVideo);
            frameId = requestAnimationFrame(renderLoop);
          };
          frameId = requestAnimationFrame(renderLoop);
        });
      } else {
        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
        });
      }
    } catch {
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

  audioCtx.close();
  return new Blob(chunks, { type: "video/webm" });
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  verse: Verse,
  options: ExportOptions,
  scale: number,
  bgImage?: HTMLImageElement,
  bgVideo?: HTMLVideoElement
) {
  const useLetterbox = options.letterbox.enabled && options.videoFormat === "9:16";

  if (useLetterbox) {
    drawLetterboxBars(ctx, w, h, options.letterbox);

    const content = getLetterboxContentArea(w, h);
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
      drawBackground(ctx, content.w, content.h, options.background);
    }

    ctx.fillStyle = `rgba(0, 0, 0, ${options.overlayOpacity / 100})`;
    ctx.fillRect(0, 0, content.w, content.h);

    drawVerseText(
      ctx,
      content.w,
      content.h,
      verse.text_uthmani,
      verse.verse_number,
      verse.translation,
      {
        arabicFont: options.arabicFont,
        arabicFontSize: options.arabicFontSize,
        translationEnabled: options.translationEnabled,
        translationFontSize: options.translationFontSize,
        translationFont: options.translationFont,
        textColor: options.textColor,
        textShadow: options.textShadow,
      },
      scale
    );

    ctx.restore();
  } else {
    if (bgVideo) {
      drawVideoFrame(ctx, bgVideo, w, h);
    } else if (bgImage) {
      drawBgImage(ctx, bgImage, w, h);
    } else {
      drawBackground(ctx, w, h, options.background);
    }

    ctx.fillStyle = `rgba(0, 0, 0, ${options.overlayOpacity / 100})`;
    ctx.fillRect(0, 0, w, h);

    drawVerseText(
      ctx,
      w,
      h,
      verse.text_uthmani,
      verse.verse_number,
      verse.translation,
      {
        arabicFont: options.arabicFont,
        arabicFontSize: options.arabicFontSize,
        translationEnabled: options.translationEnabled,
        translationFontSize: options.translationFontSize,
        translationFont: options.translationFont,
        textColor: options.textColor,
        textShadow: options.textShadow,
      },
      scale
    );
  }
}
