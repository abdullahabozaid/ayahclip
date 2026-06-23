// Unit tests for the pure CTC forced aligner. The aligner is the core of deep
// align: given a known token sequence and per-frame log-probs, it must place a
// real onset on every token — including when two tokens abut with NO blank/pause
// between them (the run-on-verse case that pause detection can't handle).
import { describe, it, expect } from "vitest";
import { ctcForcedAlign, minFramesFor } from "@/lib/ctc-align";

// Build a [T,V] log-prob matrix from a per-frame "favoured label". The favoured
// label gets ~log(0.9), the rest share the remainder — only the ordering matters
// for Viterbi, so exact values are unimportant.
function emissions(perFrameFavoured: number[], V: number): Float32Array {
  const T = perFrameFavoured.length;
  const lp = new Float32Array(T * V);
  const hi = Math.log(0.9);
  const lo = Math.log(0.1 / (V - 1));
  for (let t = 0; t < T; t++) {
    for (let v = 0; v < V; v++) lp[t * V + v] = v === perFrameFavoured[t] ? hi : lo;
  }
  return lp;
}

describe("minFramesFor", () => {
  it("counts one frame per token plus a blank between equal neighbours", () => {
    expect(minFramesFor([])).toBe(0);
    expect(minFramesFor([5])).toBe(1);
    expect(minFramesFor([5, 6, 7])).toBe(3);
    expect(minFramesFor([5, 5])).toBe(3); // blank mandatory between the repeat
    expect(minFramesFor([5, 5, 5])).toBe(5);
  });
});

describe("ctcForcedAlign", () => {
  const BLANK = 2; // V = 3: tokens {0,1}, blank = 2

  it("places each token at its acoustic onset (simple case)", () => {
    // frames: t0 t1 -> token0, t2 t3 -> token1
    const lp = emissions([0, 0, 1, 1], 3);
    const r = ctcForcedAlign(lp, 4, 3, [0, 1], BLANK);
    expect(r).not.toBeNull();
    expect(r!.tokens.map((t) => t.token)).toEqual([0, 1]);
    expect(r!.tokens[0]).toMatchObject({ startFrame: 0, endFrame: 1 });
    expect(r!.tokens[1]).toMatchObject({ startFrame: 2, endFrame: 3 });
  });

  it("finds a NO-PAUSE boundary: tokens abut with no blank frame between them", () => {
    // Every frame is speech (token0 then token1) — there is no blank anywhere,
    // yet the boundary must land exactly where token1 begins (frame 3).
    const lp = emissions([0, 0, 0, 1, 1, 1], 3);
    const r = ctcForcedAlign(lp, 6, 3, [0, 1], BLANK);
    expect(r).not.toBeNull();
    expect(r!.tokens[0].endFrame).toBe(2);
    expect(r!.tokens[1].startFrame).toBe(3);
  });

  it("enforces a blank between two identical tokens", () => {
    // token0, blank, token0 — the repeat can only survive with a blank between.
    const lp = emissions([0, 2, 0], 3);
    const r = ctcForcedAlign(lp, 3, 3, [0, 0], BLANK);
    expect(r).not.toBeNull();
    expect(r!.tokens[0]).toMatchObject({ startFrame: 0, endFrame: 0 });
    expect(r!.tokens[1]).toMatchObject({ startFrame: 2, endFrame: 2 });
  });

  it("aligns a longer sequence with leading and trailing silence", () => {
    // blank, t0, t0, blank, t1, blank
    const lp = emissions([2, 0, 0, 2, 1, 2], 3);
    const r = ctcForcedAlign(lp, 6, 3, [0, 1], BLANK);
    expect(r).not.toBeNull();
    expect(r!.tokens[0].startFrame).toBe(1);
    expect(r!.tokens[1].startFrame).toBe(4);
  });

  it("returns null when the target cannot fit in the available frames", () => {
    expect(ctcForcedAlign(emissions([0], 3), 1, 3, [0, 1], BLANK)).toBeNull();
    expect(ctcForcedAlign(emissions([0, 0], 3), 2, 3, [0, 0], BLANK)).toBeNull(); // needs 3
    expect(ctcForcedAlign(new Float32Array(0), 0, 3, [0], BLANK)).toBeNull();
  });

  it("keeps token order monotonic across many frames", () => {
    const lp = emissions([0, 0, 1, 1, 1, 1, 0, 0], 3); // note: target is fixed [0,1,0]
    const r = ctcForcedAlign(lp, 8, 3, [0, 1, 0], BLANK);
    expect(r).not.toBeNull();
    const starts = r!.tokens.map((t) => t.startFrame);
    expect(starts[0]).toBeLessThan(starts[1]);
    expect(starts[1]).toBeLessThan(starts[2]);
  });
});
