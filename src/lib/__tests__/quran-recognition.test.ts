import { describe, expect, it } from "vitest";
import { shouldUseRetryAssessment } from "../quran-recognition";

describe("Quran recognition retry selection", () => {
  it("uses a retry only when confidence or same-tier match quality improves", () => {
    expect(shouldUseRetryAssessment(
      { confidence: "low", score: 0.9 },
      { confidence: "medium", score: 0.5 },
    )).toBe(true);
    expect(shouldUseRetryAssessment(
      { confidence: "medium", score: 0.61 },
      { confidence: "medium", score: 0.72 },
    )).toBe(true);
    expect(shouldUseRetryAssessment(
      { confidence: "high", score: 0.82 },
      { confidence: "medium", score: 0.95 },
    )).toBe(false);
    expect(shouldUseRetryAssessment(
      { confidence: "medium", score: 0.72 },
      { confidence: "medium", score: 0.70 },
    )).toBe(false);
  });
});
