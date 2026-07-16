import type { Emissions, Transcription } from "./asr";

const MIN_LEADING_GAP_SECONDS = 1.2;
const PRE_ROLL_SECONDS = 0.35;
const MIN_REMAINING_AUDIO_SECONDS = 3;

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
