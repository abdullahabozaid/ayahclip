// CTC forced alignment.
//
// Given per-frame log-probabilities over a token alphabet AND a known target
// token-id sequence, find the most likely monotonic frame→token alignment by
// Viterbi over the blank-augmented CTC lattice. Unlike open (greedy/beam)
// decoding, the token sequence is FIXED — so every target token is placed on a
// real acoustic frame even when two tokens (or two verses) run together with no
// pause between them. That is the whole point: no-pause boundaries come from the
// acoustic onset of the next token, not from silence.
//
// This module is pure and has no dependency on the model, the vocab, or the
// audio pipeline — it is unit-tested with tiny synthetic emission matrices.

export interface TokenAlignment {
  /** Vocab id of the aligned token (mirrors the input `tokens[i]`). */
  token: number;
  /** Index into the input `tokens` array. */
  index: number;
  /** First frame assigned to this token (its acoustic onset). */
  startFrame: number;
  /** Last frame assigned to this token, inclusive. */
  endFrame: number;
}

export interface ForcedAlignResult {
  tokens: TokenAlignment[];
  /** Total log-probability of the best (Viterbi) path. */
  score: number;
}

const NEG_INF = -Infinity;

/**
 * Minimum number of frames a target needs: one per token, plus a mandatory
 * blank between any two ADJACENT IDENTICAL tokens (CTC collapses repeats, so
 * they must be separated by a blank to survive).
 */
export function minFramesFor(tokens: number[]): number {
  if (tokens.length === 0) return 0;
  let n = tokens.length;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === tokens[i - 1]) n++;
  }
  return n;
}

/**
 * @param logProbs flat array, shape [T, V] row-major (frame `t`, label `v` at
 *                 `t * V + v`). MUST be log-probabilities (each frame a
 *                 log-softmax row). If you only have logits, normalize first.
 * @param T        number of frames.
 * @param V        vocab size (alphabet length, blank included).
 * @param tokens   target token-id sequence (NO blanks), each in [0, V).
 * @param blankId  the CTC blank id.
 * @returns        per-token frame spans + path score, or `null` if the target
 *                 cannot fit in T frames (caller should fall back).
 */
export function ctcForcedAlign(
  logProbs: ArrayLike<number>,
  T: number,
  V: number,
  tokens: number[],
  blankId: number
): ForcedAlignResult | null {
  const L = tokens.length;
  if (L === 0 || T <= 0) return null;
  if (T < minFramesFor(tokens)) return null;

  // Blank-augmented sequence: [blank, t0, blank, t1, blank, ..., tL-1, blank].
  // Even positions are blanks; odd position 2i+1 carries tokens[i].
  const M = 2 * L + 1;
  const ext = new Int32Array(M);
  for (let s = 0; s < M; s++) ext[s] = s % 2 === 0 ? blankId : tokens[(s - 1) / 2];

  const emit = (t: number, label: number) => logProbs[t * V + label];

  // Rolling Viterbi rows + a full backpointer matrix for traceback.
  let prev = new Float64Array(M).fill(NEG_INF);
  let cur = new Float64Array(M).fill(NEG_INF);
  const back = new Int32Array(T * M).fill(-1);

  // t = 0: a path may start on the leading blank (s=0) or the first token (s=1).
  prev[0] = emit(0, ext[0]);
  if (M > 1) prev[1] = emit(0, ext[1]);

  for (let t = 1; t < T; t++) {
    cur.fill(NEG_INF);
    const rowBase = t * M;
    // A path at frame t can occupy positions [sLo, sHi]; outside is unreachable.
    const sLo = Math.max(0, M - 2 * (T - t));
    const sHi = Math.min(M - 1, 2 * t + 1);
    for (let s = sLo; s <= sHi; s++) {
      // Candidate predecessors: stay (s), advance (s-1), skip-blank (s-2).
      let bestPrev = s;
      let bestVal = prev[s];
      if (s - 1 >= 0 && prev[s - 1] > bestVal) {
        bestVal = prev[s - 1];
        bestPrev = s - 1;
      }
      // Skip the blank at s-1 only when ext[s] is a real token whose two-back
      // token differs (otherwise the separating blank is mandatory).
      if (
        s - 2 >= 0 &&
        s % 2 === 1 &&
        ext[s] !== ext[s - 2] &&
        prev[s - 2] > bestVal
      ) {
        bestVal = prev[s - 2];
        bestPrev = s - 2;
      }
      if (bestVal === NEG_INF) continue;
      cur[s] = bestVal + emit(t, ext[s]);
      back[rowBase + s] = bestPrev;
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }

  // Best terminal: the trailing blank (M-1) or the last token (M-2).
  let endS = M - 1;
  let score = prev[M - 1];
  if (M - 2 >= 0 && prev[M - 2] > score) {
    score = prev[M - 2];
    endS = M - 2;
  }
  if (score === NEG_INF) return null;

  // Traceback: recover the occupied extended-position per frame.
  const pathS = new Int32Array(T);
  let s = endS;
  for (let t = T - 1; t >= 0; t--) {
    pathS[t] = s;
    if (t > 0) s = back[t * M + s];
    if (s < 0) {
      // Defensive: shouldn't happen for a feasible target.
      s = 0;
    }
  }

  // Collapse frames → per-token spans (odd extended positions only).
  const result: TokenAlignment[] = [];
  for (let i = 0; i < L; i++) {
    const sPos = 2 * i + 1;
    let startFrame = -1;
    let endFrame = -1;
    for (let t = 0; t < T; t++) {
      if (pathS[t] === sPos) {
        if (startFrame < 0) startFrame = t;
        endFrame = t;
      }
    }
    result.push({ token: tokens[i], index: i, startFrame, endFrame });
  }

  return { tokens: result, score };
}
