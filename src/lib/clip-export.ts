// Shared clip-rendering helpers: assemble export options from the current
// store state, encode the MP4, save it to the clip library, and hand the file
// to the OS (share sheet on touch, download elsewhere). Used by both the
// Export button and the studio's "see the final MP4" preview.
import { useAppStore } from "./store";
import { reciters } from "./reciters";
import { exportVideo } from "./export";
import { getTranslationLanguage } from "./translations";
import {
  saveClip,
  captureThumbnail,
  generateClipId,
  type LibraryClip,
} from "./clip-library";

/** Encode the current clip to its final video file. Null when nothing is selected. */
export async function renderClipFile(
  onProgress: (current: number, total: number) => void
): Promise<File | null> {
  const s = useAppStore.getState();
  const selectedVerses = s.verses.filter((v) =>
    s.selectedVerseNumbers.includes(v.verse_number)
  );
  if (selectedVerses.length === 0 || !s.surah) return null;
  const reciter = reciters.find((r) => r.id === s.reciterId);

  const blob = await exportVideo({
    verses: selectedVerses,
    reciterFolder: reciter?.folder ?? "Alafasy_128kbps",
    surahNumber: s.surah.id,
    videoFormat: s.videoFormat,
    arabicFontSize: s.arabicFontSize,
    arabicFont: s.arabicFont,
    arabicFontWeight: s.arabicFontWeight,
    arabicVerseNumber: s.arabicVerseNumber,
    translationVerseNumber: s.translationVerseNumber,
    translationEnabled: s.translationEnabled,
    translationFontSize: s.translationFontSize,
    translationFont: s.translationFont,
    translationFontWeight: s.translationFontWeight,
    translationDirection: getTranslationLanguage(s.translationLanguage).direction,
    textColor: s.textColor,
    lineHeight: s.lineHeight,
    translationLineHeight: s.translationLineHeight,
    arabicTranslationGap: s.arabicTranslationGap,
    textPosition: s.textPosition,
    overlayOpacity: s.overlayOpacity,
    overlayColor: s.overlayColor,
    safeAreaTarget: s.safeAreaTarget,
    safePadding: s.safePadding,
    emphasis: s.emphasis,
    emphasisStyle: s.emphasisStyle,
    emphasisColor: s.emphasisColor,
    highlightEnabled: s.highlightEnabled,
    highlightColor: s.highlightColor,
    highlightOpacity: s.highlightOpacity,
    highlightRadius: s.highlightRadius,
    highlightPadding: s.highlightPadding,
    highlightHeight: s.highlightHeight,
    importedAudio:
      s.audioSource.mode === "imported"
        ? { url: s.audioSource.url, timings: s.audioSource.timings }
        : undefined,
    verseParts: s.audioSource.mode === "reciter" ? s.verseParts : undefined,
    recitationId: reciter?.quranComRecitationId,
    translationResourceId: getTranslationLanguage(s.translationLanguage).resourceId,
    background: s.background,
    backgroundFit: s.backgroundFit,
    fitBackdrop: s.fitBackdrop,
    backgroundVideoSync: s.backgroundVideoSync,
    videoLoopMode: s.videoLoopMode,
    verseIntro: s.verseIntro,
    verseIntroMs: s.verseIntroMs,
    textShadow: s.textShadow,
    letterbox: s.letterbox,
    onProgress,
  });

  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  return new File(
    [blob],
    `ayahclip-${s.surah.name_simple}-${s.videoFormat}.${ext}`,
    { type: blob.type }
  );
}

/** Keep an encoded clip in the library (IndexedDB) so it can be scheduled
 *  from /library. Best-effort — never blocks delivery. */
export async function saveRenderedToLibrary(file: File): Promise<void> {
  const s = useAppStore.getState();
  if (!s.surah) return;
  try {
    const reciter = reciters.find((r) => r.id === s.reciterId);
    const nums = s.selectedVerseNumbers;
    const range = nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : `${nums[0]}`;
    const meta: LibraryClip = {
      id: generateClipId(),
      title: `${s.surah.name_simple} ${range}`,
      surahName: s.surah.name_simple,
      verseRange: `${s.surah.id}:${range}`,
      reciterName:
        s.audioSource.mode === "imported"
          ? "Imported audio"
          : reciter?.name ?? "Unknown reciter",
      videoFormat: s.videoFormat,
      mimeType: file.type,
      size: file.size,
      createdAt: Date.now(),
      thumbnail: await captureThumbnail(file),
      status: "draft",
    };
    await saveClip(meta, file);
  } catch (err) {
    console.warn("Could not save clip to library:", err);
  }
}

/** Save to disk: the local save-export API when reachable, else a download. */
export async function saveFile(file: File): Promise<void> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/save-export", { method: "POST", body: form });
    if (res.ok) {
      const { saved } = await res.json();
      alert(`Saved to ~/Documents/AyahClip/Exports/${saved}`);
      return;
    }
  } catch (err) {
    console.warn("save-export API unavailable; falling back to download", err);
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Hand the file to the user from WITHIN a tap/click gesture: share sheet on
 * touch devices that support file sharing (→ "Save Video" to the camera roll),
 * otherwise disk/download. Falls back to download if the share fails.
 */
export async function deliverFileInGesture(file: File): Promise<void> {
  const isTouch =
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "AyahClip", text: "Made with AyahClip" });
      return;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return; // user dismissed
    }
  }
  await saveFile(file);
}
