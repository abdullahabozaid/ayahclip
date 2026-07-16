import { describe, it, expect } from "vitest";
import { verseTextAt, effectiveAudioBounds, type VerseTiming } from "../audio-import";
import { verseWordCount } from "../clip-rows";
import { __test__segmentFor as segmentFor } from "../export";
import type { Verse } from "@/types";

const TEXT = "w1 w2 w3 w4 w5 w6 w7 w8 w9 w10";

const verse: Verse = {
  id: 1,
  verse_number: 1,
  verse_key: "2:1",
  text_uthmani: TEXT,
  translation: "t1 t2 t3 t4 t5 t6 t7 t8 t9 t10",
};

describe("preview/export text parity", () => {
  it("a wordRange with NO splits must trim the exported text", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 0, end: 10, wordRange: { from: 0, to: 3 } };

    const preview = verseTextAt(tm, TEXT, 0);
    const exported = segmentFor(verse, tm, 0).ar;

    expect(preview).toBe("w1 w2 w3 w4");
    expect(exported).toBe(preview);
  });

  it("a wordRange with NO splits must trim the exported translation", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 0, end: 10, wordRange: { from: 2, to: 4 } };

    const preview = verseTextAt(tm, verse.translation!, 0);
    const exported = segmentFor(verse, tm, 0).tr;

    expect(exported).toBe(preview);
  });

  it("no wordRange and no splits still exports the whole verse", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 0, end: 10 };
    expect(segmentFor(verse, tm, 0).ar).toBe(TEXT);
    expect(segmentFor(verse, tm, 0).isLast).toBe(true);
  });

  it("no timing at all exports the whole verse", () => {
    expect(segmentFor(verse, undefined, 0).ar).toBe(TEXT);
  });

  it("splits still drive segment text at each split time", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 0, end: 10, splits: [5] };
    expect(segmentFor(verse, tm, 0).ar).toBe(verseTextAt(tm, TEXT, 0));
    expect(segmentFor(verse, tm, 6).ar).toBe(verseTextAt(tm, TEXT, 6));
    expect(segmentFor(verse, tm, 0).isLast).toBe(false);
    expect(segmentFor(verse, tm, 6).isLast).toBe(true);
  });
});

describe("preview/export audio parity", () => {
  it("a wordRange must trim the exported audio span", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 0, end: 10, wordRange: { from: 0, to: 3 } };
    const [lo, hi] = effectiveAudioBounds(tm, verseWordCount(TEXT));
    expect(lo).toBe(0);
    expect(hi).toBe(4);
  });

  it("no wordRange means the full span", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 2, end: 10 };
    expect(effectiveAudioBounds(tm, verseWordCount(TEXT))).toEqual([2, 10]);
  });
});
