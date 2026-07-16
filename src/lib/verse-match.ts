// Phase 1 verse matcher: given an ASR transcript of Arabic recitation, find the
// surah + ayah range it covers. Approach (robust, handles multi-verse clips and
// mid-verse starts): char-trigram retrieval to pick candidate surahs, then a
// semi-global alignment of the transcript against each surah's full text to pin
// the exact covered region → maps back to verse boundaries.
// Corpus: /public/quran-corpus.json (slim, `c` = diacritic-free text).

interface CorpusVerse {
  surah: number;
  ayah: number;
  clean: string;
}

interface VerseRange {
  ayah: number;
  start: number; // char offset in the surah's joined text
  end: number;
}

interface SurahIndex {
  surah: number;
  text: string; // space-joined normalised verses
  ranges: VerseRange[];
  trigrams: Set<string>; // char trigrams of the no-space text
}

export interface VerseMatch {
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  score: number;
}

// ---- Arabic normalisation ----
// Combining marks + tatweel only, expressed as explicit code points so the
// ranges provably stay clear of the Arabic letter block (U+0621–U+064A):
//   0610–061A honorifics · 064B–065F harakat/tanwin/shadda/sukun · 0670 dagger alef
//   06D6–06DC, 06DF–06E8, 06EA–06ED Quranic annotation marks · 0640 tatweel
const DIACRITICS_RE =
  /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]/g;
const NORM_MAP: Record<string, string> = {
  "أ": "ا", // أ → ا
  "إ": "ا", // إ → ا
  "آ": "ا", // آ → ا
  "ٱ": "ا", // ٱ → ا
  "ة": "ه", // ة → ه
  "ى": "ي", // ى → ي
};

export function normalizeArabic(text: string): string {
  return text
    .replace(DIACRITICS_RE, "")
    .replace(/./g, (ch) => NORM_MAP[ch] ?? ch)
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

// Single-char (non-global) test for a combining mark / tatweel.
const DIACRITIC_ONE = new RegExp(DIACRITICS_RE.source);

/**
 * Like normalizeArabic but keeps a parallel per-character timestamp: diacritics
 * are dropped (their time discarded), letters folded 1:1 (time kept), whitespace
 * collapsed to single spaces. Used to carry CTC frame times through normalisation
 * for forced alignment.
 */
export function normalizeArabicTimed(
  text: string,
  times: number[]
): { text: string; times: number[] } {
  const outChars: string[] = [];
  const outTimes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (DIACRITIC_ONE.test(ch)) continue; // drop combining mark / tatweel
    if (/\s/.test(ch)) {
      if (outChars.length === 0 || outChars[outChars.length - 1] === " ") continue; // trim/collapse
      outChars.push(" ");
      outTimes.push(times[i] ?? 0);
      continue;
    }
    outChars.push(NORM_MAP[ch] ?? ch);
    outTimes.push(times[i] ?? 0);
  }
  while (outChars.length && outChars[outChars.length - 1] === " ") {
    outChars.pop();
    outTimes.pop();
  }
  return { text: outChars.join(""), times: outTimes };
}

function trigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) set.add(s.slice(i, i + 3));
  return set;
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

/**
 * Semi-global alignment: best match of the WHOLE query against any substring of
 * `ref` (free start/end on ref, gaps inside penalised). Returns the match score
 * (1 = perfect) and the [start, end) char range of the matched region in ref.
 */
function alignToRef(query: string, ref: string): { score: number; start: number; end: number } {
  const m = query.length;
  const n = ref.length;
  if (m === 0) return { score: 1, start: 0, end: 0 };
  if (n === 0) return { score: 0, start: 0, end: 0 };

  let prevCost = new Int32Array(m + 1);
  let prevStart = new Int32Array(m + 1);
  let curCost = new Int32Array(m + 1);
  let curStart = new Int32Array(m + 1);
  for (let i = 0; i <= m; i++) {
    prevCost[i] = i;
    prevStart[i] = 0;
  }
  let bestCost = prevCost[m];
  let bestStart = prevStart[m];
  let bestEnd = 0;

  for (let j = 1; j <= n; j++) {
    curCost[0] = 0; // free start: empty query matches before any ref position
    curStart[0] = j;
    const rj = ref[j - 1];
    for (let i = 1; i <= m; i++) {
      let c = prevCost[i - 1] + (query[i - 1] === rj ? 0 : 1); // match/sub (dp[i-1][j-1])
      let st = prevStart[i - 1];
      const delQ = curCost[i - 1] + 1; // query char unmatched (dp[i-1][j])
      if (delQ < c) {
        c = delQ;
        st = curStart[i - 1];
      }
      const skipRef = prevCost[i] + 1; // ref char skipped inside match (dp[i][j-1])
      if (skipRef < c) {
        c = skipRef;
        st = prevStart[i];
      }
      curCost[i] = c;
      curStart[i] = st;
    }
    if (curCost[m] < bestCost) {
      bestCost = curCost[m];
      bestStart = curStart[m];
      bestEnd = j;
    }
    [prevCost, curCost] = [curCost, prevCost];
    [prevStart, curStart] = [curStart, prevStart];
  }

  return { score: Math.max(0, 1 - bestCost / m), start: bestStart, end: bestEnd };
}

