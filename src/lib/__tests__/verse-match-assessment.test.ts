import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { assessVerseMatch, getVersesText, loadCorpus } from "@/lib/verse-match";

beforeAll(async () => {
  const corpus = JSON.parse(
    readFileSync(resolve("public/quran-corpus.json"), "utf8")
  );
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => corpus })));
  await loadCorpus();
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

  it("flags the widely repeated basmala as ambiguous", () => {
    const assessment = assessVerseMatch("بسم الله الرحمن الرحيم");

    expect(assessment.confidence).toBe("low");
    expect(assessment.margin).toBeLessThan(0.06);
    expect(assessment.alternatives.length).toBeGreaterThan(0);
  });

  it("returns no match for unusable input", () => {
    expect(assessVerseMatch("اب").match).toBeNull();
  });
});
