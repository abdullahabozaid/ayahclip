import { describe, expect, it } from "vitest";
import { leadingRecognitionRetryOffset, offsetEmissions } from "../recognition-retry";
import type { Emissions } from "../asr";

describe("leading recognition retry", () => {
  it("crops a substantial unrecognised intro while preserving pre-roll", () => {
    expect(leadingRecognitionRetryOffset({
      text: "بسم الله",
      charTimes: [2.6, 2.7],
      wordStarts: [2.6],
    }, 40)).toBeCloseTo(2.25);
  });

  it("does not retry ordinary model latency or leave an unusably short clip", () => {
    expect(leadingRecognitionRetryOffset({ text: "ا", charTimes: [0.8], wordStarts: [0.8] }, 20)).toBeNull();
    expect(leadingRecognitionRetryOffset({ text: "ا", charTimes: [2.6], wordStarts: [2.6] }, 4)).toBeNull();
  });

  it("shifts cropped emissions back to original-file time", () => {
    const emissions = {
      logProbs: new Float32Array([0]),
      T: 1,
      V: 1,
      frameDur: 0.02,
      blankId: 0,
      vocab: { "0": "<blank>" },
      transcription: { text: "اب", charTimes: [0.2, 0.4], wordStarts: [0.2] },
    } satisfies Emissions;
    const shifted = offsetEmissions(emissions, 2.25);
    expect(shifted.timeOffset).toBe(2.25);
    expect(shifted.transcription.charTimes).toEqual([2.45, 2.65]);
    expect(shifted.transcription.wordStarts).toEqual([2.45]);
  });
});
