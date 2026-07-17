// Phase 0 imported-audio helpers: decode an uploaded file and split it into
// per-verse time ranges by detecting silence gaps. Fully client-side.

export interface VerseTiming {
  verseNumber: number;
  start: number; // seconds
  end: number; // seconds
  /**
   * Intra-verse split timestamps (seconds, absolute on the timeline) for long
   * verses. The verse's text is shown in chunks that change at each split.
   * Strictly increasing; each value must lie strictly between `start` and `end`.
   */
  splits?: number[];
  /**
   * Fixed word boundaries for each split (parallel to `splits`). Entry `i` is the
   * word index where split `i` divides the text: words `[0, splitWords[0])` are
   * part 1, `[splitWords[0], splitWords[1])` part 2, etc. Once set, dragging the
   * split time in the timeline does NOT change which words belong to each part.
   */
  splitWords?: number[];
  /** Total Arabic word count when splitWords was recorded. Used to scale
   *  boundaries proportionally when applied to translation text. */
  splitWordTotal?: number;
  /** Character-weighted split fractions (parallel to `splits`). Each value is
   *  the fraction (0-1) of Arabic characters covered by Part 1..N. Used to map
   *  splits onto translation text more accurately than word-count proportion. */
  splitCharFractions?: number[];
  /**
   * Contiguous word range to keep (0-indexed, inclusive). When set, only words
   * [from..to] of the verse are displayed and audibly kept; everything outside
   * is dropped from playback and export. Used to clip "half a verse" without
   * touching the source recitation file. Word count is taken from the verse's
   * uthmani text. When unset (default), the whole verse plays.
   */
  wordRange?: { from: number; to: number };
  /** Recognition provenance for the boundary at this ayah's start. Persisted in
   * saved projects so review markers survive a reload. */
  alignmentMethod?: "transcript" | "ctc" | "hybrid" | "pause";
  alignmentConfidence?: "high" | "medium" | "low";
  alignmentAgreementSeconds?: number | null;
  /** True after the creator has manually checked/adjusted this internal ayah
   * boundary. Kept separate from model confidence so provenance stays honest. */
  alignmentReviewed?: boolean;
}

/**
 * Compute the effective on-timeline audio bounds for a verse, applying its
 * `wordRange` if set. Returns the original `[start, end]` if unset. Words are
 * mapped proportionally to time within `[start, end]` (we don't have per-word
 * timing — that would require ASR onsets — so proportional is the honest model).
 */
export function effectiveAudioBounds(
  timing: VerseTiming,
  wordCount: number
): [number, number] {
  if (!timing.wordRange || wordCount <= 0) return [timing.start, timing.end];
  const { from, to } = timing.wordRange;
  const dur = timing.end - timing.start;
  if (dur <= 0) return [timing.start, timing.end];
  const lo = timing.start + (Math.max(0, from) / wordCount) * dur;
  const hi = timing.start + (Math.min(wordCount, to + 1) / wordCount) * dur;
  return [lo, hi];
}

/**
 * Return only the words inside `wordRange` (inclusive), or all words when the
 * range is unset. Pure text helper — works on Arabic or translation.
 */
function applyWordRange(words: string[], wordRange?: { from: number; to: number }): string[] {
  if (!wordRange) return words;
  const lo = Math.max(0, wordRange.from);
  const hi = Math.min(words.length - 1, wordRange.to);
  if (hi < lo) return words;
  return words.slice(lo, hi + 1);
}

/** Snap a translation word boundary to a nearby sentence break (. ? !) within
 *  ±5 words. Quranic Arabic waqf marks almost always correspond to sentence-
 *  ending punctuation in the translation, so this fixes the cases where pure
 *  word-count proportional under/overshoots the sentence boundary. */
