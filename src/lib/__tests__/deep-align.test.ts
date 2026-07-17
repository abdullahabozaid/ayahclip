import { describe, expect, it } from "vitest";
import { attachAlignmentDiagnostics } from "../deep-align";

describe("attachAlignmentDiagnostics", () => {
  it("persists method, confidence, and agreement on each ayah timing", () => {
    const result = attachAlignmentDiagnostics(
      [
        { verseNumber: 13, start: 0, end: 5 },
        { verseNumber: 14, start: 5, end: 10 },
      ],
      "hybrid",
      [
        { verseNumber: 13, confidence: "high", agreementSeconds: 0.1 },
        { verseNumber: 14, confidence: "medium", agreementSeconds: 0.55 },
      ],
    );

    expect(result[0]).toMatchObject({
      alignmentMethod: "hybrid",
      alignmentConfidence: "high",
      alignmentAgreementSeconds: 0.1,
      alignmentReviewed: false,
    });
    expect(result[1]).toMatchObject({
      alignmentMethod: "hybrid",
      alignmentConfidence: "medium",
      alignmentAgreementSeconds: 0.55,
      alignmentReviewed: false,
    });
  });

  it("defaults missing diagnostics to low confidence", () => {
    expect(attachAlignmentDiagnostics(
      [{ verseNumber: 1, start: 0, end: 2 }],
      "ctc",
      [],
    )[0]).toMatchObject({
      alignmentMethod: "ctc",
      alignmentConfidence: "low",
      alignmentAgreementSeconds: null,
    });
  });
});
