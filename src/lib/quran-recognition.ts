import type { Emissions } from "./asr";
import {
  autoSegment,
  findSilenceCenters,
  findSpeechSpan,
  resampleTo16kMono,
  type VerseTiming,
} from "./audio-import";
import {
  buildAlignmentReview,
  type AlignmentReview,
} from "./alignment-feedback";
import { attachAlignmentDiagnostics } from "./deep-align";
import { forceAlignVersesDetailed } from "./forced-align";
import { recognitionDurationError } from "./import-limits";
import {
  leadingRecognitionRetryOffset,
  offsetEmissions,
  recognitionTranscriptWindows,
} from "./recognition-retry";
import type { RecognitionProgress } from "./recognition-progress";
import {
  assessVerseMatch,
  getVerseWeights,
  hasCompetingRecognitionWindow,
  loadCorpus,
  recoverLeadingVerse,
  recoverRecognitionWindowCandidates,
  selectRecognitionCandidates,
  type VerseMatch,
} from "./verse-match";

export interface QuranRecognitionResult {
  transcript: string;
  ref: string;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  timings: VerseTiming[];
  method: "transcript" | "ctc" | "hybrid" | "pause";
  confidence: "high" | "medium" | "selected";
  review: AlignmentReview;
}

export interface QuranRecognitionCandidate extends Omit<QuranRecognitionResult, "confidence"> {
  key: string;
}

export type QuranRecognitionOutcome =
  | { kind: "matched"; result: QuranRecognitionResult }
  | { kind: "ambiguous"; candidates: QuranRecognitionCandidate[]; message: string }
  | { kind: "none"; message: string };

type ComputeEmissions = (
  audio: Float32Array,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) => Promise<Emissions>;

interface SurahReference {
  id: number;
  name_simple: string;
}

export interface RecognizeQuranPassageOptions {
  buffer: AudioBuffer;
  surahs: readonly SurahReference[];
  deviceMemoryGb?: number;
  signal?: AbortSignal;
  onProgress?: (progress: RecognitionProgress) => void;
  computeEmissions?: ComputeEmissions;
}

const confidenceRank = { low: 0, medium: 1, high: 2 } as const;

export function shouldUseRetryAssessment(
  current: { confidence: keyof typeof confidenceRank; score: number },
  retry: { confidence: keyof typeof confidenceRank; score: number },
): boolean {
  return confidenceRank[retry.confidence] > confidenceRank[current.confidence]
    || (retry.confidence === current.confidence && retry.score > current.score);
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Recognition cancelled");
  error.name = "AbortError";
  throw error;
}

/**
 * One passage-recognition pipeline for browser imports and the iOS shared
 * editor. Media never leaves the device: only the bundled ONNX model and Quran
 * index are loaded, then matching and forced alignment run locally.
 */
