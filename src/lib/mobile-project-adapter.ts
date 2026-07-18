import type { Project, Surah, Verse } from "@/types";
import type { VerseTiming } from "./audio-import";
import { fetchSurahs, fetchVerses } from "./api";
import { createBackgroundScene } from "./background-sequence";
import {
  createMobileEditorDocument,
  isMobileProjectSnapshotV1,
  readMobileEditorDocument,
  type MobileProjectSnapshotV1,
} from "./mobile-bridge";
import { useAppStore } from "./store";

type StoreState = ReturnType<typeof useAppStore.getState>;

interface MobileHydrationDependencies {
  fetchSurahs: typeof fetchSurahs;
  fetchVerses: typeof fetchVerses;
}

const defaultDependencies: MobileHydrationDependencies = { fetchSurahs, fetchVerses };

export function snapshotFromRecognition(
  base: MobileProjectSnapshotV1,
  surah: Surah,
  verses: readonly Verse[],
  verseNumbers: readonly number[],
  timings: readonly VerseTiming[],
): MobileProjectSnapshotV1 {
  const selected = [...verseNumbers];
  const expected = selected.map((verseNumber, index) => selected[0] + index);
  if (selected.length === 0
    || selected.some((verseNumber, index) => verseNumber !== expected[index])
    || timings.length !== selected.length
    || timings.some((timing, index) => timing.verseNumber !== selected[index])) {
    throw new Error("The confirmed Quran range and detected timing do not match.");
  }
  const verseByNumber = new Map(verses.map((verse) => [verse.verse_number, verse]));
  if (selected.some((verseNumber) => !verseByNumber.has(verseNumber))) {
    throw new Error("AyahClip could not verify every verse in the confirmed range.");
  }
  const previousByVerse = new Map(
    base.segments.map((segment) => [segment.verseNumber, segment]),
  );
  const first = selected[0];
  const last = selected.at(-1)!;
  const snapshot: MobileProjectSnapshotV1 = {
    ...base,
    title: `${surah.name_simple} ${first}${last === first ? "" : `-${last}`}`,
    quran: {
      surahId: surah.id,
      surahName: `Surah ${surah.name_simple}`,
      verseNumbers: selected,
      reciterId: base.quran?.reciterId ?? null,
    },
    segments: timings.map((timing) => {
      const verse = verseByNumber.get(timing.verseNumber)!;
      return {
        id: previousByVerse.get(timing.verseNumber)?.id ?? crypto.randomUUID(),
        verseNumber: timing.verseNumber,
        start: timing.start,
        end: timing.end,
        arabic: verse.text_uthmani,
        translation: verse.translation ?? "",
      };
    }),
    editorDocumentJSON: null,
    updatedAtMilliseconds: Date.now(),
  };
  if (!isMobileProjectSnapshotV1(snapshot)) {
    throw new Error("AyahClip refused an invalid confirmed Quran range.");
  }
  return snapshot;
}

export async function hydrateStoreFromMobileProject(
  snapshot: MobileProjectSnapshotV1,
  dependencies: MobileHydrationDependencies = defaultDependencies,
): Promise<Project> {
  if (!snapshot.quran) {
    throw new Error("Choose and confirm a Quran passage before opening Studio.");
  }

  const project = snapshot.editorDocumentJSON
    ? asProject(readMobileEditorDocument(
      snapshot.editorDocumentJSON,
      snapshot.id,
      snapshot.media,
    ))
    : bootstrapProject(snapshot, useAppStore.getState());

  const surahs = await dependencies.fetchSurahs();
  const surah = surahs.find((item) => item.id === snapshot.quran?.surahId);
  if (!surah) throw new Error("AyahClip could not verify the selected surah.");
  const fetchedVerses = await dependencies.fetchVerses(surah.id);
  const segmentByVerse = new Map(snapshot.segments.map((segment) => [segment.verseNumber, segment]));
  const verses = fetchedVerses.map((verse) => {
    const segment = segmentByVerse.get(verse.verse_number);
    return segment ? {
      ...verse,
      text_uthmani: segment.arabic,
      translation: segment.translation,
    } : verse;
  });

  const importedMedia = snapshot.media.find((item) =>
    item.contentType.startsWith("audio/") || item.contentType.startsWith("video/"));
  const importedAudio = project.imported && importedMedia ? {
    url: importedMedia.url,
    name: project.imported.name,
    timings: project.imported.timings,
  } : undefined;
  if (project.imported && !importedAudio) {
    throw new Error("The imported recitation is no longer available on this iPhone.");
  }

  useAppStore.getState().restoreProject(
    surah,
    verses,
    project.selectedVerseNumbers,
    project.settings,
    project.id,
    importedAudio,
    project.verseParts,
  );
  if (importedAudio && project.imported?.videoBg) {
    useAppStore.getState().setBackgroundVideoSync(true);
  }
  return project;
}

