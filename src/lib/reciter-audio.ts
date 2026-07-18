import type { Reciter, ReciterAudioSource, ReciterSourceAttribution } from "@/types";

const EVERYAYAH_BASE = "https://everyayah.com/data";

export interface ResolvedVerseAudio {
  url: string;
  sourceKind: ReciterAudioSource["kind"];
  sourceKey: string;
  attribution: ReciterSourceAttribution;
}

export interface ResolvedReciterVerseAudio extends ResolvedVerseAudio {
  timingCapability: "word-synchronised" | "whole-ayah";
}

export type VerseAudioResolution =
  | { available: true; audio: ResolvedReciterVerseAudio }
  | { available: false; reason: string };

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
  }
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
