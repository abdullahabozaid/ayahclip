import { Surah, Verse, QcfWord } from "@/types";

const QURAN_API = "https://api.quran.com/api/v4";
const QURAN_CDN_API = "https://api.qurancdn.com/api/qdc";
const ALQURAN_CLOUD = "https://api.alquran.cloud/v1";
const EVERYAYAH_BASE = "https://everyayah.com/data";

/** fetch + JSON with a status check, so an API outage fails with a clear error
 *  instead of "Unexpected token <" from parsing an HTML error page. */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status} ${res.statusText}): ${url}`);
  }
  return res.json() as Promise<T>;
}

interface QuranApiWord {
  position: number;
  code_v2?: string;
  page_number: number;
  line_number: number;
  text_uthmani: string;
  text_qpc_hafs?: string;
  char_type_name: QcfWord["char_type_name"];
  translation?: { text?: string };
}

interface QuranApiVerse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani: string;
  text_qpc_hafs?: string;
  translations?: { text?: string }[];
  words?: QuranApiWord[];
}

interface ApiVerseTiming {
  verse_key: string;
  timestamp_from: number;
  timestamp_to: number;
  segments?: [number, number | null, number | null][];
}

export async function fetchSurahs(): Promise<Surah[]> {
  const data = await fetchJson<{ chapters: Surah[] }>(`${QURAN_API}/chapters?language=en`);
  return data.chapters;
}

export async function fetchVerses(
  surahId: number,
  translationId: number = 20
): Promise<Verse[]> {
  const perPage = 300;
  const data = await fetchJson<{ verses: QuranApiVerse[] }>(
    `${QURAN_API}/verses/by_chapter/${surahId}?language=en&translations=${translationId}&fields=text_uthmani,text_qpc_hafs&words=true&word_fields=code_v2,text_uthmani,text_qpc_hafs&per_page=${perPage}`
  );
  const verses: Verse[] = data.verses.map((v) => ({
    id: v.id,
    verse_number: v.verse_number,
    verse_key: v.verse_key,
    text_uthmani: v.text_uthmani,
    text_qpc_hafs: v.text_qpc_hafs,
    translation: v.translations?.[0]?.text
      ? v.translations[0].text
          .replace(/<sup[^>]*>.*?<\/sup>/gi, "")
          .replace(/<[^>]*>/g, "")
          .replace(/(?<=[a-zA-Z])\d+/g, "")
          .replace(/\.\d+/g, ".")
          .trim()
      : undefined,
    qcfWords: v.words
      ?.filter((w) => w.code_v2)
      .map((w): QcfWord => ({
        position: w.position,
        code_v2: w.code_v2!,
        page_number: w.page_number,
        line_number: w.line_number,
        text_uthmani: w.text_uthmani,
        text_qpc_hafs: w.text_qpc_hafs,
        char_type_name: w.char_type_name,
      })),
  }));
  verifyAgainstSecondSource(surahId, verses);
  return verses;
}

// Strip encoding-level differences between Quran text sources so we can
// compare the meaningful content (consonants + diacritics).
function normalizeUthmani(text: string): string {
  return text
    .replace(/ٱ/g, "ا")  // hamzat wasl → alef
    .replace(/ـ/g, "")        // remove tatweel
    .replace(/ٰ/g, "ا")  // superscript alef → alef
    .replace(/[ۖ-ۭ]/g, "") // remove Quranic annotation marks (waqf, small meem, etc.)
    .replace(/ٔ/g, "ء")  // combining hamza above → standalone hamza
    .replace(/ٕ/g, "ء")  // combining hamza below → standalone hamza
    .replace(/۟/g, "")        // small high rounded zero
    .replace(/\s+/g, "");          // strip whitespace (sources differ on word joins)
}

const verifiedSurahs = new Set<number>();

const BISMILLAH_NORM = normalizeUthmani(
  "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
);

// Background cross-check: fetch the same surah from Al Quran Cloud (Islamic
// Network, independent Tanzil-based source) and compare verse text.
function verifyAgainstSecondSource(surahId: number, verses: Verse[]): void {
  if (verifiedSurahs.has(surahId)) return;
  verifiedSurahs.add(surahId);

  fetch(`${ALQURAN_CLOUD}/surah/${surahId}/quran-uthmani`)
    .then((r) => r.json())
    .then((data) => {
      const ayahs: { numberInSurah: number; text: string }[] =
        data?.data?.ayahs ?? [];
      for (const verse of verses) {
        const match = ayahs.find((a) => a.numberInSurah === verse.verse_number);
        if (!match) continue;
        const a = normalizeUthmani(verse.text_uthmani);
        let b = normalizeUthmani(match.text);
        // Al Quran Cloud prepends Bismillah to verse 1 of most surahs;
        // Quran.com does not. Strip it before comparing.
        if (verse.verse_number === 1 && surahId !== 1 && surahId !== 9) {
          b = b.replace(BISMILLAH_NORM, "");
          if (a !== b && b.endsWith(a)) continue;
        }
        if (a !== b) {
          console.warn(
            `[Quran text mismatch] ${verse.verse_key}\n  Quran.com : ${verse.text_uthmani}\n  AlQuran   : ${match.text}`
          );
        }
      }
    })
    .catch(() => {
      /* second source unavailable — non-blocking */
    });
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
  const data = await fetchJson<{ audio_files?: { verse_timings?: ApiVerseTiming[] }[] }>(
    `${QURAN_CDN_API}/audio/reciters/${recitationId}/audio_files?chapter=${chapterNumber}&segments=true`
  );
  const audioFile = data.audio_files?.[0];
  if (!audioFile?.verse_timings) return [];

  return audioFile.verse_timings.map((vt) => {
    const verseStart = vt.timestamp_from;
    return {
      verseKey: vt.verse_key,
      timestampFrom: vt.timestamp_from,
      timestampTo: vt.timestamp_to,
      wordTimings: (vt.segments || [])
        .filter((s) => s.length >= 3 && s[1] !== null && s[2] !== null)
        .map((s) => ({
          wordPosition: s[0],
          startMs: s[1]! - verseStart,
          endMs: s[2]! - verseStart,
        })),
    };
  });
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
  const data = await fetchJson<{ verse?: { words?: QuranApiWord[] } }>(
    `${QURAN_API}/verses/by_key/${chapterNumber}:${verseNumber}?language=en&words=true&word_fields=text_uthmani&translation_fields=text&translations=${translationResourceId}&per_page=300`
  );
  const verse = data.verse;
  if (!verse?.words) return [];

  return verse.words
    .filter((w) => w.char_type_name === "word")
    .map((w) => ({
      position: w.position,
      textUthmani: w.text_uthmani,
      translation: w.translation?.text ?? null,
    }));
}
