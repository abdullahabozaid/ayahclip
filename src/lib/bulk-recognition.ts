import type { Surah } from "@/types";
import { recognizeQuranPassage } from "./quran-recognition";
import { findSilenceCenters } from "./audio-import";
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

export interface SilenceAwareWindowOptions {
  targetSeconds?: number;
  minSeconds?: number;
  maxSeconds?: number;
  overlapSeconds?: number;
  /** How far from the target boundary a pause may be and still be snapped to. */
  snapToleranceSeconds?: number;
}

/**
 * Recognition windows whose boundaries snap to the recitation's real pauses
 * instead of arbitrary fixed slices (plan 008 item C). A reciter breathes
 * between ayat; cutting there — rather than mid-ayah at a fixed 4:00 mark —
 * keeps each window's passage a whole thought, so its match score does not
 * bleed across a boundary. Near each target boundary we pick the LONGEST pause
 * within tolerance (the cleanest cut), tie-broken by closeness to the target;
 * with no usable pause we fall back to the fixed target. A small overlap still
 * guards an ayah that straddles two windows. Pure function of duration + the
 * pause list so it is unit-testable without audio.
 */
export function silenceAwareWindows(
  duration: number,
  silences: readonly { time: number; len: number }[],
  {
    targetSeconds = 4 * 60,
    minSeconds = 2 * 60,
    maxSeconds = 5 * 60,
    overlapSeconds = 12,
    snapToleranceSeconds = 45,
  }: SilenceAwareWindowOptions = {},
): { start: number; end: number }[] {
  if (!(duration > 0)) return [];
  const gaps = silences
    .filter((gap) => gap.time > 0 && gap.time < duration)
    .sort((a, b) => a.time - b.time);
  const windows: { start: number; end: number }[] = [];
  let start = 0;
  // Guard against a degenerate config that could fail to advance.
  const guardStep = Math.max(1, minSeconds - overlapSeconds);
  while (start < duration) {
    const hardEnd = Math.min(duration, start + maxSeconds);
    if (hardEnd >= duration) {
      windows.push({ start, end: duration });
      break;
    }
    const target = start + targetSeconds;
    const softStart = start + minSeconds;
    const candidate = gaps
      .filter((gap) =>
        gap.time >= softStart &&
        gap.time <= hardEnd &&
        Math.abs(gap.time - target) <= snapToleranceSeconds)
      .reduce<{ time: number; len: number } | null>((best, gap) => {
        if (!best) return gap;
        if (gap.len > best.len) return gap;
        if (gap.len === best.len && Math.abs(gap.time - target) < Math.abs(best.time - target)) return gap;
        return best;
      }, null);
    const end = candidate ? candidate.time : Math.min(duration, target);
    windows.push({ start, end });
    if (end >= duration) break;
    const nextStart = Math.max(start + guardStep, end - overlapSeconds);
    if (nextStart <= start) break;
    start = nextStart;
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
  // Prefer pause-aligned windows so a 4-min slice never cuts through an ayah;
  // fall back to fixed windows when the source has no usable pauses (e.g. an
  // unbroken run-on or a very short clip).
  const silences = findSilenceCenters(buffer);
  const silenceWindows = silenceAwareWindows(buffer.duration, silences);
  const windows = silenceWindows.length > 0
    ? silenceWindows
    : bulkRecognitionWindows(buffer.duration);
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
