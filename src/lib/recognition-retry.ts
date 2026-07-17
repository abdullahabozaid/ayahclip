import type { Emissions, Transcription } from "./asr";

const MIN_LEADING_GAP_SECONDS = 1.2;
const PRE_ROLL_SECONDS = 0.35;
const MIN_REMAINING_AUDIO_SECONDS = 3;
const MIN_RECOVERY_WINDOW_WORDS = 4;
const MIN_RECOVERY_PAUSE_SECONDS = 0.18;

export interface RecognitionSilence {
  time: number;
  len: number;
}

/** Suggest a second ASR pass when the model itself heard no characters for a
 * substantial opening span. Cropping that span prevents silence/music intros
 * from skewing whole-clip feature normalization. */
export function leadingRecognitionRetryOffset(
  transcription: Transcription,
  audioDuration: number,
): number | null {
  const firstCharacter = transcription.charTimes[0];
  if (!Number.isFinite(firstCharacter) || firstCharacter < MIN_LEADING_GAP_SECONDS) return null;
  const offset = Math.max(0, firstCharacter - PRE_ROLL_SECONDS);
  return audioDuration - offset >= MIN_REMAINING_AUDIO_SECONDS ? offset : null;
}

/** Put a cropped inference pass back onto the original file timeline. */
export function offsetEmissions(emissions: Emissions, offsetSeconds: number): Emissions {
  if (offsetSeconds <= 0) return emissions;
  return {
    ...emissions,
    timeOffset: (emissions.timeOffset ?? 0) + offsetSeconds,
    transcription: {
      ...emissions.transcription,
      charTimes: emissions.transcription.charTimes.map((time) => time + offsetSeconds),
      wordStarts: emissions.transcription.wordStarts.map((time) => time + offsetSeconds),
    },
  };
}

/**
 * Build a small set of transcript windows around real audio pauses. This is
 * used only after whole-clip matching is ambiguous: spoken intros/outros can
 * otherwise dilute a clear Quran passage. Returning windows rather than a
 * new confidence claim keeps recovery candidate-only and creator-confirmed.
 */
export function recognitionTranscriptWindows(
  transcription: Transcription,
  silences: readonly RecognitionSilence[],
  audioDuration: number,
  limit = 18,
): string[] {
  const words = transcription.text.trim().split(/\s+/).filter(Boolean);
  if (
    words.length < MIN_RECOVERY_WINDOW_WORDS * 2 ||
    transcription.wordStarts.length !== words.length
  ) return [];

  const boundaryIndexes = silences
    .filter((silence) =>
      Number.isFinite(silence.time) &&
      Number.isFinite(silence.len) &&
      silence.len >= MIN_RECOVERY_PAUSE_SECONDS &&
      silence.time >= 1 &&
      audioDuration - silence.time >= 1,
    )
    .sort((left, right) => right.len - left.len || left.time - right.time)
    .map((silence) => transcription.wordStarts.findIndex((time) => time > silence.time))
    .filter((index) =>
      index >= MIN_RECOVERY_WINDOW_WORDS &&
      words.length - index >= MIN_RECOVERY_WINDOW_WORDS,
    )
    .filter((index, position, indexes) => indexes.indexOf(index) === position)
    .slice(0, 6)
    .sort((left, right) => left - right);

  const windows: string[] = [];
  const add = (start: number, end: number) => {
    if (end - start < MIN_RECOVERY_WINDOW_WORDS) return;
    const value = words.slice(start, end).join(" ");
    if (value !== transcription.text.trim() && !windows.includes(value)) windows.push(value);
  };

  for (const boundary of boundaryIndexes) {
    add(boundary, words.length);
    add(0, boundary);
  }
  for (let start = 0; start < boundaryIndexes.length; start++) {
    for (let end = start + 1; end < boundaryIndexes.length; end++) {
      add(boundaryIndexes[start], boundaryIndexes[end]);
    }
  }

  return windows.slice(0, Math.max(1, limit));
}
