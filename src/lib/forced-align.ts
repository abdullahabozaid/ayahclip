// Hybrid forced alignment for imported recitation. We already KNOW the exact
// verse text, so we independently align (1) the timestamped greedy transcript
// and (2) the model's full per-frame acoustic emissions. A strong transcript is
// preferred because it is less prone to Viterbi jumps between similar phrases;
// emission-level CTC remains the fallback for noisy greedy decodes.
//
// Pipeline: emissions (asr.computeEmissions) → marginalize onto the skeleton
// alphabet (ctc-vocab) → tokenize the reference verses → CTC Viterbi alignment
// (ctc-align) → assemble VerseTiming[] (silence-snap + fade-in offset).

import { VerseTiming } from "./audio-import";
import { getVersesText, normalizeArabic } from "./verse-match";
import {
  buildSkeletonVocab,
  tokenizeSkeletonVerses,
  marginalizeEmissions,
} from "./ctc-vocab";
import { ctcForcedAlign } from "./ctc-align";
import type { Emissions } from "./asr";
import { alignTranscriptVerses } from "./transcript-align";

const MIN_DUR = 0.12;
// A forced-aligned boundary snaps to a detected pause center within this window.
const SNAP_WINDOW = 0.4;
const FUSION_DISAGREEMENT_SECONDS = 0.45;
const FUSION_PAUSE_WINDOW_SECONDS = 0.16;
const FUSION_MIN_PAUSE_SECONDS = 0.18;

export interface ForceAlignInput {
  emissions: Emissions;
  surah: number;
  verseNumbers: number[]; // contiguous lo..hi
  audioDuration: number;
  /** First non-silent sample in the clip, so alignment never trims the opening. */
  audioStart?: number;
  /** Detected pauses (center time + length, seconds) to snap clean cuts to. */
  silences?: { time: number; len: number }[];
}

export interface AlignmentDiagnostics {
  timings: VerseTiming[];
  method: "transcript" | "ctc" | "hybrid";
  transcriptSimilarity: number | null;
  /** Mean absolute difference between the two independent boundary methods. */
  methodAgreementSeconds: number | null;
  boundaryDiagnostics: BoundaryDiagnostic[];
}

export interface FusedAlignment {
  timings: VerseTiming[];
  usedCtcBoundaries: number[];
}

/**
 * Fuse independent transcript and acoustic timing one boundary at a time.
 * Repeated Quran phrases can make the text alignment jump to the wrong refrain;
 * when that happens, prefer CTC only if a strong real pause supports the CTC
 * cut and does not equally support the transcript cut. Run-on recitation has no
 * such pause evidence, so its accurate transcript boundary remains untouched.
 */
export function fuseAlignmentTimings(params: {
  transcriptTimings: readonly VerseTiming[];
  ctcTimings: readonly VerseTiming[];
  silences?: readonly { time: number; len: number }[];
}): FusedAlignment {
  const timings = params.transcriptTimings.map((timing) => ({ ...timing }));
  const usedCtcBoundaries: number[] = [];
  const silences = (params.silences ?? []).filter(
    (silence) => silence.len >= FUSION_MIN_PAUSE_SECONDS
  );
  const pauseDistance = (time: number) => silences.reduce(
    (best, silence) => Math.min(best, Math.abs(silence.time - time)),
    Infinity
  );

  const count = Math.min(timings.length, params.ctcTimings.length);
  for (let index = 1; index < count; index++) {
    const transcriptBoundary = timings[index].start;
    const ctcBoundary = params.ctcTimings[index].start;
    const disagreement = Math.abs(transcriptBoundary - ctcBoundary);
    const ctcPauseDistance = pauseDistance(ctcBoundary);
    const transcriptPauseDistance = pauseDistance(transcriptBoundary);
    const ctcHasDistinctPauseEvidence =
      ctcPauseDistance <= FUSION_PAUSE_WINDOW_SECONDS &&
      transcriptPauseDistance >= ctcPauseDistance + FUSION_PAUSE_WINDOW_SECONDS;

    if (disagreement >= FUSION_DISAGREEMENT_SECONDS && ctcHasDistinctPauseEvidence) {
      timings[index - 1].end = ctcBoundary;
      timings[index].start = ctcBoundary;
      usedCtcBoundaries.push(timings[index].verseNumber);
    }
  }
  return { timings, usedCtcBoundaries };
}

export interface BoundaryDiagnostic {
  verseNumber: number;
  agreementSeconds: number | null;
  confidence: "high" | "medium" | "low";
}

export function classifyBoundaryConfidence(
  transcriptSimilarity: number | null,
  agreementSeconds: number | null
): BoundaryDiagnostic["confidence"] {
  if (transcriptSimilarity === null || agreementSeconds === null) return "low";
  if (transcriptSimilarity >= 0.85 && agreementSeconds <= 0.35) return "high";
  if (transcriptSimilarity >= 0.65 && agreementSeconds <= 0.8) return "medium";
  return "low";
}

