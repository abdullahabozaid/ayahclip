// Shared clip-rendering helpers: assemble export options from the current
// store state, encode the MP4, save it to the clip library, and hand the file
// to the OS (share sheet on touch, download elsewhere). Used by both the
// Export button and the studio's "see the final MP4" preview.
import { useAppStore } from "./store";
import { sendNativeExport } from "./mobile-bridge";
import { getReciter, getReciterOrDefault } from "./reciters";
import { exportVideoWithInfo } from "./export";
import { buildClipRows } from "./clip-rows";
import { getTranslationLanguage } from "./translations";
import { getBlob } from "./projects";
import {
  saveClip,
  captureThumbnail,
  generateClipId,
  type LibraryClip,
} from "./clip-library";

/** True when the URL still serves bytes (blob: URLs die on reload/restore). */
async function urlAlive(url: string): Promise<boolean> {
  try {
    const r = await fetch(url);
    r.body?.cancel().catch(() => {});
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Imported audio (and uploaded background video) live behind blob: URLs that
 * die when the page reloads or a project is restored in a new session. The
 * underlying blobs ARE persisted with the project in IndexedDB — so before an
 * export, check the URLs and quietly re-mint them from storage. Without this,
 * the fast exporter's fetch fails and export silently degrades to the
 * real-time recorder (slow) or produces a broken file.
 */
async function healDeadMediaUrls(): Promise<void> {
  const s = useAppStore.getState();
  if (s.audioSource.mode === "imported" && !(await urlAlive(s.audioSource.url))) {
    if (!s.projectId) throw new Error("Imported audio is no longer available — re-import the clip.");
    const blob = await getBlob(`audio:${s.projectId}`);
    if (!blob) throw new Error("Imported audio is no longer available — re-import the clip.");
    const url = URL.createObjectURL(blob);
    s.setImportedAudio(url, s.audioSource.name, s.audioSource.timings);
  }
  const bg = s.background;
  if ((bg.type === "video" || bg.type === "image") && bg.value.startsWith("blob:") && !(await urlAlive(bg.value))) {
    const blob = s.projectId
      ? await getBlob(`background:${s.projectId}:single`) ?? await getBlob(`video:${s.projectId}`)
      : undefined;
    if (blob) {
      s.setBackground({ ...bg, value: URL.createObjectURL(blob) });
    }
  }
  if (s.projectId && s.backgroundSequenceEnabled) {
    for (const scene of s.backgroundScenes) {
      const media = scene.background;
      if ((media.type !== "image" && media.type !== "video") || !media.value.startsWith("blob:")) continue;
      if (await urlAlive(media.value)) continue;
      const blob = await getBlob(`background:${s.projectId}:${scene.id}`);
      if (blob) {
        s.updateBackgroundScene(scene.id, {
          background: { ...media, value: URL.createObjectURL(blob) },
        });
      }
    }
  }
}

export interface RenderedFile {
  file: File;
  /** Present when the slow real-time recorder had to be used — tell the user why. */
  fallbackReason?: string;
  /** True when this render was reused from the cache (nothing changed). */
  fromCache?: boolean;
}

// The last render, keyed by every setting that affects the output. While the
// clip is unchanged, previewing/exporting again returns the same file
// instantly instead of re-encoding.
let renderCache: { key: string; file: File; fallbackReason?: string } | null = null;

/** Encode the current clip to its final video file. Null when nothing is selected. */
export async function renderClipFile(
  onProgress: (current: number, total: number) => void
): Promise<RenderedFile | null> {
  await healDeadMediaUrls();
  const s = useAppStore.getState();
  const selectedVerses = s.verses.filter((v) =>
    s.selectedVerseNumbers.includes(v.verse_number)
  );
  const rows = buildClipRows(
    s.verses,
    s.selectedVerseNumbers,
    s.audioSource.mode === "imported" ? s.audioSource.timings : undefined
  );
  if (rows.length === 0 || !s.surah) return null;
  const reciter = getReciterOrDefault(s.reciterId);

  const exportOptions = {
    verses: selectedVerses,
    rows,
    reciter,
    surahNumber: s.surah.id,
    videoFormat: s.videoFormat,
    arabicFontSize: s.arabicFontSize,
    arabicFont: s.arabicFont,
    arabicFontWeight: s.arabicFontWeight,
    arabicInkThickness: s.arabicInkThickness,
    arabicVerseNumber: s.arabicVerseNumber,
    translationVerseNumber: s.translationVerseNumber,
    translationEnabled: s.translationEnabled,
    arabicEnabled: s.arabicEnabled,
    translationFontSize: s.translationFontSize,
    translationFont: s.translationFont,
    translationFontWeight: s.translationFontWeight,
    translationDirection: getTranslationLanguage(s.translationLanguage).direction,
    textColor: s.textColor,
    translationColor: s.translationColor,
    lineHeight: s.lineHeight,
    translationLineHeight: s.translationLineHeight,
    arabicTranslationGap: s.arabicTranslationGap,
    textPosition: s.textPosition,
    textLayout: s.textLayout,
    splitMask: s.splitMask,
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
    recitationId: reciter.quranComRecitationId,
    translationResourceId: getTranslationLanguage(s.translationLanguage).resourceId,
    background: s.background,
    backgroundFit: s.backgroundFit,
    mediaTransform: s.mediaTransform,
    mediaFrame: s.mediaFrame,
    backgroundSequenceEnabled: s.backgroundSequenceEnabled,
    backgroundScenes: s.backgroundScenes,
    fitBackdrop: s.fitBackdrop,
    backgroundVideoSync: s.backgroundVideoSync,
    videoLoopMode: s.videoLoopMode,
    verseIntro: s.verseIntro,
    verseIntroMs: s.verseIntroMs,
    clipFadeMs: s.clipFadeMs,
    audioFadeIn: s.audioFadeIn,
    textShadow: s.textShadow,
    textOutline: s.textOutline,
    letterbox: s.letterbox,
  };

  const key = JSON.stringify(exportOptions);
  if (renderCache && renderCache.key === key) {
    return {
      file: renderCache.file,
      fallbackReason: renderCache.fallbackReason,
      fromCache: true,
    };
  }

  const { blob, fallbackReason } = await exportVideoWithInfo({
    ...exportOptions,
    onProgress,
  });

  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  const file = new File(
    [blob],
    `ayahclip-${s.surah.name_simple}-${s.videoFormat}.${ext}`,
    { type: blob.type }
  );
  renderCache = { key, file, fallbackReason };
  return { file, fallbackReason };
}

/** Keep an encoded clip in the library so it can be scheduled from /library.
 *  Returns false if it was NOT stored — the caller must tell the user, because
 *  the exported file itself is fine and the failure is otherwise invisible. */
export async function saveRenderedToLibrary(file: File): Promise<boolean> {
  const s = useAppStore.getState();
  if (!s.surah) return false;
  try {
    const reciter = getReciter(s.reciterId);
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
      kind: "export",
      thumbnail: await captureThumbnail(file),
      status: "draft",
    };
    return await saveClip(meta, file);
  } catch (err) {
    console.warn("Could not save clip to library:", err);
    return false;
  }
}

/** Save to disk: the local save-export API when reachable, else a download. */
export async function saveFile(file: File): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/save-export", { method: "POST", body: form });
    if (res.ok) {
      const { saved } = await res.json();
      return `~/Documents/AyahClip/Exports/${saved}`;
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
  return null;
}

/**
 * Hand the file to the user from WITHIN a tap/click gesture: share sheet on
 * touch devices that support file sharing (→ "Save Video" to the camera roll),
 * otherwise disk/download. Falls back to download if the share fails.
 */
export async function deliverFileInGesture(file: File): Promise<void> {
  const nativeReceipt = await sendNativeExport(file);
  if (nativeReceipt) return;
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
