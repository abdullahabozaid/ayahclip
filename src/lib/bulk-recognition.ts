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

export interface BulkRecognitionWindowComplete extends BulkRecognitionResult {
  nextWindowIndex: number;
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
  startWindowIndex = 0,
  initialAyahs = [],
  initialUnresolvedWindows = [],
  onWindowComplete,
}: {
  buffer: AudioBuffer;
  surahs: readonly Surah[];
  signal?: AbortSignal;
  onProgress?: (progress: BulkRecognitionProgress) => void;
  startWindowIndex?: number;
  initialAyahs?: BulkDetectedAyah[];
  initialUnresolvedWindows?: BulkRecognitionResult["unresolvedWindows"];
  onWindowComplete?: (result: BulkRecognitionWindowComplete) => void | Promise<void>;
}): Promise<BulkRecognitionResult> {
  const windows = bulkRecognitionWindows(buffer.duration);
  const ayahs: BulkDetectedAyah[] = initialAyahs.map((ayah) => ({ ...ayah }));
  const unresolvedWindows: BulkRecognitionResult["unresolvedWindows"] = initialUnresolvedWindows.map((window) => ({ ...window }));

  for (let index = Math.max(0, startWindowIndex); index < windows.length; index++) {
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
    // A "none" outcome truly found no Quran and is withheld. An "ambiguous"
    // outcome, however, already carries fully-built, corpus-aligned candidate
    // ranges — discarding them was why real recitations produced ZERO drafts.
    // Surface the top candidate as a LOW-confidence draft the creator must
    // verify (built unapproved, flagged for review) rather than silently
    // dropping it. The Arabic shown is still the verified corpus text for that
    // range; only the range attribution is uncertain, hence the review gate.
    const emitted = outcome.kind === "matched"
      ? { result: outcome.result, confidence: outcome.result.confidence }
      : outcome.kind === "ambiguous" && outcome.candidates[0]
        ? { result: outcome.candidates[0], confidence: "low" as const }
        : null;
    if (!emitted) {
      const reason = outcome.kind === "matched" ? "" : outcome.message;
      unresolvedWindows.push({ start: window.start, end: window.end, reason });
      await onWindowComplete?.({ ayahs, unresolvedWindows, nextWindowIndex: index + 1 });
      continue;
    }
    for (const timing of emitted.result.timings) {
      ayahs.push({
        ...timing,
        start: timing.start + window.start,
        end: timing.end + window.start,
        splits: timing.splits?.map((split) => split + window.start),
        alignedWordStarts: timing.alignedWordStarts?.map((time) => time + window.start),
        surah: emitted.result.surah,
        confidence: emitted.confidence,
        sourceWindow: index,
      });
    }
    await onWindowComplete?.({ ayahs, unresolvedWindows, nextWindowIndex: index + 1 });
  }
  return { ayahs, unresolvedWindows };
}
