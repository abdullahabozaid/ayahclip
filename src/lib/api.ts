import { Surah, Verse } from "@/types";

const QURAN_API = "https://api.quran.com/api/v4";
const EVERYAYAH_BASE = "https://everyayah.com/data";

export async function fetchSurahs(): Promise<Surah[]> {
  const res = await fetch(`${QURAN_API}/chapters?language=en`);
  const data = await res.json();
  return data.chapters;
}

export async function fetchVerses(
  surahId: number,
  translationId: number = 20
): Promise<Verse[]> {
  const perPage = 300;
  const res = await fetch(
    `${QURAN_API}/verses/by_chapter/${surahId}?language=en&translations=${translationId}&fields=text_uthmani&per_page=${perPage}`
  );
  const data = await res.json();
  return data.verses.map((v: any) => ({
    id: v.id,
    verse_number: v.verse_number,
    verse_key: v.verse_key,
    text_uthmani: v.text_uthmani,
    translation: v.translations?.[0]?.text
      ? v.translations[0].text.replace(/<[^>]*>/g, "")
      : undefined,
  }));
}

export function getAudioUrl(reciterFolder: string, surahNumber: number, ayahNumber: number): string {
  const surah = String(surahNumber).padStart(3, "0");
  const ayah = String(ayahNumber).padStart(3, "0");
  return `${EVERYAYAH_BASE}/${reciterFolder}/${surah}${ayah}.mp3`;
}
