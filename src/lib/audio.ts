import type { Reciter } from "@/types";
import { resolveReciterVerseWindow } from "./reciter-audio";

export interface LoadedVerseAudio {
  element: HTMLAudioElement;
  startSeconds: number;
  endSeconds: number | null;
  durationSeconds: number | null;
}

export async function loadAudio(
  url: string,
  readiness: "metadata" | "canplaythrough" = "canplaythrough"
): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = readiness === "metadata" ? "metadata" : "auto";
    audio.src = url;
    const ready = () => resolve(audio);
    if (readiness === "metadata") audio.onloadedmetadata = ready;
    else audio.oncanplaythrough = ready;
    audio.onerror = () => reject(new Error(`Failed to load: ${url}`));
  });
}

export async function preloadVerseAudios(
  reciter: Reciter,
  surahNumber: number,
  verseNumbers: number[]
): Promise<Map<number, LoadedVerseAudio>> {
  const audioMap = new Map<number, LoadedVerseAudio>();
  const results = await Promise.allSettled(
    verseNumbers.map(async (vn) => {
      const window = await resolveReciterVerseWindow(reciter, surahNumber, vn);
      const element = await loadAudio(
        window.url,
        window.sourceKind === "chapter-cues" ? "metadata" : "canplaythrough"
      );
      return {
        verseNumber: vn,
        audio: {
          element,
          startSeconds: window.startSeconds,
          endSeconds: window.endSeconds,
          durationSeconds:
            window.endSeconds == null ? null : window.endSeconds - window.startSeconds,
        } satisfies LoadedVerseAudio,
      };
    })
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      audioMap.set(result.value.verseNumber, result.value.audio);
    }
  }
  return audioMap;
}
