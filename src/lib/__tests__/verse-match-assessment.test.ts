import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  assessVerseMatch,
  getVersesText,
  loadCorpus,
  selectRecognitionCandidates,
  recoverLeadingVerse,
} from "@/lib/verse-match";

beforeAll(async () => {
  const corpus = JSON.parse(
    readFileSync(resolve("public/quran-corpus.json"), "utf8")
  );
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => corpus })));
  await loadCorpus();
});

describe("recoverLeadingVerse", () => {
  it("includes a preceding verse when voiced audio begins long before the transcript", () => {
    const result = recoverLeadingVerse(
      { surah: 1, ayahStart: 2, ayahEnd: 7, score: 0.95 },
      5.5,
      0.6
    );

    expect(result.recovered).toBe(true);
    expect(result.match.ayahStart).toBe(1);
    expect(result.leadingUnrecognizedSeconds).toBeCloseTo(4.9);
  });

  it("does not expand for normal model latency", () => {
    const result = recoverLeadingVerse(
      { surah: 2, ayahStart: 255, ayahEnd: 255, score: 0.9 },
      0.8,
      0.2
    );

    expect(result.recovered).toBe(false);
    expect(result.match.ayahStart).toBe(255);
  });
});

describe("assessVerseMatch", () => {
  it("reports a distinctive exact recitation as high confidence", () => {
    const text = getVersesText(1, 1, 7).text;
    const assessment = assessVerseMatch(text);

    expect(assessment.match).toMatchObject({ surah: 1, ayahStart: 1, ayahEnd: 7 });
    expect(assessment.match?.score).toBe(1);
    expect(assessment.confidence).toBe("high");
    expect(assessment.margin).toBeGreaterThan(0.12);
  });

  it("does not pull a short opening verse into a standalone second ayah", () => {
    const text = getVersesText(2, 2, 2).text;
    const assessment = assessVerseMatch(text);

    expect(assessment.match).toMatchObject({ surah: 2, ayahStart: 2, ayahEnd: 2 });
    expect(assessment.confidence).toBe("high");
  });

  it("flags the widely repeated basmala as ambiguous", () => {
    const assessment = assessVerseMatch("بسم الله الرحمن الرحيم");

    expect(assessment.confidence).toBe("low");
    expect(assessment.margin).toBeLessThan(0.06);
    expect(assessment.alternatives.length).toBeGreaterThan(0);
    const candidates = selectRecognitionCandidates(assessment.match!, assessment.alternatives);
    expect(candidates.length).toBeGreaterThan(1);
    expect(new Set(candidates.map((candidate) =>
      `${candidate.surah}:${candidate.ayahStart}-${candidate.ayahEnd}`
    )).size).toBe(candidates.length);
    expect(assessment.alternatives.length).toBeGreaterThan(2);
    expect(selectRecognitionCandidates(
      assessment.match!,
      assessment.alternatives,
      10,
    ).length).toBeGreaterThan(3);
  });

  it("flags a repeated verse within the same surah as ambiguous", () => {
    const assessment = assessVerseMatch(getVersesText(55, 16, 16).text);
    const candidates = selectRecognitionCandidates(
      assessment.match!,
      assessment.alternatives,
      10,
    );

    expect(assessment.confidence).toBe("low");
    expect(assessment.margin).toBe(0);
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ surah: 55, ayahStart: 13, ayahEnd: 13 }),
      expect.objectContaining({ surah: 55, ayahStart: 16, ayahEnd: 16 }),
    ]));
  });

  it("returns no match for unusable input", () => {
    expect(assessVerseMatch("اب").match).toBeNull();
  });

  it.each([
    "مرحبا بكم في هذا الفيديو اليوم سنتحدث عن موضوع مهم",
    "لا إله إلا الله محمد رسول الله",
    "السلام عليكم ورحمة الله وبركاته كيف حالكم",
    "الله أكبر الله أكبر لا إله إلا الله",
  ])("does not confidently auto-apply non-recitation Arabic: %s", (text) => {
    expect(assessVerseMatch(text).confidence).toBe("low");
  });

  it("recovers the correct short ayah without confidently applying a wrong surah", () => {
    const assessment = assessVerseMatch("مالك يوم الدينين");

    expect(assessment.match).toMatchObject({ surah: 1, ayahStart: 4, ayahEnd: 4 });
    expect(assessment.match?.score).toBeGreaterThan(0.8);
    expect(assessment.confidence).toBe("low");
  });

  it("keeps exact repeated short ayahs available for creator review", () => {
    const assessment = assessVerseMatch("الرحمن الرحيم");
    const candidates = selectRecognitionCandidates(
      assessment.match!,
      assessment.alternatives,
      10,
    );

    expect(assessment.confidence).toBe("low");
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ surah: 1, ayahStart: 3, ayahEnd: 3 }),
    ]));
  });
});
