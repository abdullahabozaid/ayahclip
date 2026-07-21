import { describe, expect, it } from "vitest";
import {
  EXAMPLE_CLIPS,
  exampleClipVerseNumbers,
  resolveExampleClipTemplate,
  exampleClipReciterExists,
} from "../example-clips";

describe("example clips catalog integrity", () => {
  it("has a non-empty catalog with unique ids", () => {
    expect(EXAMPLE_CLIPS.length).toBeGreaterThan(0);
    const ids = EXAMPLE_CLIPS.map((clip) => clip.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every clip references a real reciter", () => {
    for (const clip of EXAMPLE_CLIPS) {
      expect(exampleClipReciterExists(clip), `${clip.id} reciter ${clip.reciterId}`).toBe(true);
    }
  });

  it("every clip references a real built-in style template", () => {
    for (const clip of EXAMPLE_CLIPS) {
      expect(resolveExampleClipTemplate(clip), `${clip.id} template ${clip.styleTemplateId}`).toBeDefined();
    }
  });

  it("every clip has a valid surah and non-decreasing ayah range", () => {
    for (const clip of EXAMPLE_CLIPS) {
      expect(clip.surah, clip.id).toBeGreaterThanOrEqual(1);
      expect(clip.surah, clip.id).toBeLessThanOrEqual(114);
      expect(clip.ayahStart, clip.id).toBeGreaterThanOrEqual(1);
      expect(clip.ayahEnd, clip.id).toBeGreaterThanOrEqual(clip.ayahStart);
    }
  });

  it("B-roll backgrounds, when present, are image/video/gradient/solid assets", () => {
    for (const clip of EXAMPLE_CLIPS) {
      for (const bg of clip.broll ?? []) {
        expect(["image", "video", "gradient", "solid"], clip.id).toContain(bg.type);
        expect(typeof bg.value, clip.id).toBe("string");
      }
    }
  });
});

describe("exampleClipVerseNumbers", () => {
  it("expands an inclusive range", () => {
    expect(exampleClipVerseNumbers({ ayahStart: 13, ayahEnd: 16 })).toEqual([13, 14, 15, 16]);
  });

  it("handles a single-verse clip", () => {
    expect(exampleClipVerseNumbers({ ayahStart: 255, ayahEnd: 255 })).toEqual([255]);
  });

  it("normalizes a reversed range", () => {
    expect(exampleClipVerseNumbers({ ayahStart: 5, ayahEnd: 1 })).toEqual([1, 2, 3, 4, 5]);
  });
});