export function snapToSentenceBoundary(words: string[], raw: number): number {
  const WINDOW = 5;
  let bestIdx = raw;
  let bestDist = Infinity;
  for (let b = Math.max(1, raw - WINDOW); b <= Math.min(words.length, raw + WINDOW); b++) {
    if (/[.?!]['"'"’”)\]]*$/.test(words[b - 1])) {
      const dist = Math.abs(b - raw);
      if (dist < bestDist) {
        bestIdx = b;
        bestDist = dist;
      }
    }
  }
  return bestIdx;
}

/**
 * For a verse with optional intra-verse splits, returns the slice of its text
 * that should be on-screen at time `t`. Words are divided by count proportional
 * to time within the verse — keeps it predictable without any text parsing.
 * Falls back to the full text when there are no splits or the verse is too short.
 */
export function verseTextAt(
  timing: VerseTiming,
  fullText: string,
  t: number
): string {
  const allWords = fullText.split(/\s+/).filter(Boolean);
  const kept = applyWordRange(allWords, timing.wordRange);
  const keptText = kept.join(" ");
  const splits = timing.splits;
  if (!splits || splits.length === 0) return keptText;
  if (kept.length < 2) return keptText;

  let segIdx = 0;
  for (const sp of splits) {
    if (t >= sp) segIdx++;
    else break;
  }

  // Fixed word boundaries: words are locked at split-creation time.
  const sw = timing.splitWords;
  if (sw && sw.length === splits.length) {
    const ref = timing.splitWordTotal ?? allWords.length;
    const isTranslation = allWords.length !== ref;
    const scaled = !isTranslation
      ? sw
      : sw.map((w) => snapToSentenceBoundary(allWords, Math.round((w / ref) * allWords.length)));
    const wordBounds = [0, ...scaled, allWords.length];
    const wLo = wordBounds[segIdx];
    const wHi = wordBounds[segIdx + 1];
    const range = timing.wordRange;
    const keepLo = range ? Math.max(wLo, range.from) : wLo;
    const keepHi = range ? Math.min(wHi, range.to + 1) : wHi;
    if (keepHi <= keepLo) return keptText;
    return allWords.slice(keepLo, keepHi).join(" ");
  }

  // Legacy fallback: derive words from time proportion.
  const dur = timing.end - timing.start;
  if (dur <= 0) return keptText;
  const points = [timing.start, ...splits, timing.end];
  const lo = points[segIdx];
  const hi = points[segIdx + 1];
  const wLo = Math.max(0, Math.floor(((lo - timing.start) / dur) * allWords.length));
  const wHi = Math.min(
    allWords.length,
    Math.max(wLo + 1, Math.floor(((hi - timing.start) / dur) * allWords.length))
  );
  const range = timing.wordRange;
  const keepLo = range ? Math.max(wLo, range.from) : wLo;
  const keepHi = range ? Math.min(wHi, range.to + 1) : wHi;
  if (keepHi <= keepLo) return keptText;
  return allWords.slice(keepLo, keepHi).join(" ");
}

/**
 * Returns the text of every segment in `timing` (one per split + 1). When the
 * verse has no splits the whole text is one segment. Used by the timeline UI
 * to label what each split-bounded region will actually display on-screen, so
 * users can confirm the chunking without playing through.
 */
export function verseSegments(timing: VerseTiming, fullText: string): string[] {
  const allWords = fullText.split(/\s+/).filter(Boolean);
  const kept = applyWordRange(allWords, timing.wordRange);
  const splits = timing.splits ?? [];
  if (splits.length === 0) return [kept.join(" ")];

  const sw = timing.splitWords;
  const range = timing.wordRange;
  const out: string[] = [];

  if (sw && sw.length === splits.length) {
    const ref = timing.splitWordTotal ?? allWords.length;
    const scaled = allWords.length === ref
      ? sw
      : sw.map((w) => Math.round((w / ref) * allWords.length));
    const wordBounds = [0, ...scaled, allWords.length];
    for (let i = 0; i < wordBounds.length - 1; i++) {
      const wLo = wordBounds[i];
      const wHi = wordBounds[i + 1];
      const keepLo = range ? Math.max(wLo, range.from) : wLo;
      const keepHi = range ? Math.min(wHi, range.to + 1) : wHi;
      // Preserve one entry per timed segment. Empty placeholders keep every
      // later caption attached to its original split timestamp.
      out.push(keepHi > keepLo ? allWords.slice(keepLo, keepHi).join(" ") : "");
    }
  } else {
    const dur = timing.end - timing.start;
    if (dur <= 0) return [kept.join(" ")];
    const points = [timing.start, ...splits, timing.end];
    for (let i = 0; i < points.length - 1; i++) {
      const lo = points[i];
      const hi = points[i + 1];
      const wLo = Math.max(0, Math.floor(((lo - timing.start) / dur) * allWords.length));
      const wHi = Math.min(
        allWords.length,
        Math.max(wLo + 1, Math.floor(((hi - timing.start) / dur) * allWords.length))
      );
      const keepLo = range ? Math.max(wLo, range.from) : wLo;
      const keepHi = range ? Math.min(wHi, range.to + 1) : wHi;
      out.push(keepHi > keepLo ? allWords.slice(keepLo, keepHi).join(" ") : "");
    }
  }
  return out.some(Boolean) ? out : [kept.join(" ")];
}

/**
 * Build per-verse timings by splitting [start, end] proportionally to each verse's
 * weight (text length). If `snapPoints` (e.g. ASR word onsets) are given, each internal
 * boundary snaps to the nearest onset within `snapTol` seconds for audio-aligned cuts.
 *
 * Every verse is guaranteed at least `minDur` seconds: a very short leading verse
 * (e.g. the disconnected letters "الم", which are text-tiny but recited long) must
 * never collapse to zero, and snapping can never pull a boundary onto/behind the
 * previous one — otherwise that verse gets skipped entirely during playback.
 */
export function proportionalTimings(
  verseNumbers: number[],
  weights: number[],
  start: number,
  end: number,
  snapPoints?: number[],
  snapTol = 1.2
): VerseTiming[] {
  const n = verseNumbers.length;
  const span = Math.max(0.001, end - start);
  const totalW = weights.reduce((a, b) => a + b, 0) || n;
  // Each verse gets at least this long, but never starve the clip when there are many.
  const minDur = Math.min(0.5, span / (n * 4));

  // Nearest onset to `t`, but never one at/behind `lower` (would collapse the verse).
  const snap = (t: number, lower: number): number => {
    if (!snapPoints || snapPoints.length === 0) return t;
    let best = t;
    let bestD = snapTol;
    for (const p of snapPoints) {
      if (p <= lower) continue;
      const d = Math.abs(p - t);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };

  const bounds: number[] = [start];
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    acc += weights[i] / totalW;
    const prev = bounds[i];
    const floor = prev + minDur; // this boundary must clear the previous verse's minimum
    let b = snap(Math.max(start + span * acc, floor), prev);
    if (b < floor) b = floor;
    // Leave room for the verses still to come so they each clear minDur too.
    const remaining = n - 1 - i;
    const ceil = end - remaining * minDur;
    if (b > ceil) b = ceil;
    bounds.push(b);
  }
  bounds.push(end);
  // keep monotonic
  for (let i = 1; i < bounds.length; i++) {
    if (bounds[i] < bounds[i - 1]) bounds[i] = bounds[i - 1];
  }
  return verseNumbers.map((num, i) => ({ verseNumber: num, start: bounds[i], end: bounds[i + 1] }));
}

/** Decode an uploaded audio OR video file's audio track to an AudioBuffer.
 *  decodeAudioData handles mp3/m4a/wav and, in Chromium/Safari, the AAC track
 *  inside many mp4 files. Throws if the browser can't decode it. */
export async function decodeAudioFile(file: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close();
  }
}

