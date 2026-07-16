import { describe, expect, it } from "vitest";
import {
  alignmentFailureMessage,
  buildAlignmentReview,
} from "../alignment-feedback";

describe("alignment feedback", () => {
  it("ignores the clip start and flags uncertain internal boundaries", () => {
    const review = buildAlignmentReview("transcript", [
      { verseNumber: 1, agreementSeconds: null, confidence: "low" },
      { verseNumber: 2, agreementSeconds: 0.2, confidence: "high" },
      { verseNumber: 3, agreementSeconds: 0.9, confidence: "low" },
    ]);
    expect(review.reviewVerseNumbers).toEqual([3]);
    expect(review.message).toContain("1 boundary");
  });

  it("describes a fully agreed result without claiming Quran-text authority", () => {
    const review = buildAlignmentReview("ctc", [
      { verseNumber: 1, agreementSeconds: null, confidence: "low" },
      { verseNumber: 2, agreementSeconds: 0.1, confidence: "high" },
    ]);
    expect(review.message).toContain("agreed on every internal boundary");
    expect(review.reviewVerseNumbers).toEqual([]);
  });

  it("marks every internal pause fallback boundary for review", () => {
    const review = buildAlignmentReview("pause", [
      { verseNumber: 1, agreementSeconds: null, confidence: "low" },
      { verseNumber: 2, agreementSeconds: null, confidence: "low" },
      { verseNumber: 3, agreementSeconds: null, confidence: "low" },
    ]);
    expect(review.reviewVerseNumbers).toEqual([2, 3]);
    expect(review.message).toContain("review each cut by ear");
  });

  it("distinguishes memory, capability, model, and unknown failures", () => {
    expect(alignmentFailureMessage(new RangeError("Out of memory"))).toContain("available memory");
    expect(alignmentFailureMessage(new Error("WebAssembly SIMD not supported"))).toContain("latest Chrome or Edge");
    expect(alignmentFailureMessage(new Error("failed to fetch ONNX model"))).toContain("model could not load or run");
    expect(alignmentFailureMessage(new Error("mystery"))).toContain("stopped unexpectedly");
  });
});
