import {
  autoSegment,
  findSilenceCenters,
  findSpeechSpan,
  resampleTo16kMono,
  type VerseTiming,
} from "./audio-import";
import {
  forceAlignVersesDetailed,
  type BoundaryDiagnostic,
} from "./forced-align";
import { getVerseWeights, loadCorpus } from "./verse-match";
import { recognitionDurationError } from "./import-limits";

export interface DeepAlignmentResult {
  timings: VerseTiming[];
  method: "transcript" | "ctc" | "hybrid" | "pause";
  transcriptSimilarity: number | null;
  methodAgreementSeconds: number | null;
  boundaryDiagnostics: BoundaryDiagnostic[];
}

export function attachAlignmentDiagnostics(
  timings: readonly VerseTiming[],
  method: DeepAlignmentResult["method"],
  diagnostics: readonly BoundaryDiagnostic[],
): VerseTiming[] {
  const byVerse = new Map(diagnostics.map((diagnostic) => [
    diagnostic.verseNumber,
    diagnostic,
  ]));
  return timings.map((timing) => {
    const diagnostic = byVerse.get(timing.verseNumber);
    return {
      ...timing,
      alignmentMethod: method,
      alignmentConfidence: diagnostic?.confidence ?? "low",
      alignmentAgreementSeconds: diagnostic?.agreementSeconds ?? null,
    };
  });
}

/** One shared deep-alignment pipeline for both timeline editor surfaces. */
export async function alignImportedAudio(params: {
  buffer: AudioBuffer;
  surah: number;
  verseNumbers: number[];
  onModelProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
  deviceMemoryGb?: number;
}): Promise<DeepAlignmentResult> {
  const { buffer, surah, onModelProgress, signal } = params;
  const verseNumbers = [...new Set(params.verseNumbers)].sort((a, b) => a - b);
  if (verseNumbers.length === 0) throw new Error("No verses to align");
  const durationError = recognitionDurationError(buffer.duration, params.deviceMemoryGb);
  if (durationError) throw new RangeError(durationError);
  if (signal?.aborted) {
    const error = new Error("Recognition cancelled");
    error.name = "AbortError";
    throw error;
  }

  await loadCorpus();
  if (signal?.aborted) {
    const error = new Error("Recognition cancelled");
    error.name = "AbortError";
    throw error;
  }
  const audio = await resampleTo16kMono(buffer);
  const { computeEmissions } = await import("./asr");
  const emissions = await computeEmissions(audio, onModelProgress, signal);
  const detailed = forceAlignVersesDetailed({
    emissions,
    surah,
    verseNumbers,
    audioDuration: buffer.duration,
    audioStart: findSpeechSpan(buffer).start,
    silences: findSilenceCenters(buffer),
  });
  if (detailed) {
    return {
      ...detailed,
      timings: attachAlignmentDiagnostics(
        detailed.timings,
        detailed.method,
        detailed.boundaryDiagnostics,
      ),
    };
  }

  const lo = verseNumbers[0];
  const hi = verseNumbers[verseNumbers.length - 1];
  return {
    timings: attachAlignmentDiagnostics(
      autoSegment(buffer, verseNumbers, getVerseWeights(surah, lo, hi)),
      "pause",
      verseNumbers.map((verseNumber) => ({
        verseNumber,
        agreementSeconds: null,
        confidence: "low",
      })),
    ),
    method: "pause",
    transcriptSimilarity: null,
    methodAgreementSeconds: null,
    boundaryDiagnostics: verseNumbers.map((verseNumber) => ({
      verseNumber,
      agreementSeconds: null,
      confidence: "low",
    })),
  };
}