export function refineTranscriptCuts(params: {
  timings: VerseTiming[];
  silences?: { time: number; len: number }[];
  audioStart?: number;
}): VerseTiming[] {
  const timings = params.timings.map((timing) => ({ ...timing }));
  if (timings.length === 0) return timings;
  if (params.audioStart !== undefined) {
    timings[0].start = Math.max(0, Math.min(params.audioStart, timings[0].end - MIN_DUR));
  }
  const silences = params.silences ?? [];
  // Transcript timestamps mark acoustic onsets. For an editable cut we want the
  // nearest pause immediately BEFORE that onset, preserving the reciter's first
  // consonant and any natural breath without jumping to a later internal pause.
  for (let index = 1; index < timings.length; index++) {
    const onset = timings[index].start;
    let best = -1;
    let bestDistance = 1.6;
    for (const silence of silences) {
      if (silence.time >= onset || silence.time <= timings[index - 1].start + MIN_DUR) continue;
      const distance = onset - silence.time;
      // Short intra-verse hesitations are common in run-on recitation and must
      // not become verse cuts. The farther a pause is from the recognised onset,
      // the stronger/longer it must be before it can override that onset.
      if (silence.len < Math.max(0.22, distance * 0.35)) continue;
      if (distance < bestDistance) {
        best = silence.time;
        bestDistance = distance;
      }
    }
    if (best >= 0) {
      timings[index - 1].end = best;
      timings[index].start = best;
    }
  }
  return timings;
}

/**
 * Turn per-verse recitation onsets + ends into final VerseTiming[]. Pure (numbers
 * in, numbers out) so the snap + fade-in + monotonic logic is unit-testable
 * without the model. `onsets[i]`/`recEnds[i]` are the acoustic start/end of verse
 * i's recitation; they must be non-decreasing onsets.
 */
export function assembleTimings(params: {
  onsets: number[];
  recEnds: number[];
  verseNumbers: number[];
  audioDuration: number;
  silences?: { time: number; len: number }[];
}): VerseTiming[] {
  const { verseNumbers, audioDuration } = params;
  const n = verseNumbers.length;
  const end = Math.max(0.5, audioDuration);
  const silences = params.silences ?? [];

  const onset = params.onsets.slice();
  const recEnd = params.recEnds.slice();

  // Snap each verse onset (i>0) to a nearby pause center for a clean cut, without
  // crossing the previous verse's recitation end or this verse's own recitation.
  // The fade-in lead is NOT applied here — that's a render concern (the display
  // leads the audio by the intro duration), so alignment produces clean
  // onset-to-onset boundaries and the renderer presents the fade.
  for (let i = 1; i < n; i++) {
    let best = -1;
    let bestDist = SNAP_WINDOW;
    for (const s of silences) {
      if (s.time <= recEnd[i - 1] || s.time >= recEnd[i]) continue;
      const d = Math.abs(s.time - onset[i]);
      if (d < bestDist) {
        bestDist = d;
        best = s.time;
      }
    }
    if (best >= 0) onset[i] = best;
  }

  // Contiguous ends; last verse runs to the clip end.
  const timings: VerseTiming[] = verseNumbers.map((vnum, i) => ({
    verseNumber: vnum,
    start: Math.max(0, Math.min(onset[i], end)),
    end: i < n - 1 ? onset[i + 1] : end,
  }));

  // Enforce ordering + a minimum duration (mirrors the previous aligner).
  for (let i = 0; i < n; i++) {
    if (i > 0 && timings[i].start < timings[i - 1].end) timings[i].start = timings[i - 1].end;
    if (timings[i].end < timings[i].start + MIN_DUR) {
      timings[i].end = Math.min(end, timings[i].start + MIN_DUR);
    }
  }
  return timings;
}

/**
 * Align the known verses of `surah` (contiguous lo..hi) onto the audio emissions.
 * Returns one VerseTiming per verse, or null if alignment isn't usable (caller
 * should fall back to pause-based segmentation).
 */
