import { describe, expect, it } from "vitest";

import { convertQuranLabBenchmark } from "../../../scripts/lib/quranlab-benchmark";

const corpus = [
  { s: 1, a: 1, c: "بسم الله الرحمن الرحيم" },
  { s: 27, a: 30, c: "بسم الله الرحمن الرحيم" },
  { s: 89, a: 6, c: "ألم تر كيف فعل ربك بعاد" },
];

describe("Quran-Lab benchmark conversion", () => {
  it("keeps uniquely identifiable phone cases with evaluation-only provenance", () => {
    const converted = convertQuranLabBenchmark([{
      id: "tlog_holdout/1",
      source: "tlog_holdout",
      reference_text: "أَلَمْ تَرَ كَيْفَ فَعَلَ رَبُّكَ بِعَادٍ",
      audio: "audio/tlog_holdout/1.wav",
    }], corpus);

    expect(converted.rows).toHaveLength(1);
    expect(converted.rows[0]).toMatchObject({
      surah: 89,
      ayahStart: 6,
      ayahEnd: 6,
      tags: ["phone", "unseen-reciter"],
      device: "real phone microphone",
    });
    expect(converted.rows[0].license).toContain("no redistribution");
  });

  it("never guesses between repeated verses", () => {
    const converted = convertQuranLabBenchmark([{
      id: "tlog_holdout/repeated",
      source: "tlog_holdout",
      reference_text: "بسم الله الرحمن الرحيم",
      audio: "audio/tlog_holdout/repeated.wav",
    }], corpus);

    expect(converted.rows).toEqual([]);
    expect(converted.skippedAmbiguous).toBe(1);
  });

  it("can isolate the real-phone source without relabelling studio clips", () => {
    const converted = convertQuranLabBenchmark([{
      id: "studio/1",
      source: "everyayah_heldout",
      text: "ألم تر كيف فعل ربك بعاد",
      audio: "audio/everyayah_heldout/1.wav",
    }, {
      id: "phone/1",
      source: "tlog_holdout",
      text: "ألم تر كيف فعل ربك بعاد",
      audio: "audio/tlog_holdout/1.wav",
    }], corpus, "tlog_holdout");

    expect(converted.rows.map((row) => row.id)).toEqual(["phone/1"]);
  });
});