/** Resample an AudioBuffer to 16 kHz mono Float32 (what the ASR model expects). */
export async function resampleTo16kMono(buffer: AudioBuffer): Promise<Float32Array> {
  const frames = Math.ceil(buffer.duration * 16000);
  const Ctx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const offline = new Ctx(1, frames, 16000);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

/** Mono mix of the buffer as a Float32Array. */
function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += data[i];
  }
  for (let i = 0; i < len; i++) out[i] /= buffer.numberOfChannels;
  return out;
}

/**
 * Centres (and lengths) of every significant internal silence gap, by RMS energy.
 * These are the points where a reciter pauses — i.e. the most likely verse breaks.
 */
export function findSilenceCenters(buffer: AudioBuffer): { time: number; len: number }[] {
  const data = toMono(buffer);
  const sr = buffer.sampleRate;
  const winSize = Math.max(1, Math.floor(sr * 0.03)); // 30ms windows
  const winCount = Math.floor(data.length / winSize);
  if (winCount === 0) return [];

  const rms = new Float32Array(winCount);
  let peak = 0;
  for (let w = 0; w < winCount; w++) {
    let sum = 0;
    const base = w * winSize;
    for (let i = 0; i < winSize; i++) {
      const s = data[base + i];
      sum += s * s;
    }
    const val = Math.sqrt(sum / winSize);
    rms[w] = val;
    if (val > peak) peak = val;
  }
  if (peak === 0) return [];

  const threshold = peak * 0.08;
  const winDur = winSize / sr;
  const runs: { start: number; end: number }[] = [];
  let runStart = -1;
  for (let w = 0; w < winCount; w++) {
    const silent = rms[w] < threshold;
    if (silent && runStart < 0) runStart = w;
    if (!silent && runStart >= 0) {
      runs.push({ start: runStart, end: w });
      runStart = -1;
    }
  }
  if (runStart >= 0) runs.push({ start: runStart, end: winCount });

  const minGapWins = Math.max(2, Math.floor(0.12 / winDur)); // >=120ms
  return runs
    .filter((r) => r.start > 0 && r.end < winCount && r.end - r.start >= minGapWins)
    .map((r) => ({ time: ((r.start + r.end) / 2) * winDur, len: (r.end - r.start) * winDur }));
}

