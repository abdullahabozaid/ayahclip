import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  assessVerseMatch,
  getVersesText,
  hasCompetingRecognitionWindow,
  loadCorpus,
  recoverRecognitionWindowCandidates,
  selectRecognitionCandidates,
  recoverLeadingVerse,
} from "@/lib/verse-match";
import { recognitionTranscriptWindows } from "@/lib/recognition-retry";

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

describe("pause-bounded recognition conflicts", () => {
  const primary = { surah: 89, ayahStart: 5, ayahEnd: 10, score: 0.88 };

  it("flags a different strong passage before medium-confidence auto-apply", () => {
    expect(hasCompetingRecognitionWindow(primary, [
      { surah: 89, ayahStart: 6, ayahEnd: 10, score: 1 },
      { surah: 1, ayahStart: 2, ayahEnd: 2, score: 1 },
    ])).toBe(true);
  });

  it("allows a weaker overlapping same-surah fragment created by an ordinary ayah pause", () => {
    expect(hasCompetingRecognitionWindow(primary, [
      { surah: 89, ayahStart: 6, ayahEnd: 8, score: 0.89 },
    ])).toBe(false);
  });

  it("flags a stronger overlapping window that corrects an expanded medium range", () => {
    expect(hasCompetingRecognitionWindow(primary, [
      { surah: 89, ayahStart: 6, ayahEnd: 10, score: 0.96 },
    ])).toBe(true);
  });

  it("allows a non-overlapping later same-surah window from a continuous recitation", () => {
    // A 4-min continuous recitation naturally yields pause windows covering
    // sequential, non-overlapping ranges of the same surah. That is expected,
    // not a competing passage, as long as it does not materially out-score.
    expect(hasCompetingRecognitionWindow(primary, [
      { surah: 89, ayahStart: 11, ayahEnd: 14, score: 0.86 },
    ])).toBe(false);
  });

  it("still flags a different surah appearing in any window", () => {
    expect(hasCompetingRecognitionWindow(primary, [
      { surah: 89, ayahStart: 11, ayahEnd: 14, score: 0.86 },
      { surah: 12, ayahStart: 1, ayahEnd: 3, score: 0.7 },
    ])).toBe(true);
  });

  it("does not interrupt a decisive whole-clip read for a weaker different-surah echo", () => {
    // Ibrahim 22 closes on phrasing that recurs elsewhere in the Quran, so a
    // trailing pause window can match a short verse in another surah. When the
    // whole clip reads decisively (>= 0.9, the "high" bar), that echo must not
    // force the manual range chooser.
    const decisive = { surah: 14, ayahStart: 22, ayahEnd: 22, score: 0.95 };
    expect(hasCompetingRecognitionWindow(decisive, [
      { surah: 5, ayahStart: 36, ayahEnd: 36, score: 0.87 },
      { surah: 3, ayahStart: 176, ayahEnd: 177, score: 0.85 },
    ])).toBe(false);
  });

  it("still defers to the user when a different-surah window matches a decisive read", () => {
    const decisive = { surah: 14, ayahStart: 22, ayahEnd: 22, score: 0.95 };
    expect(hasCompetingRecognitionWindow(decisive, [
      { surah: 5, ayahStart: 36, ayahEnd: 36, score: 0.96 },
    ])).toBe(true);
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

  it("recovers a Quran range for review from a pause-separated spoken intro", () => {
    const quran = getVersesText(89, 6, 10).text;
    const intro = "هذا حديث قبل التلاوة وليس من القرآن الكريم";
    const words = `${intro} ${quran}`.split(/\s+/);
    const boundaryIndex = intro.split(/\s+/).length;
    const windows = recognitionTranscriptWindows({
      text: words.join(" "),
      charTimes: [],
      wordStarts: words.map((_, index) => index * 0.35),
    }, [{ time: boundaryIndex * 0.35 - 0.1, len: 0.35 }], words.length * 0.35 + 1);

    expect(recoverRecognitionWindowCandidates(windows)[0]).toMatchObject({
      surah: 89,
      ayahStart: 6,
      ayahEnd: 10,
    });
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

  it("offers the canonical basmala for a corrupted short opening without auto-applying it", () => {
    const assessment = assessVerseMatch("بسوسوعسلامية");
    const candidates = selectRecognitionCandidates(
      assessment.match!,
      assessment.alternatives,
      3,
    );

    expect(assessment.confidence).toBe("low");
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ surah: 1, ayahStart: 1, ayahEnd: 1 }),
    ]));
  });

  it("does not inject the canonical basmala without the opening cue", () => {
    const assessment = assessVerseMatch("فوسوس اليه الشيطان");
    const candidates = selectRecognitionCandidates(
      assessment.match!,
      assessment.alternatives,
      3,
    );

    expect(candidates).not.toContainEqual(
      expect.objectContaining({ surah: 1, ayahStart: 1, ayahEnd: 1 }),
    );
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

  it("ranks the complete short ayah before a longer verse with the same ending", () => {
    const assessment = assessVerseMatch("الحمد لله رب العالمينِينَ");
    const candidates = selectRecognitionCandidates(
      assessment.match!,
      assessment.alternatives,
      10,
    );

    expect(assessment.match).toMatchObject({ surah: 1, ayahStart: 2, ayahEnd: 2 });
    expect(assessment.confidence).toBe("low");
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ surah: 37, ayahStart: 182, ayahEnd: 182 }),
    ]));
  });
});
