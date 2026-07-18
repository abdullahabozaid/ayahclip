import { beforeEach, describe, expect, it } from "vitest";
import {
  hydrateStoreFromMobileProject,
  snapshotFromRecognition,
  snapshotFromWebProject,
} from "../mobile-project-adapter";
import { useAppStore } from "../store";
import type { Surah, Verse } from "@/types";

const surah: Surah = {
  id: 93,
  name_simple: "Ad-Duhaa",
  name_arabic: "الضحى",
  verses_count: 11,
  revelation_place: "makkah",
  translated_name: { name: "The Morning Hours", language_name: "english" },
};
const verses: Verse[] = [
  { id: 1, verse_number: 1, verse_key: "93:1", text_uthmani: "وَٱلضُّحَىٰ", translation: "By the morning sunlight" },
  { id: 2, verse_number: 2, verse_key: "93:2", text_uthmani: "وَٱلَّيْلِ", translation: "And the night" },
];

describe("native mobile project adapter", () => {
  beforeEach(() => useAppStore.getState().beginNewProject());

  it("hydrates Quran selection, imported media, timing and side-fade styling", async () => {
    const snapshot = {
      schemaVersion: 1 as const,
      id: "842ea782-ded2-4c04-a442-e5125a18d251",
      title: "Ad-Duhaa 1-2",
      quran: { surahId: 93, surahName: "Surah Ad-Duhaa", verseNumbers: [1, 2], reciterId: null },
      segments: [
        { id: "d7dd3005-0143-41d8-a5ad-5d2ad9814458", verseNumber: 1, start: 0, end: 2, arabic: "وَٱلضُّحَىٰ", translation: "By the morning sunlight" },
        { id: "304fe762-fc85-477e-9530-74e67fc76e0f", verseNumber: 2, start: 2, end: 4, arabic: "وَٱلَّيْلِ", translation: "And the night" },
      ],
      style: { layout: "sideFade" as const, captionStyle: "softGlow" as const, arabicSize: 38, translationSize: 16, overlayOpacity: 0.4 },
      media: [{ id: "owned", url: "ayahclip-media://asset/owned", contentType: "video/mp4", fileSize: 100 }],
      createdAtMilliseconds: 1,
      updatedAtMilliseconds: 2,
    };

    await hydrateStoreFromMobileProject(snapshot, {
      fetchSurahs: async () => [surah],
      fetchVerses: async () => verses,
    });

    const state = useAppStore.getState();
    expect(state.surah?.id).toBe(93);
    expect(state.selectedVerseNumbers).toEqual([1, 2]);
    expect(state.textLayout).toBe("left-panel");
    expect(state.splitMask.solidWidth).toBe(42);
    expect(state.arabicFontSize).toBe(38);
    expect(state.background.value).toBe(snapshot.media[0].url);
    expect(state.audioSource).toMatchObject({ mode: "imported", url: snapshot.media[0].url });

    const returned = snapshotFromWebProject(snapshot, {
      id: snapshot.id,
      name: snapshot.title,
      surahId: 93,
      surahName: "Ad-Duhaa",
      selectedVerseNumbers: [1, 2],
      settings: {
        reciterId: state.reciterId,
        videoFormat: state.videoFormat,
        arabicFontSize: state.arabicFontSize,
        arabicFont: state.arabicFont,
        translationEnabled: state.translationEnabled,
        translationFontSize: state.translationFontSize,
        translationFont: state.translationFont,
        translationLanguage: state.translationLanguage,
        textColor: state.textColor,
        lineHeight: state.lineHeight,
        textPosition: state.textPosition,
        overlayOpacity: state.overlayOpacity,
        overlayColor: state.overlayColor,
        background: state.background,
        textShadow: state.textShadow,
        letterbox: state.letterbox,
      },
      imported: { name: "Imported recitation", timings: state.audioSource.mode === "imported" ? state.audioSource.timings : [], videoBg: true },
      createdAt: 1,
      updatedAt: 2,
    }, state);
    expect(returned.segments.map((segment) => [segment.start, segment.end]))
      .toEqual([[0, 2], [2, 4]]);
    expect(returned.editorDocumentJSON).toContain("ayahclip-native-ref://media/0");
    expect(returned.editorDocumentJSON).not.toContain(snapshot.media[0].url);
  });

  it("turns a creator-confirmed recognition result into a valid native project", () => {
    const base = {
      schemaVersion: 1 as const,
      id: "842ea782-ded2-4c04-a442-e5125a18d251",
      title: "New Quran clip",
      quran: null,
      segments: [],
      style: { layout: "centered" as const, captionStyle: "softGlow" as const, arabicSize: 36, translationSize: 15, overlayOpacity: 0.35 },
      media: [{ id: "owned", url: "ayahclip-media://asset/owned", contentType: "audio/mp4", fileSize: 100 }],
      createdAtMilliseconds: 1,
      updatedAtMilliseconds: 2,
    };
    const result = snapshotFromRecognition(base, surah, verses, [1, 2], [
      { verseNumber: 1, start: 0.2, end: 2.1 },
      { verseNumber: 2, start: 2.1, end: 4.4 },
    ]);

    expect(result.title).toBe("Ad-Duhaa 1-2");
    expect(result.quran).toMatchObject({ surahId: 93, verseNumbers: [1, 2] });
    expect(result.segments.map((segment) => [segment.verseNumber, segment.start, segment.end]))
      .toEqual([[1, 0.2, 2.1], [2, 2.1, 4.4]]);
    expect(result.segments[0].arabic).toBe("وَٱلضُّحَىٰ");
  });

  it("rejects a recognition result whose verses and timing disagree", () => {
    const base = {
      schemaVersion: 1 as const,
      id: "842ea782-ded2-4c04-a442-e5125a18d251",
      title: "New Quran clip",
      quran: null,
      segments: [],
      style: { layout: "centered" as const, captionStyle: "softGlow" as const, arabicSize: 36, translationSize: 15, overlayOpacity: 0.35 },
      media: [],
      createdAtMilliseconds: 1,
      updatedAtMilliseconds: 2,
    };
    expect(() => snapshotFromRecognition(base, surah, verses, [1, 2], [
      { verseNumber: 1, start: 0, end: 2 },
    ])).toThrow(/do not match/i);
  });
});
