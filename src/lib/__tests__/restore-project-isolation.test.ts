import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, restoreSettingsDefaults } from "../store";
import type { Surah, Verse } from "@/types";

const surah: Surah = {
  id: 1,
  name_simple: "Al-Fatihah",
  name_arabic: "الفاتحة",
  verses_count: 7,
  revelation_place: "makkah",
  translated_name: { name: "The Opener" },
} as Surah;

const verses: Verse[] = [
  { id: 1, verse_number: 1, verse_key: "1:1", text_uthmani: "بِسْمِ ٱللَّهِ", translation: "In the name of Allah" } as Verse,
];

// Reopening a saved clip must never show ANOTHER clip's settings, captions,
// or decorations. Records saved before a feature existed carry no key for it,
// so every missing key has to restore to its feature-off default — not to
// whatever the previously open clip left in the store.
describe("restoreProject isolates clips from previous session state", () => {
  beforeEach(() => {
    // Simulate "previous clip left rich state behind".
    useAppStore.setState({
      emphasis: { "1:1": { arabic: [0], translation: [1] } },
      emphasisColor: "#ff0000",
      wordHighlight: true,
      highlightEnabled: true,
      highlightColor: "#123456",
      safeAreaTarget: "tiktok",
      safePadding: 12,
      fitBackdrop: "black",
      backgroundVideoSync: true,
      verseIntro: "slide",
      verseIntroMs: 900,
      arabicFontWeight: 700,
      translationLineHeight: 1.8,
      activePartIndex: 2,
      activeWordIndex: 4,
      playbackSegmentArabic: "stale segment",
      playbackSegmentTranslation: "stale translation",
      pendingTemplateMedia: { templateName: "Old", slots: [] },
    });
  });

  it("restores feature-off defaults for keys a legacy record does not carry", () => {
    useAppStore.getState().restoreProject(surah, verses, [1], {
      // A minimal legacy record: none of the newer settings keys exist.
      reciterId: "alafasy",
      videoFormat: "9:16",
    } as never, "legacy-project");

    const s = useAppStore.getState();
    const defaults = restoreSettingsDefaults();
    expect(s.emphasis).toEqual({});
    expect(s.emphasisColor).toBe(defaults.emphasisColor);
    expect(s.wordHighlight).toBe(false);
    expect(s.highlightEnabled).toBe(false);
    expect(s.highlightColor).toBe(defaults.highlightColor);
    expect(s.safeAreaTarget).toBe("none");
    expect(s.safePadding).toBe(0);
    expect(s.fitBackdrop).toBe("blur");
    expect(s.backgroundVideoSync).toBe(false);
    expect(s.verseIntro).toBe("none");
    expect(s.verseIntroMs).toBe(defaults.verseIntroMs);
    expect(s.arabicFontWeight).toBe(400);
    expect(s.translationLineHeight).toBe(1);
    // Pre-existing legacy fallbacks must keep their restore-specific values.
    expect(s.clipFadeMs).toBe(0);
    expect(s.arabicInkThickness).toBe(0);
    expect(s.textOutline.enabled).toBe(false);
  });

  it("keeps every value the record actually carries", () => {
    useAppStore.getState().restoreProject(surah, verses, [1], {
      reciterId: "alafasy",
      videoFormat: "9:16",
      wordHighlight: true,
      highlightEnabled: true,
      highlightColor: "#654321",
      safeAreaTarget: "reels",
      verseIntro: "fade",
      clipFadeMs: 250,
      emphasis: { "1:1": { arabic: [1], translation: [] } },
    } as never, "full-project");

    const s = useAppStore.getState();
    expect(s.wordHighlight).toBe(true);
    expect(s.highlightEnabled).toBe(true);
    expect(s.highlightColor).toBe("#654321");
    expect(s.safeAreaTarget).toBe("reels");
    expect(s.verseIntro).toBe("fade");
    expect(s.clipFadeMs).toBe(250);
    expect(s.emphasis).toEqual({ "1:1": { arabic: [1], translation: [] } });
  });

  it("resets transient playback and template state", () => {
    useAppStore.getState().restoreProject(surah, verses, [1], {
      reciterId: "alafasy",
      videoFormat: "9:16",
    } as never, "any-project");

    const s = useAppStore.getState();
    expect(s.activePartIndex).toBe(0);
    expect(s.activeWordIndex).toBeNull();
    expect(s.playbackSegmentArabic).toBeNull();
    expect(s.playbackSegmentTranslation).toBeNull();
    expect(s.playbackSegmentIsLast).toBe(true);
    expect(s.pendingTemplateMedia).toBeNull();
    expect(s.currentVerseIndex).toBe(0);
  });

  it("never treats an explicitly-undefined key as provided", () => {
    useAppStore.getState().restoreProject(surah, verses, [1], {
      reciterId: "alafasy",
      videoFormat: "9:16",
      wordHighlight: undefined,
    } as never, "undef-project");
    expect(useAppStore.getState().wordHighlight).toBe(false);
  });
});
