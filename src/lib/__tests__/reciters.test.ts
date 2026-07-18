import { describe, expect, it } from "vitest";

import {
  reciterSourceKey,
  resolveReciterVerseAudio,
  tryResolveReciterVerseAudio,
} from "../reciter-audio";
import { getReciterOrDefault, reciters, RECITER_REGIONS, supportsWordTimings } from "../reciters";

describe("reciter audio sources", () => {
  it("uses EveryAyah's verified Minshawy Murattal directory spelling", () => {
    const reciter = reciters.find((item) => item.id === "minshawi-murattal");

    expect(reciter?.audioSource).toMatchObject({
      kind: "everyayah",
      folder: "Minshawy_Murattal_128kbps",
    });
    expect(resolveReciterVerseAudio(reciter!, 1, 1).url).toBe(
      "https://everyayah.com/data/Minshawy_Murattal_128kbps/001001.mp3"
    );
  });

  it("offers a broad, grouped verse-level catalog", () => {
    expect(reciters.length).toBeGreaterThanOrEqual(40);
    expect(new Set(reciters.map((reciter) => reciter.id)).size).toBe(reciters.length);
    expect(new Set(reciters.map((reciter) => reciterSourceKey(reciter.audioSource))).size).toBe(reciters.length);

    for (const region of RECITER_REGIONS) {
      expect(reciters.some((reciter) => reciter.region === region.id)).toBe(true);
    }
  });

  it("distinguishes word-synced voices from whole-verse sources", () => {
    expect(supportsWordTimings(reciters.find((reciter) => reciter.id === "alafasy"))).toBe(true);
    expect(supportsWordTimings(reciters.find((reciter) => reciter.id === "yasser-dossary"))).toBe(false);
    expect(reciters.find((reciter) => reciter.id === "husary-muallim")?.quranComRecitationId).toBe(12);
  });

  it("resolves every catalog entry through the shared provenance-aware path", () => {
    for (const reciter of reciters) {
      const start = resolveReciterVerseAudio(reciter, 1, 1);
      const middle = resolveReciterVerseAudio(reciter, 55, 13);
      const end = resolveReciterVerseAudio(reciter, 114, 6);

      if (reciter.audioSource.kind === "everyayah") {
        expect(start.url).toMatch(/^https:\/\/everyayah\.com\/data\/.+\/001001\.mp3$/);
        expect(middle.url).toMatch(/\/055013\.mp3$/);
        expect(end.url).toMatch(/\/114006\.mp3$/);
        expect(start.attribution).toMatchObject({
          label: "EveryAyah.com",
          url: "https://everyayah.com",
        });
      } else {
        expect(start.url).toMatch(/\/001\.mp3$/);
        expect(middle.url).toMatch(/\/055\.mp3$/);
        expect(end.url).toMatch(/\/114\.mp3$/);
        expect(start.attribution).toMatchObject({
          label: "MP3Quran.net",
          url: "https://mp3quran.net",
        });
        expect(start.chapterCue).toEqual({
          provider: "mp3quran",
          readId: reciter.audioSource.readId,
          surahNumber: 1,
          ayahNumber: 1,
        });
      }
      expect(start.sourceKey).toBe(reciterSourceKey(reciter.audioSource));
      expect(start.timingCapability).toBe(
        supportsWordTimings(reciter) ? "word-synchronised" : "whole-ayah"
      );
    }
  });

  it("admits only audited complete MP3Quran timed reads", () => {
    const expected = [
      ["abdelbari-toubayti", 49, "https://server6.mp3quran.net/thubti/"],
      ["abdullah-buaijan", 58, "https://server8.mp3quran.net/buajan/"],
      ["abdullah-khayyat", 61, "https://server12.mp3quran.net/kyat/"],
      ["abdulwadood-haneef", 71, "https://server8.mp3quran.net/wdod/"],
      ["emad-hafez", 78, "https://server6.mp3quran.net/hafz/"],
      ["idrees-abkr", 12, "https://server6.mp3quran.net/abkr/"],
      ["khalid-almohana", 159, "https://server11.mp3quran.net/mohna/"],
      ["khalid-jileel", 20, "https://server10.mp3quran.net/jleel/"],
      ["mohammad-khalil-al-qari", 229, "https://server8.mp3quran.net/m_qari/"],
      ["bandar-balilah", 217, "https://server6.mp3quran.net/balilah/"],
      ["raad-kurdi", 221, "https://server6.mp3quran.net/kurdi/"],
      ["mansour-salimi", 245, "https://server14.mp3quran.net/mansor/"],
      ["ahmad-nufais", 259, "https://server16.mp3quran.net/nufais/Rewayat-Hafs-A-n-Assem/"],
      ["peshawa-qadr-kurdi", 268, "https://server16.mp3quran.net/peshawa/Rewayat-Hafs-A-n-Assem/"],
      ["abdulaziz-turki", 282, "https://server16.mp3quran.net/a_turki/Rewayat-Hafs-A-n-Assem/"],
      ["anas-emadi", 314, "https://server16.mp3quran.net/a_alemadi/Rewayat-Hafs-A-n-Assem/"],
      ["ahmad-hawashi", 6, "https://server11.mp3quran.net/hawashi/"],
      ["abdulaziz-al-ahmad", 55, "https://server11.mp3quran.net/a_ahmed/"],
      ["abdullah-al-mousa", 243, "https://server14.mp3quran.net/mousa/Rewayat-Hafs-A-n-Assem/"],
      ["abdulrahman-al-oosi", 225, "https://server6.mp3quran.net/aloosi/"],
      ["haitham-al-dokhin", 273, "https://server16.mp3quran.net/h_dukhain/Rewayat-Hafs-A-n-Assem/"],
      ["tawfeeq-as-sayegh", 17, "https://server6.mp3quran.net/twfeeq/"],
      ["abdulrasheed-soufi", 258, "https://server16.mp3quran.net/soufi/Rewayat-Hafs-A-n-Assem/"],
      ["muhammad-burhaji", 340, "https://server16.mp3quran.net/M_Burhaji/Rewayat-Hafs-A-n-Assem/"],
      ["abdullah-al-khalaf", 244, "https://server14.mp3quran.net/khalf/"],
      ["khalid-abdulkafi", 22, "https://server11.mp3quran.net/kafi/"],
      ["majed-al-zamil", 139, "https://server9.mp3quran.net/zaml/"],
      ["saleh-alshamrani", 300, "https://server16.mp3quran.net/shamrani/Rewayat-Hafs-A-n-Assem/"],
      ["hassan-aldaghriri", 10905, "https://server16.mp3quran.net/H-Aldaghriri/Rewayat-Hafs-A-n-Assem/"],
      ["alzain-mohammad-ahmad", 13, "https://server9.mp3quran.net/alzain/"],
      ["ahmad-deban", 265, "https://server16.mp3quran.net/deban/Rewayat-Hafs-A-n-Assem/"],
      ["sayed-ahmad-hashemi", 294, "https://server16.mp3quran.net/s_hashemi/Rewayat-Hafs-A-n-Assem/"],
      ["wadeea-al-yamani", 219, "https://server6.mp3quran.net/wdee3/"],
      ["ibrahim-al-asiri", 3, "https://server6.mp3quran.net/3siri/"],
      ["ahmad-saber", 8, "https://server8.mp3quran.net/saber/"],
      ["dawood-hamza", 25, "https://server9.mp3quran.net/hamza/"],
      ["zaki-daghistani", 33, "https://server9.mp3quran.net/zaki/"],
      ["shirazad-taher", 38, "https://server12.mp3quran.net/taher/"],
      ["saber-abdulhakm", 39, "https://server12.mp3quran.net/hkm/"],
      ["saleh-alsahood", 40, "https://server8.mp3quran.net/sahood/"],
      ["saleh-al-habdan", 42, "https://server6.mp3quran.net/habdan/"],
      ["salah-alhashim", 44, "https://server12.mp3quran.net/salah_hashim_m/"],
      ["adel-ryyan", 48, "https://server8.mp3quran.net/ryan/"],
      ["abdulbari-mohammad", 50, "https://server12.mp3quran.net/bari/"],
      ["abdulmohsin-al-harthy", 66, "https://server6.mp3quran.net/mohsin_harthi/"],
      ["abdulhadi-kanakeri", 70, "https://server6.mp3quran.net/kanakeri/"],
      ["neamah-al-hassan", 88, "https://server8.mp3quran.net/namh/"],
      ["yousef-bin-noah-ahmad", 193, "https://server8.mp3quran.net/noah/"],
      ["ahmed-al-trabulsi", 201, "https://server10.mp3quran.net/trabulsi/"],
      ["ahmed-amer", 203, "https://server10.mp3quran.net/Aamer/"],
      ["abdulrahman-al-majed", 236, "https://server10.mp3quran.net/a_majed/"],
      ["mohammad-albukheet", 250, "https://server14.mp3quran.net/bukheet/"],
      ["khalid-mohammadi", 295, "https://server16.mp3quran.net/kh_mohammadi/Rewayat-Hafs-A-n-Assem/"],
      ["issa-omar-sanankoua", 303, "https://server16.mp3quran.net/i_sanankoua/Rewayat-Hafs-A-n-Assem/"],
      ["mohammad-saleh-alim-shah", 110, "https://server12.mp3quran.net/shah/"],
    ] as const;

    const chapterReciters = reciters.filter((item) => item.audioSource.kind === "chapter-cues");
    expect(chapterReciters).toHaveLength(expected.length);
    for (const [id, readId, server] of expected) {
      const reciter = reciters.find((item) => item.id === id);
      expect(reciter?.audioSource).toMatchObject({
        kind: "chapter-cues",
        provider: "mp3quran",
        readId,
        server,
      });
      expect(resolveReciterVerseAudio(reciter!, 2, 255)).toMatchObject({
        url: `${server}002.mp3`,
        sourceKind: "chapter-cues",
        timingCapability: "whole-ayah",
      });
    }
  });

  it("returns a recoverable result for an invalid Quran reference", () => {
    const result = tryResolveReciterVerseAudio(reciters[0], 0, 1);

    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toContain("Surah between 1 and 114");
  });

  it("preserves Alafasy as the safe fallback for legacy project ids", () => {
    expect(getReciterOrDefault("missing-reciter").id).toBe("alafasy");
  });
});
