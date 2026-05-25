import { WordTiming, WordData, fetchChapterTimings, fetchWordsByVerse } from "./api";

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
