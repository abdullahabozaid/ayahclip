// Tests for the skeleton-vocab bridge. Loads the REAL model vocab so the
// reduction/tokenization is validated against the actual SentencePiece units the
// FastConformer model emits, and checks the emission marginalization math on a
// small synthetic case.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSkeletonVocab,
  tokenizeSkeletonWord,
  tokenizeSkeletonVerses,
  marginalizeEmissions,
  type SkeletonVocab,
} from "@/lib/ctc-vocab";

const vocab = JSON.parse(
  readFileSync(resolve(__dirname, "../../../public/asr-vocab.json"), "utf8")
) as Record<string, string>;

describe("buildSkeletonVocab (real vocab)", () => {
  const sv = buildSkeletonVocab(vocab);

  it("reserves reduced id 0 as the blank and shrinks the alphabet", () => {
    expect(sv.blankId).toBe(0);
    expect(sv.reduced[0]).toBe("");
    expect(sv.size).toBeGreaterThan(50);
    expect(sv.size).toBeLessThan(1025); // collapsed vs the 1025 full tokens
  });

  it("folds blank, unk and standalone diacritics into the reduced blank", () => {
    expect(sv.fullToReduced[1024]).toBe(0); // <blank>
    expect(sv.fullToReduced[0]).toBe(0); // <unk>
    expect(sv.fullToReduced[16]).toBe(0); // standalone fatha "َ"
    expect(sv.fullToReduced[56]).toBe(0); // standalone sukun "ْ"
  });

  it("maps a real subword to a non-blank skeleton id", () => {
    // id 59 = "▁الله" → skeleton "الله"
    const rid = sv.fullToReduced[59];
    expect(rid).not.toBe(0);
    expect(sv.reduced[rid]).toBe("الله");
  });
});

describe("tokenizeSkeleton (real vocab)", () => {
  const sv = buildSkeletonVocab(vocab);

  it("tokenizes a word into reduced ids that reconstruct it", () => {
    const ids = tokenizeSkeletonWord("الله", sv);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.map((r) => sv.reduced[r]).join("")).toBe("الله");
  });

  it("covers a longer word with no dropped letters", () => {
    const word = "الرحمن";
    const ids = tokenizeSkeletonWord(word, sv);
    expect(ids.map((r) => sv.reduced[r]).join("")).toBe(word);
  });

  it("records each verse's first-token index", () => {
    const { ids, verseStart } = tokenizeSkeletonVerses(["الله", "الرحمن الرحيم"], sv);
    expect(verseStart[0]).toBe(0);
    const firstVerseLen = tokenizeSkeletonWord("الله", sv).length;
    expect(verseStart[1]).toBe(firstVerseLen);
    expect(ids.length).toBeGreaterThan(verseStart[1]);
  });
});

describe("marginalizeEmissions", () => {
  it("log-sum-exps full-vocab ids that share a reduced id", () => {
    // Synthetic: V=3, ids {1,2} → reduced 1, id 0 → blank.
    const sv: SkeletonVocab = {
      reduced: ["", "x"],
      blankId: 0,
      fullToReduced: Int32Array.from([0, 1, 1]),
      size: 2,
      byString: new Map(),
      maxLen: 1,
    };
    const lp = Float32Array.from([Math.log(0.1), Math.log(0.3), Math.log(0.4)]);
    const out = marginalizeEmissions(lp, 1, 3, sv);
    expect(out[0]).toBeCloseTo(Math.log(0.1), 6); // blank: only id 0
    expect(out[1]).toBeCloseTo(Math.log(0.7), 6); // logSumExp(0.3, 0.4)
  });

  it("handles multiple frames independently", () => {
    const sv: SkeletonVocab = {
      reduced: ["", "x"],
      blankId: 0,
      fullToReduced: Int32Array.from([0, 1]),
      size: 2,
      byString: new Map(),
      maxLen: 1,
    };
    const lp = Float32Array.from([Math.log(0.2), Math.log(0.8), Math.log(0.5), Math.log(0.5)]);
    const out = marginalizeEmissions(lp, 2, 2, sv);
    expect(out[0]).toBeCloseTo(Math.log(0.2), 6);
    expect(out[1]).toBeCloseTo(Math.log(0.8), 6);
    expect(out[2]).toBeCloseTo(Math.log(0.5), 6);
    expect(out[3]).toBeCloseTo(Math.log(0.5), 6);
  });
});
