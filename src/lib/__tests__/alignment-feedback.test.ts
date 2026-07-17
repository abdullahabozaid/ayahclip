import { describe, expect, it } from "vitest";
import {
  alignmentFailureMessage,
  alignmentReviewProgress,
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

  it("removes durable creator-checked cuts from the remaining report", () => {
    const review = buildAlignmentReview("hybrid", [
      { verseNumber: 1, agreementSeconds: null, confidence: "low" },
      { verseNumber: 2, agreementSeconds: 0.7, confidence: "medium" },
      { verseNumber: 3, agreementSeconds: 1.1, confidence: "low" },
    ]);
    const progressed = alignmentReviewProgress(review, [
      { verseNumber: 1, start: 0, end: 2 },
      { verseNumber: 2, start: 2, end: 4, alignmentConfidence: "medium", alignmentReviewed: true },
      // An intra-ayah duplicate row carries no model diagnostic and must not
      // keep the real ayah boundary in the pending queue.
      { verseNumber: 2, start: 4, end: 5 },
      { verseNumber: 3, start: 4, end: 6, alignmentConfidence: "low", alignmentReviewed: false },
    ]);
    expect(progressed.reviewVerseNumbers).toEqual([3]);
    expect(progressed.message).toContain("1 remaining boundary");
  });

  it("confirms when every flagged cut has been checked", () => {
    const review = buildAlignmentReview("ctc", [
      { verseNumber: 1, agreementSeconds: null, confidence: "low" },
      { verseNumber: 2, agreementSeconds: 0.8, confidence: "low" },
    ]);
    const progressed = alignmentReviewProgress(review, [
      { verseNumber: 1, start: 0, end: 2 },
      { verseNumber: 2, start: 2, end: 4, alignmentConfidence: "low", alignmentReviewed: true },
    ]);
    expect(progressed.reviewVerseNumbers).toEqual([]);
    expect(progressed.message).toContain("All flagged internal boundaries have been checked");
  });

  it("distinguishes memory, capability, model, and unknown failures", () => {
    expect(alignmentFailureMessage(new RangeError(
      "Automatic Quran recognition is limited to 4 minutes on this device. Trim the source."
    ))).toContain("limited to 4 minutes");
    expect(alignmentFailureMessage(new RangeError("Out of memory"))).toContain("available memory");
    expect(alignmentFailureMessage(new Error("WebAssembly SIMD not supported"))).toContain("latest Chrome or Edge");
    expect(alignmentFailureMessage(new Error("failed to fetch ONNX model"))).toContain("model could not load or run");
    expect(alignmentFailureMessage(new Error("mystery"))).toContain("stopped unexpectedly");
  });
});