/**
 * Segment the spoken span into one block per verse by cutting on the recitation's
 * real pauses. For each verse boundary we take the strongest (longest) pause near
 * its text-proportional expected position, enforcing order + a minimum gap so
 * boundaries never collapse onto one spot ("three verses on one word"). Falls back
 * to the proportional position only when no pause is available in that window.
 */
export function autoSegment(
  buffer: AudioBuffer,
  verseNumbers: number[],
  weights: number[]
): VerseTiming[] {
  const n = verseNumbers.length;
  const span = findSpeechSpan(buffer);
  const start = span.start;
  const end = Math.max(start + 0.5, span.end);
  if (n <= 1) return verseNumbers.map((v) => ({ verseNumber: v, start, end }));

  const spanLen = end - start;
  const totalW = weights.reduce((a, b) => a + b, 0) || n;

  // Text-proportional expected boundary positions.
  const expected: number[] = [];
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    acc += weights[i];
    expected.push(start + spanLen * (acc / totalW));
  }

  const pauses = findSilenceCenters(buffer).sort((a, b) => a.time - b.time);
  const maxLen = pauses.reduce((m, p) => Math.max(m, p.len), 0.001);
  const minGap = Math.min(0.4, spanLen / (n * 3));

  const boundaries: number[] = [];
  let lastT = start;
  for (let k = 0; k < n - 1; k++) {
    const exp = expected[k];
    const win = Math.max(1.2, spanLen * (weights[k] / totalW) * 0.9); // wider for longer verses
    const lo = lastT + minGap;
    const hi = end - (n - 1 - k) * minGap; // leave room for the rest
    let best: { t: number; score: number } | null = null;
    for (const p of pauses) {
      if (p.time < lo || p.time > hi || Math.abs(p.time - exp) > win) continue;
      const score = p.len / maxLen - (Math.abs(p.time - exp) / win) * 0.6;
      if (!best || score > best.score) best = { t: p.time, score };
    }
    const t = best ? best.t : Math.min(hi, Math.max(lo, exp));
    boundaries.push(t);
    lastT = t;
  }

  const bounds = [start, ...boundaries, end];
  for (let i = 1; i < bounds.length; i++) {
    if (bounds[i] < bounds[i - 1] + 0.01) bounds[i] = bounds[i - 1] + 0.01;
  }
  return verseNumbers.map((v, i) => ({ verseNumber: v, start: bounds[i], end: bounds[i + 1] }));
}

/** First and last times the audio rises above silence — the spoken span, with
 *  leading/trailing silence trimmed off. */
export function findSpeechSpan(buffer: AudioBuffer): { start: number; end: number } {
  const data = toMono(buffer);
  const sr = buffer.sampleRate;
  const winSize = Math.max(1, Math.floor(sr * 0.03));
  const winCount = Math.floor(data.length / winSize);
  if (winCount === 0) return { start: 0, end: buffer.duration };

  const rms = new Float32Array(winCount);
  let peak = 0;
  for (let w = 0; w < winCount; w++) {
    let sum = 0;
    const base = w * winSize;
    for (let i = 0; i < winSize; i++) {
      const s = data[base + i];
      sum += s * s;
    }
    const val = Math.sqrt(sum / winSize);
    rms[w] = val;
    if (val > peak) peak = val;
  }
  if (peak === 0) return { start: 0, end: buffer.duration };

  const threshold = peak * 0.08;
  const winDur = winSize / sr;
  let first = 0;
  let last = winCount - 1;
  while (first < winCount && rms[first] < threshold) first++;
  while (last > first && rms[last] < threshold) last--;
  return {
    start: Math.max(0, first * winDur),
    end: Math.min(buffer.duration, (last + 1) * winDur),
  };
}