// ---- Corpus loading (lazy, cached) ----
let bySurah: Map<number, CorpusVerse[]> | null = null;
let surahIndex: SurahIndex[] | null = null;
// Normalised basmala (= Al-Fatiha verse 1). The corpus prepends it to verse 1 of
// every surah except Al-Fatiha and At-Tawbah, so we use it to judge how much of a
// verse-1 match is the basmala vs the verse's own (often very short) content.
let basmala = "";

export async function loadCorpus(): Promise<void> {
  if (surahIndex) return;
  const res = await fetch("/quran-corpus.json");
  const raw = (await res.json()) as { s: number; a: number; c: string }[];

  bySurah = new Map();
  for (const v of raw) {
    const arr = bySurah.get(v.s) ?? [];
    arr.push({ surah: v.s, ayah: v.a, clean: normalizeArabic(v.c) });
    bySurah.set(v.s, arr);
  }

  basmala = bySurah.get(1)?.find((v) => v.ayah === 1)?.clean ?? "";

  surahIndex = [];
  for (const [surah, verses] of bySurah) {
    verses.sort((a, b) => a.ayah - b.ayah);
    let text = "";
    const ranges: VerseRange[] = [];
    for (const v of verses) {
      if (text) text += " ";
      const start = text.length;
      text += v.clean;
      ranges.push({ ayah: v.ayah, start, end: text.length });
    }
    surahIndex.push({ surah, text, ranges, trigrams: trigrams(text.replace(/ /g, "")) });
  }
}

/** Per-verse weights (normalised clean-text length) for a range — used to split audio time. */
export function getVerseWeights(surah: number, ayahStart: number, ayahEnd: number): number[] {
  if (!bySurah) throw new Error("call loadCorpus() first");
  const verses = bySurah.get(surah) ?? [];
  const out: number[] = [];
  for (let a = ayahStart; a <= ayahEnd; a++) {
    const v = verses.find((x) => x.ayah === a);
    out.push(v ? Math.max(1, v.clean.length) : 1);
  }
  return out;
}

/** Normalised, space-joined text of a verse range plus each verse's char span
 *  within it — the reference fed to forced alignment. */
export function getVersesText(
  surah: number,
  ayahStart: number,
  ayahEnd: number
): { text: string; ranges: { ayah: number; start: number; end: number }[] } {
  if (!bySurah) throw new Error("call loadCorpus() first");
  const verses = bySurah.get(surah) ?? [];
  let text = "";
  const ranges: { ayah: number; start: number; end: number }[] = [];
  for (let a = ayahStart; a <= ayahEnd; a++) {
    const clean = verses.find((x) => x.ayah === a)?.clean ?? "";
    if (text) text += " ";
    const start = text.length;
    text += clean;
    ranges.push({ ayah: a, start, end: text.length });
  }
  return { text, ranges };
}

/** Per-verse word counts for a range — used to map verse breaks onto ASR word onsets. */
export function getVerseWordCounts(surah: number, ayahStart: number, ayahEnd: number): number[] {
  if (!bySurah) throw new Error("call loadCorpus() first");
  const verses = bySurah.get(surah) ?? [];
  const out: number[] = [];
  for (let a = ayahStart; a <= ayahEnd; a++) {
    const v = verses.find((x) => x.ayah === a);
    out.push(v ? Math.max(1, v.clean.split(" ").filter(Boolean).length) : 1);
  }
  return out;
}

const MIN_SCORE = 0.5;

interface AlignedSurahCandidate {
  su: SurahIndex;
  start: number;
  end: number;
  score: number;
}

export interface VerseMatchAssessment {
  match: VerseMatch | null;
  alternatives: VerseMatch[];
  margin: number;
  confidence: "high" | "medium" | "low";
}