export function snapshotFromWebProject(
  base: MobileProjectSnapshotV1,
  project: Project,
  state: StoreState,
): MobileProjectSnapshotV1 {
  if (!state.surah || state.selectedVerseNumbers.length === 0) {
    throw new Error("Choose at least one ayah before saving this clip.");
  }
  const timingByVerse = new Map(
    state.audioSource.mode === "imported"
      ? state.audioSource.timings.map((timing) => [timing.verseNumber, timing])
      : [],
  );
  const baseByVerse = new Map(base.segments.map((segment) => [segment.verseNumber, segment]));
  let cursor = 0;
  const segments = state.selectedVerseNumbers.map((verseNumber) => {
    const verse = state.verses.find((item) => item.verse_number === verseNumber);
    const timing = timingByVerse.get(verseNumber);
    const previous = baseByVerse.get(verseNumber);
    const start = timing?.start ?? (previous && previous.start >= cursor ? previous.start : cursor);
    const end = timing?.end ?? (previous && previous.end > start ? previous.end : start + 5);
    cursor = end;
    return {
      id: previous?.id ?? crypto.randomUUID(),
      verseNumber,
      start,
      end,
      arabic: verse?.text_uthmani ?? previous?.arabic ?? "",
      translation: verse?.translation ?? previous?.translation ?? "",
    };
  });
  const layout = state.textLayout === "left-panel"
    ? "sideFade" as const
    : state.textPosition >= 68 ? "lowerThird" as const : "centered" as const;
  const captionStyle = state.textColor.toLowerCase() === "#f2d27a"
    ? "gold" as const
    : state.textOutline.enabled && state.textOutline.width >= 1.5
      ? "crispOutline" as const
      : !state.textShadow.enabled && !state.textOutline.enabled
        ? "clean" as const
        : "softGlow" as const;
  const durableProject: Partial<Project> = { ...project };
  delete durableProject.thumbnail;
  delete durableProject.backgroundMedia;
  return {
    ...base,
    title: project.name,
    quran: {
      surahId: state.surah.id,
      surahName: `Surah ${state.surah.name_simple}`,
      verseNumbers: [...state.selectedVerseNumbers],
      reciterId: state.reciterId,
    },
    segments,
    style: {
      layout,
      captionStyle,
      arabicSize: state.arabicFontSize,
      translationSize: state.translationFontSize,
      overlayOpacity: state.overlayOpacity / 100,
    },
    editorDocumentJSON: createMobileEditorDocument(
      base.id,
      durableProject as unknown as Record<string, unknown>,
      base.media,
    ),
    updatedAtMilliseconds: Date.now(),
  };
}

export function bootstrapProject(
  snapshot: MobileProjectSnapshotV1,
  state: StoreState,
): Project {
  if (!snapshot.quran) throw new Error("A Quran selection is required.");
  const settings = settingsFromState(state);
  applySummaryStyle(settings, snapshot);

  const visualMedia = snapshot.media.filter((item) =>
    item.contentType.startsWith("image/") || item.contentType.startsWith("video/"));
  if (visualMedia.length > 0) {
    const backgrounds = visualMedia.map((item) => ({
      type: item.contentType.startsWith("image/") ? "image" as const : "video" as const,
      value: item.url,
      label: "Imported media",
    }));
    settings.background = backgrounds[0];
    if (backgrounds.length > 1) {
      const duration = Math.max(0.1, snapshot.segments.at(-1)?.end ?? 5) / backgrounds.length;
      settings.backgroundSequenceEnabled = true;
      settings.backgroundScenes = backgrounds.map((background) =>
        createBackgroundScene(background, { duration }));
      settings.activeBackgroundSceneId = settings.backgroundScenes[0].id;
    }
  }

  const importedMedia = snapshot.media.find((item) =>
    item.contentType.startsWith("audio/") || item.contentType.startsWith("video/"));
  return {
    id: snapshot.id,
    name: snapshot.title,
    surahId: snapshot.quran.surahId,
    surahName: snapshot.quran.surahName.replace(/^Surah\s+/i, ""),
    selectedVerseNumbers: snapshot.quran.verseNumbers,
    settings,
    imported: importedMedia ? {
      name: "Imported recitation",
      timings: snapshot.segments.map((segment) => ({
        verseNumber: segment.verseNumber,
        start: segment.start,
        end: segment.end,
      })),
      videoBg: importedMedia.contentType.startsWith("video/"),
    } : undefined,
    createdAt: snapshot.createdAtMilliseconds,
    updatedAt: snapshot.updatedAtMilliseconds,
  };
}

