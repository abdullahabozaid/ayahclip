// Client-only: extract the audio track from a video file (mp4/mov/webm) using
// ffmpeg.wasm. Import lazily (await import) — never in SSR. Uses the single-thread
// core so no COOP/COEP headers are required. The core is served same-origin from
// public/ffmpeg/ (vendored @ffmpeg/core@0.12.10) — never a third-party CDN, so
// imported-video recognition works offline/self-hosted and the CSP can stay tight.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const CORE_BASE = "/ffmpeg";

let ffmpeg: FFmpeg | null = null;

/** Stop an in-flight extraction and force the next import to start cleanly. */
export function cancelAudioExtraction(): void {
  ffmpeg?.terminate();
  ffmpeg = null;
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  const ff = new FFmpeg();
  await ff.load({
    coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpeg = ff;
  return ff;
}

/** Extract a video's audio track to a mono WAV Blob (PCM — codec-independent, always decodable). */
export async function extractAudioFromVideo(file: File): Promise<Blob> {
  const ff = await getFFmpeg();
  const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
  const input = `input.${ext}`;
  try {
    await ff.writeFile(input, await fetchFile(file));
    // ffmpeg.wasm runs the ffmpeg CLI inside WASM — these are CLI args (no shell, no child_process).
    const runFfmpeg = ff.exec.bind(ff);
    await runFfmpeg(["-i", input, "-vn", "-ac", "1", "-ar", "44100", "output.wav"]);
    const data = (await ff.readFile("output.wav")) as Uint8Array;
    // Copy into a fresh ArrayBuffer-backed view so it's a valid BlobPart.
    return new Blob([new Uint8Array(data)], { type: "audio/wav" });
  } finally {
    await ff.deleteFile(input).catch(() => {});
    await ff.deleteFile("output.wav").catch(() => {});
  }
}
