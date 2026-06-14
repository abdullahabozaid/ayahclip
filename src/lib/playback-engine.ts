import { WordTiming, WordData, fetchChapterTimings, fetchWordsByVerse } from "./api";
import { sanitizeArabic } from "./canvas-utils";
import { snapToSentenceBoundary } from "./audio-import";

export interface TextSegment {
  arabicText: string;
  translationText: string;
  startMs: number;
  endMs: number;
}

const MIN_SEGMENT_WORDS = 4;
const MAX_SEGMENT_WORDS = 7;
const GAP_THRESHOLD_MS = 300;

export function groupWordsIntoSegments(
  words: WordData[],
  timings: WordTiming[]
): TextSegment[] {
  if (words.length <= 8) {
    const startMs = timings.length > 0 ? timings[0].startMs : 0;
    const endMs = timings.length > 0 ? timings[timings.length - 1].endMs : 0;
    return [
      {
        arabicText: words.map((w) => w.textUthmani).join(" "),
        translationText: words
          .map((w) => w.translation)
          .filter(Boolean)
          .join(" "),
        startMs,
        endMs,
      },
    ];
  }

  const segments: TextSegment[] = [];
  let currentWords: WordData[] = [];
  let currentTimings: WordTiming[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const timing = timings.find((t) => t.wordPosition === word.position);
    currentWords.push(word);
    if (timing) currentTimings.push(timing);

    const atMaxWords = currentWords.length >= MAX_SEGMENT_WORDS;
    const atMinWords = currentWords.length >= MIN_SEGMENT_WORDS;

    let hasGap = false;
    if (atMinWords && i < words.length - 1) {
      const nextTiming = timings.find(
        (t) => t.wordPosition === words[i + 1].position
      );
      if (timing && nextTiming) {
        hasGap = nextTiming.startMs - timing.endMs > GAP_THRESHOLD_MS;
      }
    }

    const isLastWord = i === words.length - 1;

    if (atMaxWords || hasGap || isLastWord) {
      const startMs =
        currentTimings.length > 0 ? currentTimings[0].startMs : 0;
      const endMs =
        currentTimings.length > 0
          ? currentTimings[currentTimings.length - 1].endMs
          : 0;

      segments.push({
        arabicText: currentWords.map((w) => w.textUthmani).join(" "),
        translationText: currentWords
          .map((w) => w.translation)
          .filter(Boolean)
          .join(" "),
        startMs,
        endMs,
      });

      currentWords = [];
      currentTimings = [];
    }
  }

  return segments;
}

export async function loadVerseSegments(
  recitationId: number,
  chapterNumber: number,
  verseNumber: number,
  translationResourceId: number = 20
): Promise<TextSegment[]> {
  const [timingsAll, words] = await Promise.all([
    fetchChapterTimings(recitationId, chapterNumber),
    fetchWordsByVerse(chapterNumber, verseNumber, translationResourceId),
  ]);

  const verseTiming = timingsAll.find(
    (vt) => vt.verseKey === `${chapterNumber}:${verseNumber}`
  );

  if (
    !verseTiming ||
    verseTiming.wordTimings.length === 0 ||
    words.length === 0
  ) {
    return [];
  }

  return groupWordsIntoSegments(words, verseTiming.wordTimings);
}

export function findCurrentSegmentIndex(
  segments: TextSegment[],
  currentTimeMs: number
): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (currentTimeMs >= segments[i].startMs) {
      return i;
    }
  }
  return 0;
}

// ── Manual word-parts for reciter clips ─────────────────────────────────────
// Library (reciter) clips have no single timeline, so a verse's parts are
// defined by WORD boundaries and timed from the reciter's real per-word
// timestamps (Quran.com). These helpers load the word data and turn a set of
// boundaries into TextSegment[] that the preview and export consume directly.

export interface VerseWord {
  position: number;
  text: string;
  translation: string;
  startMs: number | null;
  endMs: number | null;
}

// Chapter timings are the same for every verse of a chapter, so fetch once.
const chapterTimingsCache = new Map<string, Promise<Awaited<ReturnType<typeof fetchChapterTimings>>>>();
function cachedChapterTimings(recitationId: number, chapter: number) {
  const key = `${recitationId}:${chapter}`;
  let p = chapterTimingsCache.get(key);
  if (!p) {
    p = fetchChapterTimings(recitationId, chapter);
    chapterTimingsCache.set(key, p);
  }
  return p;
}

/** Load a verse's words with the reciter's per-word timestamps. */
export async function loadVerseWords(
  recitationId: number,
  chapter: number,
  verse: number,
  translationResourceId: number = 20
): Promise<VerseWord[]> {
  const [timingsAll, words] = await Promise.all([
    cachedChapterTimings(recitationId, chapter),
    fetchWordsByVerse(chapter, verse, translationResourceId),
  ]);
  const vt = timingsAll.find((t) => t.verseKey === `${chapter}:${verse}`);
  return words.map((w) => {
    const t = vt?.wordTimings.find((x) => x.wordPosition === w.position);
    return {
      position: w.position,
      text: sanitizeArabic(w.textUthmani),
      translation: w.translation ?? "",
      startMs: t ? t.startMs : null,
      endMs: t ? t.endMs : null,
    };
  });
}

/**
 * Group a verse's words into parts at the given word boundaries (indices AFTER
 * which a new part begins) and time each part from the real word timestamps.
 * No boundaries → one segment covering the whole verse.
 */
export function buildPartsFromBoundaries(
  words: VerseWord[],
  boundaries: number[],
  verseTranslation?: string
): TextSegment[] {
  if (words.length === 0) return [];
  const cuts = [...boundaries]
    .filter((b) => b > 0 && b < words.length)
    .sort((a, b) => a - b);
  const points = [0, ...cuts, words.length];
  const transWords = verseTranslation
    ? verseTranslation.split(/\s+/).filter(Boolean)
    : null;
  const total = words.length;
  const segs: TextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const lo = points[i];
    const hi = points[i + 1];
    const grp = words.slice(lo, hi);
    if (grp.length === 0) continue;
    const firstTimed = grp.find((w) => w.startMs != null);
    const lastTimed = [...grp].reverse().find((w) => w.endMs != null);
    let translationText: string;
    if (transWords) {
      const tLo = snapToSentenceBoundary(transWords, Math.floor((lo / total) * transWords.length));
      const tHi = Math.max(tLo, snapToSentenceBoundary(transWords, Math.floor((hi / total) * transWords.length)));
      translationText = transWords.slice(tLo, tHi).join(" ");
    } else {
      translationText = grp.map((w) => w.translation).filter(Boolean).join(" ");
    }
    segs.push({
      arabicText: grp.map((w) => w.text).join(" "),
      translationText,
      startMs: firstTimed?.startMs ?? (segs.length ? segs[segs.length - 1].endMs : 0),
      endMs: lastTimed?.endMs ?? 0,
    });
  }
  return segs;
}
