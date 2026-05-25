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
      ? v.translations[0].text
          .replace(/<sup[^>]*>.*?<\/sup>/gi, "")
          .replace(/<[^>]*>/g, "")
          .replace(/(?<=[a-zA-Z])\d+/g, "")
          .replace(/\.\d+/g, ".")
          .trim()
      : undefined,
  }));
}

export function getAudioUrl(reciterFolder: string, surahNumber: number, ayahNumber: number): string {
  const surah = String(surahNumber).padStart(3, "0");
  const ayah = String(ayahNumber).padStart(3, "0");
  return `${EVERYAYAH_BASE}/${reciterFolder}/${surah}${ayah}.mp3`;
}

export interface WordTiming {
  wordPosition: number;
  startMs: number;
  endMs: number;
}

export interface VerseTiming {
  verseKey: string;
  timestampFrom: number;
  timestampTo: number;
  wordTimings: WordTiming[];
}

export async function fetchChapterTimings(
  recitationId: number,
  chapterNumber: number
): Promise<VerseTiming[]> {
  const res = await fetch(
    `${QURAN_API}/chapter_recitations/${recitationId}/${chapterNumber}`
  );
  const data = await res.json();
  const audioFile = data.audio_file;
  if (!audioFile?.verse_timings) return [];

  return audioFile.verse_timings.map((vt: any) => ({
    verseKey: vt.verse_key,
    timestampFrom: vt.timestamp_from,
    timestampTo: vt.timestamp_to,
    wordTimings: (vt.segments || [])
      .filter((s: any[]) => s.length >= 3 && s[1] !== null && s[2] !== null)
      .map((s: any[]) => ({
        wordPosition: s[0],
        startMs: s[1],
        endMs: s[2],
      })),
  }));
}

export interface WordData {
  position: number;
  textUthmani: string;
  translation: string | null;
}

export async function fetchWordsByVerse(
  chapterNumber: number,
  verseNumber: number,
  translationResourceId: number = 20
): Promise<WordData[]> {
  const res = await fetch(
    `${QURAN_API}/verses/by_key/${chapterNumber}:${verseNumber}?language=en&words=true&word_fields=text_uthmani&translation_fields=text&translations=${translationResourceId}&per_page=300`
  );
  const data = await res.json();
  const verse = data.verse;
  if (!verse?.words) return [];

  return verse.words
    .filter((w: any) => w.char_type_name === "word")
    .map((w: any) => ({
      position: w.position,
      textUthmani: w.text_uthmani,
      translation: w.translation?.text ?? null,
    }));
}
