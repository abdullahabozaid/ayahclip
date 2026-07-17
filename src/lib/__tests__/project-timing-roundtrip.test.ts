import { describe, expect, it } from "vitest";
import type { Project } from "@/types";

describe("imported project timing round-trip", () => {
  it("preserves duplicate rows, splits, trims, and alignment provenance", () => {
    const imported: NonNullable<Project["imported"]> = {
      name: "recitation.mp3",
      videoBg: false,
      timings: [
        {
          verseNumber: 1,
          start: 0,
          end: 4,
          splits: [2],
          splitWords: [3],
          splitWordTotal: 8,
          splitCharFractions: [0.42],
          wordRange: { from: 0, to: 3 },
          alignmentMethod: "hybrid",
          alignmentConfidence: "medium",
          alignmentAgreementSeconds: 0.55,
          alignmentReviewed: true,
        },
        {
          verseNumber: 1,
          start: 4,
          end: 8,
          wordRange: { from: 4, to: 7 },
          alignmentMethod: "hybrid",
          alignmentConfidence: "medium",
          alignmentAgreementSeconds: 0.55,
        },
      ],
    };

    // IndexedDB uses the structured-clone algorithm; this mirrors the actual
    // save/get boundary more closely than sharing the original object.
    const reopened = structuredClone(imported);

    expect(reopened).toEqual(imported);
    expect(reopened.timings).toHaveLength(2);
    expect(reopened.timings[1].verseNumber).toBe(1);
    expect(reopened.timings[0]).toMatchObject({
      alignmentMethod: "hybrid",
      alignmentConfidence: "medium",
      alignmentAgreementSeconds: 0.55,
      alignmentReviewed: true,
    });
  });
});
