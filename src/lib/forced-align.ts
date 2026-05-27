// Forced alignment for imported recitation: we already KNOW the exact verse text,
// so instead of open ASR + fuzzy timing we align the decoded transcript (which
// carries per-character CTC frame times) to the known verse text and read off a
// real acoustic timestamp for each verse boundary. Works even with no pauses.

import { VerseTiming } from "./audio-import";
import { normalizeArabicTimed, getVersesText } from "./verse-match";

const MIN_DUR = 0.12;

export interface ForceAlignInput {
  hypText: string;
  hypCharTimes: number[];
  surah: number;
  verseNumbers: number[]; // contiguous lo..hi
  audioDuration: number;
}

/**
 * Char-level global alignment (Needleman–Wunsch) of the decoded transcript to the
 * known verse text, returning one timing per verse. Returns null if alignment
 * isn't usable (caller should fall back to pause-based segmentation).
 */
export function forceAlignVerses(input: ForceAlignInput): VerseTiming[] | null {
  const { hypText, hypCharTimes, surah, verseNumbers, audioDuration } = input;
  if (verseNumbers.length === 0) return null;
  const lo = verseNumbers[0];
  const hi = verseNumbers[verseNumbers.length - 1];
  // Only the contiguous case maps cleanly onto getVersesText(lo..hi).
  if (hi - lo + 1 !== verseNumbers.length) return null;

  const hyp = normalizeArabicTimed(hypText, hypCharTimes);
  const ref = getVersesText(surah, lo, hi);
  const a = ref.text; // reference chars (incl. single spaces)
  const b = hyp.text; // hypothesis chars
  const n = a.length;
  const m = b.length;
  if (n === 0 || m < 2) return null;

  // ---- Needleman–Wunsch (match +2, mismatch -1, gap -1) ----
  const MATCH = 2;
  const MIS = -1;
  const GAP = -1;
  const cols = m + 1;
  const dp = new Float64Array((n + 1) * cols);
  const tb = new Int8Array((n + 1) * cols); // 0=diag, 1=up(ref deletion), 2=left(hyp insertion)
  for (let j = 0; j <= m; j++) {
    dp[j] = j * GAP;
    tb[j] = 2;
  }
  for (let i = 0; i <= n; i++) {
    dp[i * cols] = i * GAP;
    tb[i * cols] = 1;
  }
  tb[0] = 0;
  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    const base = i * cols;
    const prevBase = (i - 1) * cols;
    for (let j = 1; j <= m; j++) {
      const diag = dp[prevBase + (j - 1)] + (ai === b[j - 1] ? MATCH : MIS);
      const up = dp[prevBase + j] + GAP;
      const left = dp[base + (j - 1)] + GAP;
      let best = diag;
      let t = 0;
      if (up > best) {
        best = up;
        t = 1;
      }
      if (left > best) {
        best = left;
        t = 2;
      }
      dp[base + j] = best;
      tb[base + j] = t;
    }
  }

  // Traceback → aligned hyp index per ref char (-1 if the ref char was deleted).
  const refToHyp = new Int32Array(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const t = tb[i * cols + j];
    if (t === 0) {
      refToHyp[i - 1] = j - 1;
      i--;
      j--;
    } else if (t === 1) {
      i--;
    } else {
      j--;
    }
  }

  // refTime per ref char, interpolating across deletions.
  const refTime = new Array<number>(n).fill(NaN);
  for (let k = 0; k < n; k++) {
    const h = refToHyp[k];
    if (h >= 0) refTime[k] = hyp.times[h];
  }
  let firstKnown = -1;
  let lastKnown = -1;
  for (let k = 0; k < n; k++) {
    if (!Number.isNaN(refTime[k])) {
      if (firstKnown < 0) firstKnown = k;
      lastKnown = k;
    }
  }
  if (firstKnown < 0) return null;
  for (let k = 0; k < firstKnown; k++) refTime[k] = refTime[firstKnown];
  for (let k = lastKnown + 1; k < n; k++) refTime[k] = refTime[lastKnown];
  let k = firstKnown;
  while (k < lastKnown) {
    if (!Number.isNaN(refTime[k + 1])) {
      k++;
      continue;
    }
    let g = k + 1;
    while (Number.isNaN(refTime[g])) g++;
    const t0 = refTime[k];
    const t1 = refTime[g];
    for (let x = k + 1; x < g; x++) refTime[x] = t0 + (t1 - t0) * ((x - k) / (g - k));
    k = g;
  }

  // Verse start = time of its first reference char; keep monotonic.
  const starts = ref.ranges.map((r) => refTime[r.start] ?? 0);
  for (let x = 1; x < starts.length; x++) {
    if (starts[x] < starts[x - 1]) starts[x] = starts[x - 1];
  }

  const end = Math.max(0.5, audioDuration);
  const timings: VerseTiming[] = verseNumbers.map((vnum, idx) => ({
    verseNumber: vnum,
    start: Math.max(0, Math.min(starts[idx], end)),
    end: idx < verseNumbers.length - 1 ? starts[idx + 1] : end,
  }));
  // Enforce ordering + a minimum duration.
  for (let x = 0; x < timings.length; x++) {
    if (x > 0 && timings[x].start < timings[x - 1].end) timings[x].start = timings[x - 1].end;
    if (timings[x].end < timings[x].start + MIN_DUR) timings[x].end = Math.min(end, timings[x].start + MIN_DUR);
  }
  return timings;
}