export interface LeadingVerseRecovery {
  match: VerseMatch;
  recovered: boolean;
  leadingUnrecognizedSeconds: number;
}

/**
 * Recover one likely omitted opening verse when the audio contains sustained
 * speech well before the first CTC character. This catches reciters whose
 * basmala is acoustically present but absent from the greedy transcript, while
 * ignoring ordinary leading silence because `speechStart` is already trimmed.
 */
export function recoverLeadingVerse(
  match: VerseMatch,
  firstCharacterTime: number | undefined,
  speechStart: number,
  thresholdSeconds = 1.8
): LeadingVerseRecovery {
  const leadingUnrecognizedSeconds = firstCharacterTime === undefined
    ? 0
    : Math.max(0, firstCharacterTime - speechStart);
  const recovered = match.ayahStart > 1 && leadingUnrecognizedSeconds >= thresholdSeconds;
  return {
    match: recovered ? { ...match, ayahStart: match.ayahStart - 1 } : match,
    recovered,
    leadingUnrecognizedSeconds,
  };
}

function mapAlignmentToVerses(candidate: AlignedSurahCandidate): VerseMatch {
  const { su, start, end, score } = candidate;
  const overlapOf = (range: VerseRange) =>
    Math.max(0, Math.min(range.end, end) - Math.max(range.start, start));
  let included = su.ranges.filter((range) => {
    const overlap = overlapOf(range);
    return overlap > 0 && (overlap >= (range.end - range.start) * 0.4 || overlap >= 10);
  });
  if (included.length === 0) included = su.ranges.filter((range) => overlapOf(range) > 0);
  if (included.length === 0) {
    const midpoint = (start + end) / 2;
    let nearest = su.ranges[0];
    let nearestDistance = Infinity;
    for (const range of su.ranges) {
      const distance = midpoint < range.start
        ? range.start - midpoint
        : midpoint > range.end
          ? midpoint - range.end
          : 0;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = range;
      }
    }
    included = [nearest];
  }

  const firstIncludedIndex = su.ranges.indexOf(included[0]);
  if (firstIncludedIndex === 1 && su.surah !== 1 && su.surah !== 9) {
    const firstRange = su.ranges[0];
    const firstVerse = bySurah!.get(su.surah)?.[0]?.clean ?? "";
    const hasBasmala = firstVerse.startsWith(basmala + " ");
    const contentStart = hasBasmala ? firstRange.start + basmala.length + 1 : firstRange.start;
    const contentLength = firstRange.end - contentStart;
    const contentOverlap = Math.max(
      0,
      Math.min(firstRange.end, end) - Math.max(contentStart, start)
    );
    if (contentLength > 0 && (contentLength <= 5 || contentOverlap >= contentLength * 0.4)) {
      included = [firstRange, ...included];
    }
  }

  return {
    surah: su.surah,
    ayahStart: included[0].ayah,
    ayahEnd: included[included.length - 1].ayah,
    score,
  };
}

export function assessVerseMatch(transcript: string): VerseMatchAssessment {
  if (!surahIndex) throw new Error("call loadCorpus() first");
  const q = normalizeArabic(transcript);
  if (q.length < 3) {
    return { match: null, alternatives: [], margin: 0, confidence: "low" };
  }
  const qTris = trigrams(q.replace(/ /g, ""));
  if (qTris.size === 0) {
    return { match: null, alternatives: [], margin: 0, confidence: "low" };
  }

  const aligned = surahIndex
    .map((su) => ({ su, overlap: intersectionSize(qTris, su.trigrams) }))
    .filter((candidate) => candidate.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 10)
    .map(({ su }) => ({ su, ...alignToRef(q, su.text) }))
    .sort((a, b) => b.score - a.score);
  if (aligned.length === 0 || aligned[0].score < MIN_SCORE) {
    return { match: null, alternatives: [], margin: 0, confidence: "low" };
  }

  const mapped = aligned.map(mapAlignmentToVerses);
  const match = mapped[0];
  const alternatives = mapped.slice(1, 3);
  const margin = match.score - (alternatives[0]?.score ?? 0);
  const confidence = match.score >= 0.9 && margin >= 0.12
    ? "high"
    : match.score >= 0.72 && margin >= 0.06
      ? "medium"
      : "low";
  return { match, alternatives, margin, confidence };
}

/**
 * Identify the surah + ayah range a transcript covers. Returns null if no
 * candidate clears a minimum confidence.
 */
export function matchVerses(transcript: string): VerseMatch | null {
  return assessVerseMatch(transcript).match;
}
