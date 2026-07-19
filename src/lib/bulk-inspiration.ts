export interface BulkHadith {
  kind: "hadith";
  text: string;
  reference: string;
  sourceUrl: string;
}

export interface BulkAyahReference {
  kind: "ayah";
  surah: number;
  ayah: number;
  reference: string;
}

export const BULK_HADITHS: readonly BulkHadith[] = [
  {
    kind: "hadith",
    text: "The most beloved deed to Allah is the most regular and constant, even if it were little.",
    reference: "Sahih al-Bukhari 6464",
    sourceUrl: "https://sunnah.com/bukhari:6464",
  },
  {
    kind: "hadith",
    text: "Take on only as much as you can do of good deeds, for the best of deeds is that which is done consistently.",
    reference: "Sahih al-Bukhari 43",
    sourceUrl: "https://sunnah.com/bukhari:43",
  },
  {
    kind: "hadith",
    text: "Allah does not look at your appearance or wealth, but He looks at your hearts and deeds.",
    reference: "Sahih Muslim 2564c",
    sourceUrl: "https://sunnah.com/muslim:2564c",
  },
  {
    kind: "hadith",
    text: "Everyone will be with those whom they love.",
    reference: "Sahih al-Bukhari 6169",
    sourceUrl: "https://sunnah.com/bukhari:6169",
  },
] as const;
export const BULK_AYAH_REFERENCES: readonly BulkAyahReference[] = [
  { kind: "ayah", surah: 94, ayah: 5, reference: "Ash-Sharh 94:5" },
  { kind: "ayah", surah: 94, ayah: 6, reference: "Ash-Sharh 94:6" },
  { kind: "ayah", surah: 2, ayah: 286, reference: "Al-Baqarah 2:286" },
  { kind: "ayah", surah: 39, ayah: 53, reference: "Az-Zumar 39:53" },
] as const;