export function forceAlignVersesDetailed(input: ForceAlignInput): AlignmentDiagnostics | null {
  const { emissions, surah, verseNumbers, audioDuration } = input;
  if (verseNumbers.length === 0) return null;
  const lo = verseNumbers[0];
  const hi = verseNumbers[verseNumbers.length - 1];
  if (hi - lo + 1 !== verseNumbers.length) return null;

  // Reference: each verse's diacritic-free skeleton text.
  const ref = getVersesText(surah, lo, hi);
  const verseSkeletons = ref.ranges.map((r) =>
    normalizeArabic(ref.text.slice(r.start, r.end))
  );

  const sv = buildSkeletonVocab(emissions.vocab);
  const { ids, verseStart } = tokenizeSkeletonVerses(verseSkeletons, sv);
  if (ids.length < 2) return null;

  const reduced = marginalizeEmissions(
    emissions.logProbs,
    emissions.T,
    emissions.V,
    sv
  );
  const aligned = ctcForcedAlign(reduced, emissions.T, sv.size, ids, sv.blankId);
  if (!aligned) return null;

  const fd = emissions.frameDur;
  const timeOffset = emissions.timeOffset ?? 0;
  const tokens = aligned.tokens;
  // Per-verse recitation onset = first token's start; end = last token's end.
  const onsets: number[] = [];
  const recEnds: number[] = [];
  for (let v = 0; v < verseNumbers.length; v++) {
    const first = verseStart[v];
    const lastTok = (v < verseNumbers.length - 1 ? verseStart[v + 1] : ids.length) - 1;
    const startFrame = tokens[first]?.startFrame ?? 0;
    const endFrame = tokens[Math.max(first, lastTok)]?.endFrame ?? startFrame;
    onsets.push(timeOffset + startFrame * fd);
    recEnds.push(timeOffset + (endFrame + 1) * fd);
  }
  // Onsets must be non-decreasing for the assembler.
  for (let v = 1; v < onsets.length; v++) {
    if (onsets[v] < onsets[v - 1]) onsets[v] = onsets[v - 1];
    if (recEnds[v] < onsets[v]) recEnds[v] = onsets[v];
  }

  const ctcTimings = assembleTimings({
    onsets,
    recEnds,
    verseNumbers,
    audioDuration,
    silences: input.silences,
  });

  // A greedy transcript and the full emission matrix fail differently. When
  // the transcript agrees well with the exact Quran reference, its character
  // timestamps are substantially less prone to CTC Viterbi jumps between
  // acoustically similar phrases. Keep emission alignment as the fallback for
  // noisy clips where the greedy decode is not trustworthy.
  const transcript = emissions.transcription;
  if (transcript) {
    const alternative = alignTranscriptVerses({
      text: transcript.text,
      charTimes: transcript.charTimes,
      surah,
      verseNumbers,
      audioDuration,
    });
    if (alternative) {
      const comparable = Math.min(ctcTimings.length, alternative.timings.length);
      const disagreement = comparable > 1
        ? ctcTimings.slice(1, comparable).reduce(
          (sum, timing, index) => sum + Math.abs(timing.start - alternative.timings[index + 1].start),
          0
        ) / (comparable - 1)
        : 0;
      const boundaryDiagnostics = ctcTimings.map((timing, index) => {
        const boundaryAgreement = alternative.timings[index]
          ? Math.abs(timing.start - alternative.timings[index].start)
          : null;
        return {
          verseNumber: timing.verseNumber,
          agreementSeconds: boundaryAgreement,
          confidence: classifyBoundaryConfidence(alternative.similarity, boundaryAgreement),
        };
      });
      if (alternative.similarity >= 0.65) {
        const transcriptTimings = refineTranscriptCuts({
          timings: alternative.timings,
          silences: input.silences,
          audioStart: input.audioStart,
        });
        const fused = fuseAlignmentTimings({
          transcriptTimings,
          ctcTimings,
          silences: input.silences,
        });
        return {
          timings: fused.timings.map((timing, index) => ({
            ...timing,
            alignedWordStarts: alternative.wordStartsByVerse[index]?.map(
              (time) => Math.max(timing.start, Math.min(timing.end, time)),
            ),
            wordRange: (() => {
              const range = alternative.recitedWordRangesByVerse[index];
              const total = alternative.wordStartsByVerse[index]?.length ?? 0;
              if (!range || total === 0 || (range.from === 0 && range.to === total - 1)) return undefined;
              return { ...range };
            })(),
          })),
          method: fused.usedCtcBoundaries.length ? "hybrid" : "transcript",
          transcriptSimilarity: alternative.similarity,
          methodAgreementSeconds: disagreement,
          boundaryDiagnostics,
        };
      }
      return {
        timings: ctcTimings,
        method: "ctc",
        transcriptSimilarity: alternative.similarity,
        methodAgreementSeconds: disagreement,
        boundaryDiagnostics,
      };
    }
  }
  return {
    timings: ctcTimings,
    method: "ctc",
    transcriptSimilarity: null,
    methodAgreementSeconds: null,
    boundaryDiagnostics: ctcTimings.map((timing) => ({
      verseNumber: timing.verseNumber,
      agreementSeconds: null,
      confidence: "low",
    })),
  };
}

export function forceAlignVerses(input: ForceAlignInput): VerseTiming[] | null {
  return forceAlignVersesDetailed(input)?.timings ?? null;
}
