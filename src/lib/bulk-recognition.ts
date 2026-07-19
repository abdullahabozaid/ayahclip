import type { Surah } from "@/types";
import { recognizeQuranPassage } from "./quran-recognition";
import type { BulkDetectedAyah } from "./bulk-clips";
import type { RecognitionProgress } from "./recognition-progress";

export interface BulkRecognitionProgress {
  window: number;
  windowCount: number;
  sourceStart: number;
  sourceEnd: number;
  recognition: RecognitionProgress;
}
export interface BulkRecognitionResult {
  ayahs: BulkDetectedAyah[];
  unresolvedWindows: { start: number; end: number; reason: string }[];
}

export function bulkRecognitionWindows(
  duration: number,
  windowSeconds = 4 * 60,
  overlapSeconds = 24,
): { start: number; end: number }[] {
  if (!(duration > 0)) return [];
  const windows: { start: number; end: number }[] = [];
  const step = Math.max(1, windowSeconds - overlapSeconds);
  for (let start = 0; start < duration; start += step) {
    const end = Math.min(duration, start + windowSeconds);
    windows.push({ start, end });
    if (end === duration) break;
  }
  return windows;
}

export function sliceAudioBuffer(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
  const startFrame = Math.max(0, Math.floor(start * buffer.sampleRate));
  const endFrame = Math.min(buffer.length, Math.ceil(end * buffer.sampleRate));
  const sliced = new AudioBuffer({
    length: Math.max(1, endFrame - startFrame),
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    sliced.copyToChannel(buffer.getChannelData(channel).subarray(startFrame, endFrame), channel);
  }
  return sliced;
}

export async function recognizeQuranInWindows({
  buffer,
  surahs,
  signal,
  onProgress,
}: {
  buffer: AudioBuffer;
  surahs: readonly Surah[];
  signal?: AbortSignal;
  onProgress?: (progress: BulkRecognitionProgress) => void;
}): Promise<BulkRecognitionResult> {
  const windows = bulkRecognitionWindows(buffer.duration);
  const ayahs: BulkDetectedAyah[] = [];
  const unresolvedWindows: BulkRecognitionResult["unresolvedWindows"] = [];

  for (let index = 0; index < windows.length; index++) {
    if (signal?.aborted) throw new DOMException("Bulk recognition cancelled", "AbortError");
    const window = windows[index];
    const outcome = await recognizeQuranPassage({
      buffer: sliceAudioBuffer(buffer, window.start, window.end),
      surahs,
      signal,
      onProgress: (recognition) => onProgress?.({
        window: index + 1,
        windowCount: windows.length,
        sourceStart: window.start,
        sourceEnd: window.end,
        recognition,
      }),
    });
    if (outcome.kind !== "matched") {
      unresolvedWindows.push({ start: window.start, end: window.end, reason: outcome.message });
      continue;
    }
    for (const timing of outcome.result.timings) {
      ayahs.push({
        ...timing,
        start: timing.start + window.start,
        end: timing.end + window.start,
        splits: timing.splits?.map((split) => split + window.start),
        surah: outcome.result.surah,
        confidence: outcome.result.confidence,
        sourceWindow: index,
      });
    }
  }
  return { ayahs, unresolvedWindows };
}
