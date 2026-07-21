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

/**
 * Global edit similarity between the complete transcript and complete Quran
 * reference. Unlike `alignToRef`, this charges for unrecited text at either end
 * of the reference. It is deliberately used only as a small ranking signal:
 * mid-ayah clips must remain discoverable, but when two candidates contain the
 * same phrase we should prefer the ayah whose complete wording best explains
 * the transcript.
 */
function wholeReferenceSimilarity(query: string, ref: string): number {
  const m = query.length;
  const n = ref.length;
  if (m === 0 || n === 0) return m === n ? 1 : 0;

  let previous = new Int32Array(n + 1);
  let current = new Int32Array(n + 1);
  for (let j = 0; j <= n; j++) previous[j] = j;

  for (let i = 1; i <= m; i++) {
    current[0] = i;
    for (let j = 1; j <= n; j++) {
      const substitution = previous[j - 1] + (query[i - 1] === ref[j - 1] ? 0 : 1);
      current[j] = Math.min(
        substitution,
        current[j - 1] + 1,
        previous[j] + 1,
      );
    }
    [previous, current] = [current, previous];
  }

  return Math.max(0, 1 - previous[n] / Math.max(m, n));
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

/**
 * A whole-surah aligner can expose only one location per surah. That is not
 * enough for short ayahs: identical or near-identical phrases occur across
 * many surahs, and the correct creator-review choice can disappear even when
 * the transcript itself is good. Search individual verses for short queries
 * so ambiguity becomes an explicit candidate set instead of a missing result.
 */
function shortVerseMatches(query: string): VerseMatch[] {
  if (!bySurah) throw new Error("call loadCorpus() first");
  const compactQueryLength = query.replace(/ /g, "").length;
  if (compactQueryLength >= 32) return [];
  const matches: VerseMatch[] = [];
  for (const verses of bySurah.values()) {
    for (const verse of verses) {
      const alignment = alignToRef(query, verse.clean);
      if (alignment.score < MIN_SCORE) continue;
      matches.push({
        surah: verse.surah,
        ayahStart: verse.ayah,
        ayahEnd: verse.ayah,
        score: alignment.score,
      });
    }
  }
  return matches;
}

/**
 * Greedy CTC occasionally preserves only the opening "بس" of a standalone
 * basmala and corrupts the rest of the phrase. Al-Fatiha 1:1 is the canonical
 * numbered basmala, so keep it available for creator review when a short decode
 * starts with that strong cue. This candidate is never allowed to influence the
 * primary score, margin, confidence, or automatic range application.
 */
function canonicalBasmalaReviewMatch(query: string): VerseMatch | null {
  const compact = query.replace(/ /g, "");
  if (!basmala || compact.length < 6 || compact.length > 24 || !compact.startsWith("بس")) {
    return null;
  }
  return {
    surah: 1,
    ayahStart: 1,
    ayahEnd: 1,
    score: alignToRef(query, basmala).score,
  };
}

function referenceCoverage(match: VerseMatch, query: string): number {
  const reference = getVersesText(match.surah, match.ayahStart, match.ayahEnd).text;
  const referenceLength = reference.replace(/ /g, "").length;
  if (referenceLength === 0) return 0;
  return Math.min(1, query.replace(/ /g, "").length / referenceLength);
}

function recognitionRankScore(match: VerseMatch, query: string): number {
  // Whole-reference similarity breaks the important tie between a complete
  // short ayah and the same words appearing at the end of a longer ayah. Keep
  // both adjustments small: semi-global transcript similarity remains the
  // primary signal, so genuine mid-ayah clips stay retrievable.
  const reference = getVersesText(match.surah, match.ayahStart, match.ayahEnd).text;
  return match.score * 0.8 +
    referenceCoverage(match, query) * 0.1 +
    wholeReferenceSimilarity(query, reference) * 0.1;
}

function matchKey(match: VerseMatch): string {
  return `${match.surah}:${match.ayahStart}-${match.ayahEnd}`;
}

function dedupeVerseMatches(matches: readonly VerseMatch[]): VerseMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = matchKey(match);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeReviewCandidates(
  primary: VerseMatch,
  ranked: readonly VerseMatch[],
  surahCandidates: readonly VerseMatch[],
): VerseMatch[] {
  const ordered = [primary];
  const depth = Math.max(ranked.length, surahCandidates.length);
  for (let index = 0; index < depth; index++) {
    if (ranked[index + 1]) ordered.push(ranked[index + 1]);
    if (surahCandidates[index]) ordered.push(surahCandidates[index]);
  }
  return dedupeVerseMatches(ordered);
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

/** Keep the matcher order while removing duplicate ranges before creator review. */
export function selectRecognitionCandidates(
  primary: VerseMatch,
  alternatives: readonly VerseMatch[],
  limit = 3,
): VerseMatch[] {
  return [primary, ...alternatives]
    .filter((match, index, matches) => matches.findIndex((item) =>
      item.surah === match.surah &&
      item.ayahStart === match.ayahStart &&
      item.ayahEnd === match.ayahEnd
    ) === index)
    .slice(0, Math.max(1, limit));
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
    // A short opening verse (for example Al-Baqarah's muqatta'at) is not, by
    // itself, evidence that it was recited. Include it only when the aligned
    // transcript actually overlaps its non-basmala content.
    if (contentLength > 0 && contentOverlap >= contentLength * 0.4) {
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

  // Short phrases are often repeated across the Quran. Search a wider set of
  // surahs for those clips so creator review is not limited by a tied trigram
  // pre-filter. Longer recitations remain on the faster narrow path.
  const retrievalLimit = q.replace(/ /g, "").length < 32 ? 32 : 10;
  const aligned = surahIndex
    .map((su) => ({ su, overlap: intersectionSize(qTris, su.trigrams) }))
    .filter((candidate) => candidate.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, retrievalLimit)
    .map(({ su }) => ({ su, ...alignToRef(q, su.text) }))
    .sort((a, b) => b.score - a.score);
  if (aligned.length === 0 || aligned[0].score < MIN_SCORE) {
    return { match: null, alternatives: [], margin: 0, confidence: "low" };
  }

  const mapped = aligned.map(mapAlignmentToVerses);
  const rankScores = new Map<string, number>();
  const rankScore = (candidate: VerseMatch) => {
    const key = matchKey(candidate);
    const cached = rankScores.get(key);
    if (cached !== undefined) return cached;
    const score = recognitionRankScore(candidate, q);
    rankScores.set(key, score);
    return score;
  };
  const ranked = dedupeVerseMatches([...mapped, ...shortVerseMatches(q)])
    .sort((left, right) =>
      rankScore(right) - rankScore(left) ||
      referenceCoverage(right, q) - referenceCoverage(left, q)
    );
  const match = ranked[0];
  // Some ayahs are repeated verbatim within one surah (most visibly the
  // refrain in Ar-Rahman). The per-surah aligner can return only one location,
  // so add the other identical verses explicitly. Audio alone cannot decide
  // which occurrence the creator used, and claiming the first one as high
  // confidence would silently apply incorrect metadata.
  const duplicateVerseMatches = match.ayahStart === match.ayahEnd
    ? (() => {
      const matchedText = bySurah!.get(match.surah)
        ?.find((verse) => verse.ayah === match.ayahStart)?.clean;
      if (!matchedText) return [];
      return (bySurah!.get(match.surah) ?? [])
        .filter((verse) => verse.ayah !== match.ayahStart && verse.clean === matchedText)
        .map((verse) => ({
          surah: match.surah,
          ayahStart: verse.ayah,
          ayahEnd: verse.ayah,
          score: match.score,
        }));
    })()
    : [];
  // Preserve a deeper private candidate set for evaluation and future recovery.
  // The import UI still deliberately shows only three choices at once.
  const reviewCandidates = mergeReviewCandidates(match, ranked, mapped);
  const basmalaReview = canonicalBasmalaReviewMatch(q);
  const alternatives = dedupeVerseMatches([
    ...duplicateVerseMatches,
    ...(basmalaReview ? [basmalaReview] : []),
    ...reviewCandidates.slice(1),
  ]).slice(0, 9);
  const nearestRankedAlternative = ranked.find((candidate) =>
    candidate.surah !== match.surah ||
    candidate.ayahStart !== match.ayahStart ||
    candidate.ayahEnd !== match.ayahEnd
  );
  const margin = q === basmala
    ? 0
    : rankScore(match) - (
      nearestRankedAlternative ? rankScore(nearestRankedAlternative) : 0
    );
  // Medium confidence is an auto-apply boundary in the editor, so it must be
  // conservative. A 0.72 score admitted a real Hudhaify ASR error
  // ("مالك يوم الدينين") as the wrong short verse with medium confidence.
  // The 0.84 floor keeps verified longer/repeated passages useful while
  // deferring noisy short clips for creator confirmation.
  const confidence = match.score >= 0.9 && margin >= 0.12
    ? "high"
    : match.score >= 0.84 && margin >= 0.08
      ? "medium"
      : "low";
  return { match, alternatives, margin, confidence };
}

/**
 * Recover strong Quran candidates from pause-bounded transcript windows. These
 * candidates are deliberately detached from whole-clip confidence: they may
 * be shown for creator review, but must never become an automatic range.
 */
export function recoverRecognitionWindowCandidates(
  windows: readonly string[],
  limit = 9,
): VerseMatch[] {
  const ranked = windows.flatMap((window) => {
    const assessment = assessVerseMatch(window);
    if (!assessment.match || assessment.confidence === "low") return [];
    return [{
      match: assessment.match,
      confidence: assessment.confidence,
      evidenceLength: normalizeArabic(window).replace(/ /g, "").length,
    }];
  }).sort((left, right) =>
    (right.confidence === "high" ? 2 : 1) - (left.confidence === "high" ? 2 : 1) ||
    right.evidenceLength - left.evidenceLength ||
    right.match.score - left.match.score
  );

  return ranked
    .map((item) => item.match)
    .filter((match, index, matches) => matches.findIndex((item) =>
      item.surah === match.surah &&
      item.ayahStart === match.ayahStart &&
      item.ayahEnd === match.ayahEnd
    ) === index)
    .slice(0, Math.max(1, limit));
}

/** A medium whole-clip match is not safe to auto-apply when a strong
 * pause-bounded window points to a different passage. Same-surah windows —
 * whether overlapping around an ordinary ayah pause, or non-overlapping
 * earlier/later ranges of the same continuous recitation — are expected and do
 * NOT conflict. Only a genuinely different surah, or the strongest window
 * materially out-scoring the whole-clip match while disagreeing with it, is a
 * real competitor. */
export function hasCompetingRecognitionWindow(
  primary: VerseMatch,
  windows: readonly VerseMatch[],
): boolean {
  const strongest = windows[0];
  const strongestDisagrees = Boolean(strongest && (
    strongest.surah !== primary.surah ||
    strongest.ayahStart !== primary.ayahStart ||
    strongest.ayahEnd !== primary.ayahEnd
  ) && strongest.score >= primary.score + 0.02);
  return strongestDisagrees || windows.some((candidate) =>
    candidate.surah !== primary.surah
  );
}

/**
 * Identify the surah + ayah range a transcript covers. Returns null if no
 * candidate clears a minimum confidence.
 */
export function matchVerses(transcript: string): VerseMatch | null {
  return assessVerseMatch(transcript).match;
}
