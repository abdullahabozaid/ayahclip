import type { Reciter, ReciterAudioSource, ReciterSourceAttribution } from "@/types";

const EVERYAYAH_BASE = "https://everyayah.com/data";

export interface ResolvedVerseAudio {
  url: string;
  sourceKind: ReciterAudioSource["kind"];
  sourceKey: string;
  attribution: ReciterSourceAttribution;
  chapterCue?: {
    provider: "mp3quran";
    readId: number;
    surahNumber: number;
    ayahNumber: number;
  };
}

export interface ResolvedReciterVerseAudio extends ResolvedVerseAudio {
  timingCapability: "word-synchronised" | "whole-ayah";
}

export type VerseAudioResolution =
  | { available: true; audio: ResolvedReciterVerseAudio }
  | { available: false; reason: string };

export interface ResolvedReciterVerseWindow extends ResolvedReciterVerseAudio {
  startSeconds: number;
  endSeconds: number | null;
  chapterEndSeconds: number | null;
}

interface Mp3QuranCue {
  ayah: number;
  start_time: number;
  end_time: number;
}

const chapterCueCache = new Map<string, Promise<Mp3QuranCue[]>>();

function padded(label: "Surah" | "ayah", value: number, maximum: number): string {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`Expected ${label} between 1 and ${maximum}, received ${value}`);
  }
  return String(value).padStart(3, "0");
}

export function reciterSourceKey(source: ReciterAudioSource): string {
  switch (source.kind) {
    case "everyayah":
      return `${source.kind}:${source.folder}`;
    case "chapter-cues":
      return `${source.kind}:${source.provider}:${source.readId}`;
  }
}

export function resolveVerseAudio(
  source: ReciterAudioSource,
  surahNumber: number,
  ayahNumber: number
): ResolvedVerseAudio {
  const surah = padded("Surah", surahNumber, 114);
  const ayah = padded("ayah", ayahNumber, 286);

  switch (source.kind) {
    case "everyayah":
      return {
        url: `${EVERYAYAH_BASE}/${encodeURIComponent(source.folder)}/${surah}${ayah}.mp3`,
        sourceKind: source.kind,
        sourceKey: reciterSourceKey(source),
        attribution: source.attribution,
      };
    case "chapter-cues":
      return {
        url: `${source.server}${surah}.mp3`,
        sourceKind: source.kind,
        sourceKey: reciterSourceKey(source),
        attribution: source.attribution,
        chapterCue: {
          provider: source.provider,
          readId: source.readId,
          surahNumber,
          ayahNumber,
        },
      };
  }
}

async function mp3QuranCues(readId: number, surahNumber: number): Promise<Mp3QuranCue[]> {
  const key = `${readId}:${surahNumber}`;
  let pending = chapterCueCache.get(key);
  if (!pending) {
    pending = fetch(
      `https://mp3quran.net/api/v3/ayat_timing?surah=${surahNumber}&read=${readId}`
    ).then(async (response) => {
      if (!response.ok) {
        throw new Error(`MP3Quran timing request failed with HTTP ${response.status}`);
      }
      const cues = (await response.json()) as Mp3QuranCue[];
      if (!Array.isArray(cues) || cues.length === 0) {
        throw new Error("MP3Quran returned no ayah timing data");
      }
      return cues;
    });
    chapterCueCache.set(key, pending);
    pending.catch(() => chapterCueCache.delete(key));
  }
  return pending;
}

export function resolveReciterVerseAudio(
  reciter: Reciter,
  surahNumber: number,
  ayahNumber: number
): ResolvedReciterVerseAudio {
  return {
    ...resolveVerseAudio(reciter.audioSource, surahNumber, ayahNumber),
    timingCapability:
      reciter.quranComRecitationId == null ? "whole-ayah" : "word-synchronised",
  };
}

export async function resolveReciterVerseWindow(
  reciter: Reciter,
  surahNumber: number,
  ayahNumber: number
): Promise<ResolvedReciterVerseWindow> {
  const resolved = resolveReciterVerseAudio(reciter, surahNumber, ayahNumber);
  if (!resolved.chapterCue) {
    return {
      ...resolved,
      startSeconds: 0,
      endSeconds: null,
      chapterEndSeconds: null,
    };
  }

  const cues = await mp3QuranCues(resolved.chapterCue.readId, surahNumber);
  const cue = cues.find((item) => item.ayah === ayahNumber);
  const chapterEndMs = cues.reduce((maximum, item) => Math.max(maximum, item.end_time), 0);
  if (!cue || cue.start_time < 0 || cue.end_time <= cue.start_time || chapterEndMs <= 0) {
    throw new Error(`MP3Quran has no valid cue for ${surahNumber}:${ayahNumber}`);
  }

  return {
    ...resolved,
    startSeconds: cue.start_time / 1000,
    endSeconds: cue.end_time / 1000,
    chapterEndSeconds: chapterEndMs / 1000,
  };
}

export function tryResolveReciterVerseAudio(
  reciter: Reciter,
  surahNumber: number,
  ayahNumber: number
): VerseAudioResolution {
  try {
    return {
      available: true,
      audio: resolveReciterVerseAudio(reciter, surahNumber, ayahNumber),
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : "Unable to resolve reciter audio",
    };
  }
}
