import type { VerseTiming } from "./audio-import";
import { getVersesText, normalizeArabicTimed } from "./verse-match";

export interface TranscriptAlignInput {
  text: string;
  charTimes: number[];
  surah: number;
  verseNumbers: number[];
  audioDuration: number;
}

export interface TranscriptAlignment {
  timings: VerseTiming[];
  /** Model-derived onset of each normalized Quran word, grouped by ayah. */
  wordStartsByVerse: number[][];
  /** Normalized reference similarity: 1 is exact, 0 is unusable. */
  similarity: number;
}

/**
 * Align a timestamped greedy CTC transcript to the known Quran reference.
 * This independent path is intentionally kept alongside emission-level CTC
 * alignment: agreement gives us confidence; disagreement is a signal to show
 * alternatives or use pause evidence rather than silently trusting one method.
 */
export function alignTranscriptVerses(input: TranscriptAlignInput): TranscriptAlignment | null {
  const { text, charTimes, surah, verseNumbers, audioDuration } = input;
  if (verseNumbers.length === 0 || charTimes.length !== text.length) return null;
  const lo = verseNumbers[0];
  const hi = verseNumbers[verseNumbers.length - 1];
  if (hi - lo + 1 !== verseNumbers.length) return null;

  const hypothesis = normalizeArabicTimed(text, charTimes);
  const reference = getVersesText(surah, lo, hi);
  const a = reference.text;
  const b = hypothesis.text;
  const n = a.length;
  const m = b.length;
  if (n === 0 || m < 2) return null;

  const cols = m + 1;
  const scores = new Int32Array((n + 1) * cols);
  const trace = new Int8Array((n + 1) * cols); // 0 diag, 1 up, 2 left
  for (let j = 0; j <= m; j++) {
    scores[j] = -j;
    trace[j] = 2;
  }
  for (let i = 0; i <= n; i++) {
    scores[i * cols] = -i;
    trace[i * cols] = 1;
  }
  trace[0] = 0;
  for (let i = 1; i <= n; i++) {
    const base = i * cols;
    const previous = (i - 1) * cols;
    for (let j = 1; j <= m; j++) {
      let best = scores[previous + j - 1] + (a[i - 1] === b[j - 1] ? 2 : -1);
      let direction = 0;
      if (scores[previous + j] - 1 > best) {
        best = scores[previous + j] - 1;
        direction = 1;
      }
      if (scores[base + j - 1] - 1 > best) {
        best = scores[base + j - 1] - 1;
        direction = 2;
      }
      scores[base + j] = best;
      trace[base + j] = direction;
    }
  }

  const referenceToHypothesis = new Int32Array(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const direction = trace[i * cols + j];
    if (direction === 0) {
      referenceToHypothesis[i - 1] = j - 1;
      i--;
      j--;
    } else if (direction === 1) {
      i--;
    } else {
      j--;
    }
  }

  const times = new Array<number>(n).fill(Number.NaN);
  for (let index = 0; index < n; index++) {
    const hypothesisIndex = referenceToHypothesis[index];
    if (hypothesisIndex >= 0) times[index] = hypothesis.times[hypothesisIndex];
  }
  const known = times.flatMap((time, index) => Number.isNaN(time) ? [] : [index]);
  if (known.length === 0) return null;
  const first = known[0];
  const last = known[known.length - 1];
  for (let index = 0; index < first; index++) times[index] = times[first];
  for (let index = last + 1; index < n; index++) times[index] = times[last];
  let cursor = first;
  while (cursor < last) {
    if (!Number.isNaN(times[cursor + 1])) {
      cursor++;
      continue;
    }
    let next = cursor + 1;
    while (Number.isNaN(times[next])) next++;
    for (let index = cursor + 1; index < next; index++) {
      times[index] = times[cursor] +
        (times[next] - times[cursor]) * ((index - cursor) / (next - cursor));
    }
    cursor = next;
  }

  const starts = reference.ranges.map((range) => times[range.start] ?? 0);
  for (let index = 1; index < starts.length; index++) {
    if (starts[index] < starts[index - 1]) starts[index] = starts[index - 1];
  }
  const end = Math.max(0.5, audioDuration);
  const timings = verseNumbers.map((verseNumber, index) => ({
    verseNumber,
    start: Math.max(0, Math.min(starts[index], end)),
    end: index < verseNumbers.length - 1
      ? Math.max(starts[index] + 0.12, starts[index + 1])
      : end,
  }));
  const rawScore = scores[n * cols + m];
  const maxScore = Math.max(1, 2 * Math.max(n, m));
  const wordStartsByVerse = reference.ranges.map((range) => {
    const verseText = reference.text.slice(range.start, range.end);
    const starts: number[] = [];
    for (const match of verseText.matchAll(/\S+/g)) {
      const offset = match.index ?? 0;
      starts.push(times[range.start + offset] ?? timings[0]?.start ?? 0);
    }
    return starts;
  });
  return {
    timings,
    wordStartsByVerse,
    similarity: Math.max(0, Math.min(1, (rawScore + maxScore / 2) / (maxScore * 1.5))),
  };
}
