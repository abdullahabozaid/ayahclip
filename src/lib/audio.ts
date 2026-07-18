import type { Reciter } from "@/types";
import { resolveReciterVerseAudio } from "./reciter-audio";

export async function loadAudio(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.src = url;
    audio.oncanplaythrough = () => resolve(audio);
    audio.onerror = () => reject(new Error(`Failed to load: ${url}`));
  });
}

export async function preloadVerseAudios(
  reciter: Reciter,
  surahNumber: number,
  verseNumbers: number[]
): Promise<Map<number, HTMLAudioElement>> {
  const audioMap = new Map<number, HTMLAudioElement>();
  const results = await Promise.allSettled(
    verseNumbers.map(async (vn) => {
      const { url } = resolveReciterVerseAudio(reciter, surahNumber, vn);
      const audio = await loadAudio(url);
      return { verseNumber: vn, audio };
    })
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      audioMap.set(result.value.verseNumber, result.value.audio);
    }
  }
  return audioMap;
}
