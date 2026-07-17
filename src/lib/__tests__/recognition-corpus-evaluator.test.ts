import { describe, expect, it } from "vitest";
import {
  parseRecognitionTags,
  recognitionGateFailures,
  summarizeRecognitionCorpus,
  type RecognitionCorpusResult,
} from "../../../scripts/lib/recognition-corpus";

function result(overrides: Partial<RecognitionCorpusResult> = {}): RecognitionCorpusResult {
  return {
    exact: true,
    expectedInTop3: true,
    expectedInCandidateSet: true,
    autoApplied: true,
    falseAutoApply: false,
    confidence: "high",
    characterErrorRate: 0.1,
    tags: ["phone"],
    license: "Tarteel tlog terms",
    ...overrides,
  };
}

describe("recognition corpus coverage gates", () => {
  it("normalizes manifest stressor tags", () => {
    expect(parseRecognitionTags("Phone, room echo,PHONE,background_speech")).toEqual([
      "background-speech",
      "phone",
      "room-echo",
    ]);
  });

  it("reports metrics for each real-world stressor", () => {
    const summary = summarizeRecognitionCorpus([
      result({ tags: ["phone", "compression"] }),
      result({ tags: ["background-speech"], exact: false, autoApplied: false, confidence: "low" }),
    ]);
    expect(summary.cases).toBe(2);
    expect(summary.tagCoverage.phone.cases).toBe(1);
    expect(summary.tagCoverage["background-speech"].exactRangeAccuracy).toBe(0);
    expect(summary.casesWithLicenseMetadata).toBe(2);
  });

  it("fails a corpus that only claims broad coverage in aggregate", () => {
    const summary = summarizeRecognitionCorpus([
      result({ tags: ["phone"], license: null }),
    ]);
    expect(recognitionGateFailures(summary, {
      minCases: 5,
      minAutoApplies: 2,
      minAutoPrecision: 1,
      maxFalseAuto: 0,
      requiredTags: ["phone", "room-echo", "background-speech"],
      minCasesPerRequiredTag: 2,
      requireLicenseMetadata: true,
    })).toEqual([
      "cases 1 < 5",
      "auto-applied cases 1 < 2",
      "tag “phone” cases 1 < 2",
      "required tag “room-echo” has no cases",
      "required tag “background-speech” has no cases",
      "license metadata present for 0/1 cases",
    ]);
  });

  it("cannot hide a weak stressor behind a strong aggregate", () => {
    const summary = summarizeRecognitionCorpus([
      result({ tags: ["phone"] }),
      result({ tags: ["room-echo"], expectedInCandidateSet: false, exact: false, falseAutoApply: true }),
      result({ tags: ["phone"] }),
    ]);
    expect(recognitionGateFailures(summary, {
      requiredTags: ["phone", "room-echo"],
      minRequiredTagCandidateRecall: 0.9,
      maxRequiredTagFalseAuto: 0,
    })).toEqual([
      "tag “room-echo” candidate recall 0 < 0.9",
      "tag “room-echo” false auto-applies 1 > 0",
    ]);
  });
});
