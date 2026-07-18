import type { Reciter } from "@/types";
import { fetchMp3Clip } from "./mp3-range";
import { resolveReciterVerseWindow } from "./reciter-audio";

export interface DecodedReciterVerse {
  buffer: AudioBuffer;
  offsetSeconds: number;
  durationSeconds: number;
  requestedBytes: number;
  totalSourceBytes: number;
}

export async function decodeReciterVerseAudio(
  audioContext: AudioContext,
  reciter: Reciter,
  surahNumber: number,
  ayahNumber: number
): Promise<DecodedReciterVerse> {
  const window = await resolveReciterVerseWindow(reciter, surahNumber, ayahNumber);
  if (
    window.sourceKind === "chapter-cues" &&
    window.endSeconds != null &&
    window.chapterEndSeconds != null
  ) {
    const clip = await fetchMp3Clip({
      url: window.url,
      startSeconds: window.startSeconds,
      endSeconds: window.endSeconds,
      chapterEndSeconds: window.chapterEndSeconds,
    });
    const buffer = await audioContext.decodeAudioData(clip.bytes.slice(0));
    const offsetSeconds = Math.max(0, window.startSeconds - clip.mediaStartSeconds);
    const requestedDuration = window.endSeconds - window.startSeconds;
    const durationSeconds = Math.max(
      0.05,
      Math.min(requestedDuration, buffer.duration - offsetSeconds)
    );
    if (durationSeconds <= 0.05 || offsetSeconds >= buffer.duration) {
      throw new Error(`The selected audio range could not be decoded for ${surahNumber}:${ayahNumber}`);
    }
    return {
      buffer,
      offsetSeconds,
      durationSeconds,
      requestedBytes: clip.requestedBytes,
      totalSourceBytes: clip.totalBytes,
    };
  }

  const response = await fetch(window.url);
  if (!response.ok) throw new Error(`Reciter audio returned HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const buffer = await audioContext.decodeAudioData(bytes.slice(0));
  return {
    buffer,
    offsetSeconds: 0,
    durationSeconds: buffer.duration,
    requestedBytes: bytes.byteLength,
    totalSourceBytes: bytes.byteLength,
  };
}
