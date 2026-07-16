// Tests for the pure timing assembly: snapping onsets to detected pauses for
// clean cuts, plus the monotonic / min-duration guards. The fade-in lead is NOT
// here — it's a render concern (the display leads the audio), so alignment just
// produces clean onset-to-onset boundaries. The acoustic alignment itself is
// covered by ctc-align / ctc-vocab.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  assembleTimings,
  classifyBoundaryConfidence,
  forceAlignVersesDetailed,
  fuseAlignmentTimings,
  refineTranscriptCuts,
} from "@/lib/forced-align";
import type { Emissions } from "@/lib/asr";
import { loadCorpus } from "@/lib/verse-match";

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

describe("fuseAlignmentTimings", () => {
  const transcript = [
    { verseNumber: 13, start: 0, end: 5.1 },
    { verseNumber: 14, start: 5.1, end: 10 },
  ];
  const ctc = [
    { verseNumber: 13, start: 0, end: 5.75 },
    { verseNumber: 14, start: 5.75, end: 10 },
  ];

  it("uses the acoustic cut when a distinct strong pause supports it", () => {
    const result = fuseAlignmentTimings({
      transcriptTimings: transcript,
      ctcTimings: ctc,
      silences: [{ time: 5.74, len: 0.32 }],
    });
    expect(result.timings[0].end).toBe(5.75);
    expect(result.timings[1].start).toBe(5.75);
    expect(result.usedCtcBoundaries).toEqual([14]);
  });

  it("keeps transcript timing for run-on recitation without pause evidence", () => {
    const result = fuseAlignmentTimings({
      transcriptTimings: transcript,
      ctcTimings: ctc,
      silences: [],
    });
    expect(result.timings).toEqual(transcript);
    expect(result.usedCtcBoundaries).toEqual([]);
  });

  it("ignores weak hesitation and non-distinct pause evidence", () => {
    const weak = fuseAlignmentTimings({
      transcriptTimings: transcript,
      ctcTimings: ctc,
      silences: [{ time: 5.75, len: 0.1 }],
    });
    const equallyClose = fuseAlignmentTimings({
      transcriptTimings: transcript,
      ctcTimings: ctc,
      silences: [{ time: 5.42, len: 0.4 }],
    });
    expect(weak.usedCtcBoundaries).toEqual([]);
    expect(equallyClose.usedCtcBoundaries).toEqual([]);
  });
});

describe("cropped recognition timing", () => {
  it("maps CTC token timing back onto the original file", async () => {
    const corpus = JSON.parse(
      readFileSync(resolve("public/quran-corpus.json"), "utf8"),
    );
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => corpus })));
    await loadCorpus();
    const reference = "بسـم الله الرحمن الرحيم".replace("ـ", "");
    const letters = [...new Set(reference.replace(/\s/g, ""))];
    const vocab = Object.fromEntries([
      ["0", "<blank>"],
      ...letters.map((letter, index) => [String(index + 1), letter]),
    ]);
    const ids = [...reference.replace(/\s/g, "")].map(
      (letter) => letters.indexOf(letter) + 1,
    );
    const path = [0, ...ids.flatMap((id) => [id, 0])];
    const V = letters.length + 1;
    const logProbs = new Float32Array(path.length * V).fill(-20);
    path.forEach((id, frame) => {
      logProbs[frame * V + id] = 0;
    });
    const emissions = {
      logProbs,
      T: path.length,
      V,
      frameDur: 0.05,
      timeOffset: 2.25,
      blankId: 0,
      vocab,
      transcription: { text: "", charTimes: [], wordStarts: [] },
    } satisfies Emissions;

    const result = forceAlignVersesDetailed({
      emissions,
      surah: 1,
      verseNumbers: [1],
      audioDuration: 8,
    });

    expect(result).not.toBeNull();
    expect(result?.timings[0].start).toBeCloseTo(2.3);
  });
});
