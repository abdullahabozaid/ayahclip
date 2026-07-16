// Forced alignment for imported recitation. We already KNOW the exact verse text,
// so we align that text directly onto the model's per-frame acoustic emissions
// (true CTC forced alignment) rather than fuzzy-matching a free decode. This
// places a real acoustic onset on every verse — including verses recited with NO
// pause between them, which silence detection alone cannot resolve.
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

export interface ForceAlignInput {
  emissions: Emissions;
  surah: number;
  verseNumbers: number[]; // contiguous lo..hi
  audioDuration: number;
  /** Detected pauses (center time + length, seconds) to snap clean cuts to. */
  silences?: { time: number; len: number }[];
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
export function forceAlignVerses(input: ForceAlignInput): VerseTiming[] | null {
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
  const tokens = aligned.tokens;
  // Per-verse recitation onset = first token's start; end = last token's end.
  const onsets: number[] = [];
  const recEnds: number[] = [];
  for (let v = 0; v < verseNumbers.length; v++) {
    const first = verseStart[v];
    const lastTok = (v < verseNumbers.length - 1 ? verseStart[v + 1] : ids.length) - 1;
    const startFrame = tokens[first]?.startFrame ?? 0;
    const endFrame = tokens[Math.max(first, lastTok)]?.endFrame ?? startFrame;
    onsets.push(startFrame * fd);
    recEnds.push((endFrame + 1) * fd);
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
    if (alternative && alternative.similarity >= 0.65) return alternative.timings;
  }
  return ctcTimings;
}
