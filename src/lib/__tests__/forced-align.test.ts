// Tests for the pure timing assembly: snapping onsets to detected pauses for
// clean cuts, plus the monotonic / min-duration guards. The fade-in lead is NOT
// here — it's a render concern (the display leads the audio), so alignment just
// produces clean onset-to-onset boundaries. The acoustic alignment itself is
// covered by ctc-align / ctc-vocab.
import { describe, it, expect } from "vitest";
import {
  assembleTimings,
  classifyBoundaryConfidence,
  refineTranscriptCuts,
} from "@/lib/forced-align";

describe("assembleTimings", () => {
  it("makes contiguous verses from the onsets when there's nothing to snap to", () => {
    const t = assembleTimings({
      onsets: [0, 2, 4],
      recEnds: [1.8, 3.8, 5.8],
      verseNumbers: [1, 2, 3],
      audioDuration: 6,
    });
    expect(t.map((x) => x.verseNumber)).toEqual([1, 2, 3]);
    expect(t.map((x) => +x.start.toFixed(3))).toEqual([0, 2, 4]);
    expect(t.map((x) => +x.end.toFixed(3))).toEqual([2, 4, 6]);
  });

  it("snaps a boundary to a nearby pause center", () => {
    const t = assembleTimings({
      onsets: [0, 2.1],
      recEnds: [1.5, 3],
      verseNumbers: [1, 2],
      audioDuration: 4,
      silences: [{ time: 1.8, len: 0.3 }],
    });
    expect(+t[1].start.toFixed(3)).toBe(1.8);
    expect(+t[0].end.toFixed(3)).toBe(1.8);
  });

  it("ignores pause centers that are too far or cross recitation", () => {
    const t = assembleTimings({
      onsets: [0, 2.1],
      recEnds: [1.5, 3],
      verseNumbers: [1, 2],
      audioDuration: 4,
      // 1.0 is before recEnd[0]; 2.9 is >0.4 from the onset.
      silences: [{ time: 1.0, len: 0.3 }, { time: 2.9, len: 0.3 }],
    });
    expect(+t[1].start.toFixed(3)).toBe(2.1); // unchanged
  });

  it("leaves run-on boundaries exactly on the onset (no pause to snap to)", () => {
    const t = assembleTimings({
      onsets: [0, 2.2],
      recEnds: [1.5, 3],
      verseNumbers: [1, 2],
      audioDuration: 4,
      silences: [],
    });
    expect(+t[1].start.toFixed(3)).toBe(2.2);
  });

  it("enforces monotonic order and a minimum duration", () => {
    const t = assembleTimings({
      onsets: [0, 0.05, 0.07],
      recEnds: [0.05, 0.07, 0.09],
      verseNumbers: [1, 2, 3],
      audioDuration: 1,
    });
    for (let i = 0; i < t.length; i++) {
      expect(t[i].end).toBeGreaterThanOrEqual(t[i].start + 0.12 - 1e-9);
      if (i > 0) expect(t[i].start).toBeGreaterThanOrEqual(t[i - 1].start);
    }
  });
});

describe("classifyBoundaryConfidence", () => {
  it("requires both a strong transcript and close method agreement", () => {
    expect(classifyBoundaryConfidence(0.94, 0.12)).toBe("high");
    expect(classifyBoundaryConfidence(0.9, 0.6)).toBe("medium");
    expect(classifyBoundaryConfidence(0.95, 1.2)).toBe("low");
    expect(classifyBoundaryConfidence(null, null)).toBe("low");
  });
});

describe("refineTranscriptCuts", () => {
  it("keeps the clip opening and moves acoustic onsets back to preceding pauses", () => {
    const timings = refineTranscriptCuts({
      timings: [
        { verseNumber: 1, start: 0.35, end: 5.9 },
        { verseNumber: 2, start: 5.9, end: 10 },
      ],
      audioStart: 0.04,
      silences: [{ time: 5.2, len: 0.5 }, { time: 6.1, len: 0.2 }],
    });

    expect(timings[0]).toMatchObject({ start: 0.04, end: 5.2 });
    expect(timings[1].start).toBe(5.2);
  });

  it("does not snap to a pause after the acoustic onset", () => {
    const timings = refineTranscriptCuts({
      timings: [
        { verseNumber: 1, start: 0, end: 5.9 },
        { verseNumber: 2, start: 5.9, end: 10 },
      ],
      silences: [{ time: 6.1, len: 0.4 }],
    });

    expect(timings[1].start).toBe(5.9);
  });

  it("does not turn a short intra-verse hesitation into a cut", () => {
    const timings = refineTranscriptCuts({
      timings: [
        { verseNumber: 1, start: 0, end: 5.9 },
        { verseNumber: 2, start: 5.9, end: 10 },
      ],
      silences: [{ time: 5.1, len: 0.14 }],
    });

    expect(timings[1].start).toBe(5.9);
  });

  it("requires stronger pause evidence as distance from the onset grows", () => {
    const timings = refineTranscriptCuts({
      timings: [
        { verseNumber: 1, start: 0, end: 6 },
        { verseNumber: 2, start: 6, end: 10 },
      ],
      silences: [{ time: 4.6, len: 0.3 }],
    });

    expect(timings[1].start).toBe(6);
  });
});