/**
 * Nudge each *contiguous* verse boundary onto the nearest strong pause (within
 * `windowSec`), so the auto-split lands on real audio breaks instead of a text-
 * length estimate. Gaps the user has opened are left alone; min duration kept.
 */
export function refineBoundariesByEnergy(
  buffer: AudioBuffer,
  timings: VerseTiming[],
  windowSec = 2.5
): VerseTiming[] {
  if (timings.length < 2) return timings;
  const centers = findSilenceCenters(buffer);
  if (centers.length === 0) return timings;

  const next = timings.map((t) => ({ ...t }));
  for (let i = 0; i < next.length - 1; i++) {
    if (Math.abs(next[i].end - next[i + 1].start) > 0.05) continue; // skip user gaps
    const boundary = next[i].end;
    let best: { time: number; len: number } | null = null;
    for (const c of centers) {
      if (Math.abs(c.time - boundary) > windowSec) continue;
      if (!best || c.len > best.len) best = c;
    }
    if (!best) continue;
    const lo = next[i].start + 0.15;
    const hi = next[i + 1].end - 0.15;
    const nb = Math.min(hi, Math.max(lo, best.time));
    next[i].end = nb;
    next[i + 1].start = nb;
  }
  return next;
}

/**
 * Split `buffer` into `count` consecutive segments by cutting at the `count-1`
 * longest internal silence gaps. Falls back to an even split if silence
 * detection can't find enough gaps. Returns one timing per verse number.
 */
export function splitBySilence(
  buffer: AudioBuffer,
  verseNumbers: number[]
): VerseTiming[] {
  const count = verseNumbers.length;
  const duration = buffer.duration;

  const evenSplit = (): VerseTiming[] =>
    verseNumbers.map((n, i) => ({
      verseNumber: n,
      start: (duration * i) / count,
      end: (duration * (i + 1)) / count,
    }));

  if (count <= 1) {
    return verseNumbers.map((n) => ({ verseNumber: n, start: 0, end: duration }));
  }

  const data = toMono(buffer);
  const sr = buffer.sampleRate;
  const winSize = Math.max(1, Math.floor(sr * 0.03)); // 30ms windows
  const winCount = Math.floor(data.length / winSize);

  // RMS energy per window.
  const rms = new Float32Array(winCount);
  let peak = 0;
  for (let w = 0; w < winCount; w++) {
    let sum = 0;
    const base = w * winSize;
    for (let i = 0; i < winSize; i++) {
      const s = data[base + i];
      sum += s * s;
    }
    const val = Math.sqrt(sum / winSize);
    rms[w] = val;
    if (val > peak) peak = val;
  }
  if (peak === 0) return evenSplit();

  // Silence = below a fraction of peak energy.
  const threshold = peak * 0.08;
  const winDur = winSize / sr;

  // Collect silence runs as [startWin, endWin].
  const runs: { start: number; end: number }[] = [];
  let runStart = -1;
  for (let w = 0; w < winCount; w++) {
    const silent = rms[w] < threshold;
    if (silent && runStart < 0) runStart = w;
    if (!silent && runStart >= 0) {
      runs.push({ start: runStart, end: w });
      runStart = -1;
    }
  }
  if (runStart >= 0) runs.push({ start: runStart, end: winCount });

  // Ignore leading/trailing silence; keep only internal gaps long enough.
  const minGapWins = Math.max(2, Math.floor(0.18 / winDur)); // >=180ms
  const internal = runs.filter(
    (r) => r.start > 0 && r.end < winCount && r.end - r.start >= minGapWins
  );

  if (internal.length < count - 1) return evenSplit();

  // Take the longest gaps, then sort chronologically; cut at each gap's middle.
  const cuts = internal
    .slice()
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, count - 1)
    .map((r) => ((r.start + r.end) / 2) * winDur)
    .sort((a, b) => a - b);

  const bounds = [0, ...cuts, duration];
  return verseNumbers.map((n, i) => ({
    verseNumber: n,
    start: bounds[i],
    end: bounds[i + 1],
  }));
}
