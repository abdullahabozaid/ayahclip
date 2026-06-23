// Bridge between the FastConformer CTC model's diacritized subword vocab and the
// diacritic-free "skeleton" space the rest of the pipeline aligns on
// (see normalizeArabic in verse-match.ts).
//
// Why: the model emits ~1025 SentencePiece subwords that carry basic harakat
// (e.g. "كَتَب", standalone "َ"), but the reference verse text is normalized to a
// bare consonantal skeleton. To forced-align the skeleton reference against the
// model's emissions we (1) reduce the vocab to its skeleton forms, collapsing all
// full-vocab ids that share a skeleton into one reduced id, (2) MARGINALIZE the
// per-frame emission probabilities onto that reduced alphabet (log-sum-exp over
// the collapsed ids), and (3) tokenize the skeleton reference into reduced ids.
// Pure-diacritic / punctuation / blank / unk tokens fold into a single reduced
// blank, since they carry no skeleton letter.

import { normalizeArabic } from "./verse-match";

const WORD_MARK = /▁/g;
// Arabic letter block after NORM_MAP folding (أإآٱ→ا, ة→ه, ى→ي all land here).
const ARABIC_LETTER = /[ء-ي]/;

export interface SkeletonVocab {
  /** reduced id → skeleton subword string. Index 0 is the reduced blank (""). */
  reduced: string[];
  /** The reduced blank id (always 0). */
  blankId: number;
  /** full vocab id → reduced id (blankId for folded tokens). */
  fullToReduced: Int32Array;
  /** reduced alphabet size, including blank. */
  size: number;
  /** skeleton subword → reduced id, for greedy tokenization. */
  byString: Map<string, number>;
  /** longest reduced subword length (chars), for greedy longest-match. */
  maxLen: number;
}

function skeletonOf(token: string): string {
  return normalizeArabic(token.replace(WORD_MARK, ""));
}

/**
 * Build the reduced skeleton alphabet + the full→reduced map from the model
 * vocab (id → token string, e.g. parsed `/asr-vocab.json`).
 */
export function buildSkeletonVocab(vocab: Record<string, string>): SkeletonVocab {
  const entries = Object.entries(vocab).map(
    ([id, tok]) => [parseInt(id, 10), tok] as [number, string]
  );
  const fullSize = entries.reduce((max, [id]) => Math.max(max, id), 0) + 1;

  const fullToReduced = new Int32Array(fullSize).fill(0); // default → blank
  const byString = new Map<string, number>();
  const reduced: string[] = [""]; // reduced id 0 = blank
  const blankId = 0;
  let maxLen = 1;

  for (const [id, tok] of entries) {
    const skel = skeletonOf(tok);
    if (!skel || !ARABIC_LETTER.test(skel)) {
      fullToReduced[id] = blankId; // pure diacritic / punctuation / <blank> / <unk>
      continue;
    }
    let rid = byString.get(skel);
    if (rid === undefined) {
      rid = reduced.length;
      reduced.push(skel);
      byString.set(skel, rid);
      if (skel.length > maxLen) maxLen = skel.length;
    }
    fullToReduced[id] = rid;
  }

  return { reduced, blankId, fullToReduced, size: reduced.length, byString, maxLen };
}

/** Greedy longest-match tokenization of one whitespace-free word into reduced ids. */
export function tokenizeSkeletonWord(word: string, sv: SkeletonVocab): number[] {
  const ids: number[] = [];
  let i = 0;
  while (i < word.length) {
    let matched = false;
    const maxL = Math.min(sv.maxLen, word.length - i);
    for (let L = maxL; L >= 1; L--) {
      const rid = sv.byString.get(word.slice(i, i + L));
      if (rid !== undefined) {
        ids.push(rid);
        i += L;
        matched = true;
        break;
      }
    }
    if (!matched) i += 1; // unmappable char → drop (recorded as a gap by the caller)
  }
  return ids;
}

/**
 * Tokenize a list of per-verse skeleton strings into one reduced-id sequence,
 * recording where each verse's tokens begin (so token frames map back to verses).
 * `verseStart[v]` is the index into `ids` of verse v's first token.
 */
export function tokenizeSkeletonVerses(
  verseSkeletons: string[],
  sv: SkeletonVocab
): { ids: number[]; verseStart: number[] } {
  const ids: number[] = [];
  const verseStart: number[] = [];
  for (const verse of verseSkeletons) {
    verseStart.push(ids.length);
    for (const w of verse.split(/\s+/).filter(Boolean)) {
      const wIds = tokenizeSkeletonWord(w, sv);
      for (const id of wIds) ids.push(id);
    }
  }
  return { ids, verseStart };
}

/**
 * Marginalize per-frame log-probabilities from the full vocab onto the reduced
 * skeleton alphabet: reduced[t][r] = logSumExp over all full ids f with
 * fullToReduced[f] === r of full[t][f]. Numerically stable (streaming log-sum-exp).
 *
 * @returns flat Float32Array, shape [T, sv.size] row-major.
 */
export function marginalizeEmissions(
  logProbs: ArrayLike<number>,
  T: number,
  V: number,
  sv: SkeletonVocab
): Float32Array {
  const R = sv.size;
  const f2r = sv.fullToReduced;
  const out = new Float32Array(T * R);
  const maxv = new Float64Array(R);
  const sum = new Float64Array(R);

  for (let t = 0; t < T; t++) {
    maxv.fill(-Infinity);
    sum.fill(0);
    const base = t * V;
    for (let f = 0; f < V; f++) {
      const r = f < f2r.length ? f2r[f] : 0;
      const x = logProbs[base + f];
      if (x === -Infinity) continue;
      if (x > maxv[r]) {
        // rescale the running sum to the new max
        sum[r] = maxv[r] === -Infinity ? 1 : sum[r] * Math.exp(maxv[r] - x) + 1;
        maxv[r] = x;
      } else {
        sum[r] += Math.exp(x - maxv[r]);
      }
    }
    const obase = t * R;
    for (let r = 0; r < R; r++) {
      out[obase + r] = maxv[r] === -Infinity ? -Infinity : maxv[r] + Math.log(sum[r]);
    }
  }
  return out;
}