function settingsFromState(state: StoreState): Project["settings"] {
  return {
    reciterId: state.reciterId,
    videoFormat: state.videoFormat,
    arabicFontSize: state.arabicFontSize,
    arabicFont: state.arabicFont,
    arabicFontWeight: state.arabicFontWeight,
    arabicInkThickness: state.arabicInkThickness,
    arabicVerseNumber: state.arabicVerseNumber,
    translationVerseNumber: state.translationVerseNumber,
    translationEnabled: state.translationEnabled,
    arabicEnabled: state.arabicEnabled,
    wordHighlight: state.wordHighlight,
    backgroundVideoSync: state.backgroundVideoSync,
    translationFontSize: state.translationFontSize,
    translationFont: state.translationFont,
    translationFontWeight: state.translationFontWeight,
    translationLanguage: state.translationLanguage,
    textColor: state.textColor,
    translationColor: state.translationColor,
    lineHeight: state.lineHeight,
    translationLineHeight: state.translationLineHeight,
    arabicTranslationGap: state.arabicTranslationGap,
    textPosition: state.textPosition,
    textLayout: state.textLayout,
    splitMask: state.splitMask,
    overlayOpacity: state.overlayOpacity,
    overlayColor: state.overlayColor,
    safeAreaTarget: state.safeAreaTarget,
    safePadding: state.safePadding,
    background: state.background,
    backgroundFit: state.backgroundFit,
    mediaTransform: state.mediaTransform,
    mediaFrame: state.mediaFrame,
    backgroundSequenceEnabled: state.backgroundSequenceEnabled,
    backgroundScenes: state.backgroundScenes,
    activeBackgroundSceneId: state.activeBackgroundSceneId,
    fitBackdrop: state.fitBackdrop,
    videoLoopMode: state.videoLoopMode,
    verseIntro: state.verseIntro,
    verseIntroMs: state.verseIntroMs,
    clipFadeMs: state.clipFadeMs,
    audioFadeIn: state.audioFadeIn,
    textShadow: state.textShadow,
    textOutline: state.textOutline,
    letterbox: state.letterbox,
    emphasis: state.emphasis,
    emphasisStyle: state.emphasisStyle,
    emphasisColor: state.emphasisColor,
    highlightEnabled: state.highlightEnabled,
    highlightColor: state.highlightColor,
    highlightOpacity: state.highlightOpacity,
    highlightRadius: state.highlightRadius,
    highlightPadding: state.highlightPadding,
    highlightHeight: state.highlightHeight,
  };
}

function applySummaryStyle(
  settings: Project["settings"],
  snapshot: MobileProjectSnapshotV1,
) {
  settings.arabicFontSize = snapshot.style.arabicSize;
  settings.translationFontSize = snapshot.style.translationSize;
  settings.overlayOpacity = snapshot.style.overlayOpacity * 100;
  if (snapshot.style.layout === "sideFade") {
    settings.textLayout = "left-panel";
    settings.splitMask = {
      side: "left",
      color: "#000000",
      opacity: 1,
      solidWidth: 42,
      fadeWidth: 24,
    };
  } else {
    settings.textLayout = "center";
    settings.textPosition = snapshot.style.layout === "lowerThird" ? 76 : 50;
  }
  switch (snapshot.style.captionStyle) {
  case "crispOutline":
    settings.textShadow = { enabled: false, color: "#000000", blur: 0, offsetX: 0, offsetY: 0 };
    settings.textOutline = { enabled: true, color: "#050507", width: 2 };
    break;
  case "gold":
    settings.textColor = "#f2d27a";
    settings.translationColor = "#f8f1df";
    break;
  case "clean":
    settings.textShadow = { enabled: false, color: "#000000", blur: 0, offsetX: 0, offsetY: 0 };
    settings.textOutline = { enabled: false, color: "#050507", width: 0 };
    break;
  default:
    settings.textColor = "#ffffff";
    settings.textShadow = { enabled: true, color: "#ffffff", blur: 8, offsetX: 0, offsetY: 0 };
    settings.textOutline = { enabled: true, color: "#050507", width: 0.8 };
  }
}

function asProject(value: Record<string, unknown>): Project {
  if (typeof value.id !== "string"
    || typeof value.name !== "string"
    || !Number.isInteger(value.surahId)
    || !Array.isArray(value.selectedVerseNumbers)
    || !value.settings
    || typeof value.settings !== "object") {
    throw new Error("AyahClip could not restore that editor project.");
  }
  return value as unknown as Project;
}
