import { describe, expect, it } from "vitest";
import {
  buildSocialCaptionOptions,
  editorialCaptionFrames,
  normalizeCaptionFrames,
  parseSocialCaptionRequest,
  verseReference,
} from "../social-caption";

const request = parseSocialCaptionRequest({
  platform: "tiktok",
  tone: "simple",
  surah: { number: 1, name: "Al-Fatihah", arabicName: "الفاتحة" },
  verseNumbers: [1, 2, 3],
  excerpt: { verseNumber: 1, translation: "In the Name of Allah—the Most Compassionate, Most Merciful." },
  reciterName: "Mishary Rashid Alafasy",
})!;

describe("social caption generator", () => {
  it("accepts only bounded Quran metadata", () => {
    expect(request.verseNumbers).toEqual([1, 2, 3]);
    expect(parseSocialCaptionRequest({ ...request, verseNumbers: [] })).toBeNull();
    expect(parseSocialCaptionRequest({ ...request, surah: { number: 115, name: "Invalid" } })).toBeNull();
    expect(parseSocialCaptionRequest({ ...request, excerpt: { verseNumber: 4, translation: "Wrong verse" } })).toBeNull();
  });

  it("formats contiguous and non-contiguous references honestly", () => {
    expect(verseReference(request)).toBe("Surah Al-Fatihah 1:1–3");
    expect(verseReference({ ...request, verseNumbers: [1, 3] })).toBe("Surah Al-Fatihah 1:1, 1:3");
  });

  it("keeps the exact supplied translation and reference in every option", () => {
    const options = buildSocialCaptionOptions(request, editorialCaptionFrames(request));
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option.text).toContain(request.excerpt!.translation);
      expect(option.text).toContain("Surah Al-Fatihah 1:1–3");
      expect(option.text).toContain("Recited by Mishary Rashid Alafasy");
      expect((option.text.match(/#/g) ?? []).length).toBeLessThanOrEqual(5);
    }
  });

  it("rejects generated framing that quotes or interprets the Quran", () => {
    expect(normalizeCaptionFrames([
      { intro: "This verse means success.", closing: "Save this.", hashtags: ["Quran"] },
      { intro: "A quiet pause.", closing: "Save this.", hashtags: ["Quran"] },
      { intro: "A quiet pause.", closing: "Save this.", hashtags: ["Quran"] },
    ])).toBeNull();
    expect(normalizeCaptionFrames([
      { intro: "A quiet pause.", closing: "Listen again.", hashtags: ["Quran"] },
      { intro: "A calm recitation.", closing: "Keep the reference.", hashtags: ["Quran"] },
      { intro: "Return to the Quran.", closing: "Share with care.", hashtags: ["Quran"] },
    ])).toHaveLength(3);
  });

  it("omits rather than truncates an overlong Quran translation", () => {
    const longRequest = { ...request, excerpt: { verseNumber: 1, translation: "x".repeat(361) } };
    const [option] = buildSocialCaptionOptions(longRequest, editorialCaptionFrames(longRequest));
    expect(option.text).not.toContain("x".repeat(20));
    expect(option.text).toContain("Surah Al-Fatihah 1:1–3");
  });
});
