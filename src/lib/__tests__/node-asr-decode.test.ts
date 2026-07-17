import { describe, expect, it } from "vitest";

import { greedyDecode } from "../../../scripts/lib/node-asr";

describe("Node release-gate CTC decoder", () => {
  it("keeps word starts aligned with the browser decoder", () => {
    const timeSteps = 6;
    const vocabSize = 3;
    const logits = new Float32Array(timeSteps * vocabSize).fill(-10);
    const bestTokens = [1, 0, 2, 0, 1, 0];
    bestTokens.forEach((token, time) => {
      logits[time * vocabSize + token] = 10;
    });

    const decoded = greedyDecode(
      logits,
      timeSteps,
      vocabSize,
      { "0": "<blank>", "1": "▁اب", "2": "ج" },
      0.1,
      0,
    );

    expect(decoded.text).toBe("ابج اب");
    expect(decoded.wordStarts).toEqual([0, 0.4]);
    expect(decoded.charTimes).toEqual([0, 0, 0.2, 0.4, 0.4, 0.4]);
  });
});