export async function recognizeQuranPassage(
  options: RecognizeQuranPassageOptions,
): Promise<QuranRecognitionOutcome> {
  const { buffer, surahs, deviceMemoryGb, signal, onProgress } = options;
  const durationError = recognitionDurationError(buffer.duration, deviceMemoryGb);
  if (durationError) throw new RangeError(durationError);
  abortIfNeeded(signal);

  onProgress?.({ stage: "prepare", detail: "Loading the Quran verse index" });
  await loadCorpus();
  abortIfNeeded(signal);
  onProgress?.({ stage: "prepare", detail: "Preparing audio for local recognition" });
  const audio = await resampleTo16kMono(buffer);
  abortIfNeeded(signal);
  onProgress?.({ stage: "listen", detail: "Loading the local recognition model" });
  const compute = options.computeEmissions
    ?? (await import("./asr")).computeEmissions;
  let emissions = await compute(audio, (loaded, total) => {
    onProgress?.(total
      ? {
        stage: "listen",
        detail: "Downloading the local recognition model",
        percent: Math.round((loaded / total) * 100),
        loadedBytes: loaded,
        totalBytes: total,
      }
      : { stage: "listen", detail: "Listening to the recitation locally" });
  }, signal);
  abortIfNeeded(signal);

  let transcript = emissions.transcription.text;
  onProgress?.({ stage: "match", detail: "Matching the transcript to the Quran" });
  let assessment = assessVerseMatch(transcript);
  const retryOffset = assessment.confidence === "low"
    ? leadingRecognitionRetryOffset(emissions.transcription, audio.length / 16_000)
    : null;
  if (retryOffset !== null) {
    onProgress?.({ stage: "listen", detail: "Retrying after a non-recitation introduction" });
    const retrySamples = Math.round(retryOffset * 16_000);
    const retryEmissions = offsetEmissions(
      await compute(audio.subarray(retrySamples), undefined, signal),
      retryOffset,
    );
    onProgress?.({ stage: "match", detail: "Matching the retried transcript to the Quran" });
    const retryAssessment = assessVerseMatch(retryEmissions.transcription.text);
    if (shouldUseRetryAssessment(
      { confidence: assessment.confidence, score: assessment.match?.score ?? 0 },
      { confidence: retryAssessment.confidence, score: retryAssessment.match?.score ?? 0 },
    )) {
      emissions = retryEmissions;
      transcript = retryEmissions.transcription.text;
      assessment = retryAssessment;
    }
  }

  const speechSpan = findSpeechSpan(buffer);
  const silences = findSilenceCenters(buffer);
  const initialMatch = assessment.match;
  const recovery = initialMatch
    ? recoverLeadingVerse(initialMatch, emissions.transcription.charTimes[0], speechSpan.start)
    : null;
  const match = recovery?.match ?? null;
  const effectiveConfidence = recovery?.recovered && assessment.confidence === "high"
    ? "medium"
    : assessment.confidence;
  // A confident whole-clip transcript can still be confidently wrong when an
  // intro, repeated phrase, or decoding hallucination dominates it. Always
  // cross-check pause-bounded windows; the conflict filter deliberately ignores
  // ordinary overlapping fragments from the same passage.
  const windowCandidates = recoverRecognitionWindowCandidates(recognitionTranscriptWindows(
    emissions.transcription,
    silences,
    buffer.duration,
  ));
  const competingWindow = Boolean(
    match && hasCompetingRecognitionWindow(match, windowCandidates),
  );

  const buildResult = (candidate: VerseMatch): Omit<QuranRecognitionResult, "confidence"> => {
    const verseNumbers = Array.from(
      { length: candidate.ayahEnd - candidate.ayahStart + 1 },
      (_, index) => candidate.ayahStart + index,
    );
    const alignment = forceAlignVersesDetailed({
      emissions,
      surah: candidate.surah,
      verseNumbers,
      audioDuration: buffer.duration,
      audioStart: speechSpan.start,
      silences,
    });
    const rawTimings = alignment?.timings ?? autoSegment(
      buffer,
      verseNumbers,
      getVerseWeights(candidate.surah, candidate.ayahStart, candidate.ayahEnd),
    );
    const method = alignment?.method ?? "pause";
    const diagnostics = alignment?.boundaryDiagnostics ?? verseNumbers.map((verseNumber) => ({
      verseNumber,
      agreementSeconds: null,
      confidence: "low" as const,
    }));
    const surahName = surahs.find((item) => item.id === candidate.surah)?.name_simple
      ?? `Surah ${candidate.surah}`;
    return {
      transcript,
      ref: `${surahName} · ${candidate.ayahStart}${candidate.ayahEnd !== candidate.ayahStart ? `–${candidate.ayahEnd}` : ""}`,
      surah: candidate.surah,
      ayahStart: candidate.ayahStart,
      ayahEnd: candidate.ayahEnd,
      timings: attachAlignmentDiagnostics(rawTimings, method, diagnostics),
      method,
      review: buildAlignmentReview(method, diagnostics),
    };
  };

  if (match && effectiveConfidence !== "low" && !competingWindow) {
    onProgress?.({ stage: "align", detail: "Aligning each ayah boundary" });
    return {
      kind: "matched",
      result: { ...buildResult(match), confidence: effectiveConfidence },
    };
  }

  if (windowCandidates[0] ?? match) {
    const primary = windowCandidates[0] ?? match!;
    const uniqueMatches = selectRecognitionCandidates(primary, [
      ...windowCandidates.slice(1),
      ...(match ? [match] : []),
      ...assessment.alternatives,
    ]);
    onProgress?.({ stage: "align", detail: "Preparing likely Quran ranges" });
    return {
      kind: "ambiguous",
      candidates: uniqueMatches.map((candidate) => ({
        ...buildResult(candidate),
        key: `${candidate.surah}:${candidate.ayahStart}-${candidate.ayahEnd}`,
      })),
      message: windowCandidates.length > 0
        ? "A Quran passage was found after separating speech around a pause. Check the suggested range by ear, or enter it manually."
        : "This recitation matches several similar Quran passages. Choose the range that sounds right, or enter it manually.",
    };
  }

  return {
    kind: "none",
    message: "Couldn't confidently match this clip. Pick the verses manually below.",
  };
}
