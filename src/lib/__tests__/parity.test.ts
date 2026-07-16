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

describe("effectiveAudioBounds is the shared audio-span rule", () => {
  it("maps a mid-verse trim proportionally", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 10, end: 20, wordRange: { from: 5, to: 9 } };
    const [lo, hi] = effectiveAudioBounds(tm, 10);
    expect(lo).toBe(15);
    expect(hi).toBe(20);
  });

  it("a zero-length verse is left alone", () => {
    const tm: VerseTiming = { verseNumber: 1, start: 5, end: 5, wordRange: { from: 0, to: 1 } };
    expect(effectiveAudioBounds(tm, 10)).toEqual([5, 5]);
  });
});

describe("split timing uses the audio-start origin (front-trim + splits)", () => {
  // The preview (imported-player) times split transitions off the true audio
  // playhead, which for a front word-trim starts at effectiveAudioBounds().lo,
  // not tm.start. Export must add its elapsed to lo too, or splits transition at
  // the wrong moment vs the preview. This pins WHY the origin must be lo: the
  // two origins pick different segments at the same elapsed time.
  const tm: VerseTiming = {
    verseNumber: 1,
    start: 0,
    end: 10,
    splits: [5],
    wordRange: { from: 2, to: 9 },
  };
  const [lo] = effectiveAudioBounds(tm, verseWordCount(TEXT)); // 2

  it("lo is past tm.start when the verse is front-trimmed", () => {
    expect(lo).toBe(2);
  });

  it("at the same elapsed the lo-origin and tm.start-origin pick different segments", () => {
    const elapsed = 3.5; // audio has played 3.5s; true playhead = lo + 3.5 = 5.5
    const correct = segmentFor(verse, tm, lo + elapsed); // 5.5 → past the split
    const buggy = segmentFor(verse, tm, tm.start + elapsed); // 3.5 → before the split
    expect(correct.isLast).toBe(true); // segment after the split
    expect(buggy.isLast).toBe(false); // segment before it — the old wrong origin
    expect(correct.ar).not.toBe(buggy.ar);
  });

  it("the lo-origin matches what the preview computes at the true playhead", () => {
    const elapsed = 3.5;
    const preview = verseTextAt(tm, TEXT, lo + elapsed); // imported-player uses true t
    const exported = segmentFor(verse, tm, lo + elapsed).ar;
    expect(exported).toBe(preview);
  });
});
