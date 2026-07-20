"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSurahs, fetchVerses } from "@/lib/api";
import { applyTemplate } from "@/lib/apply-template";
import {
  BULK_ARABIC_LINE_LIMITS,
  BULK_AYAHS_PER_CLIP,
  BULK_CLIP_COUNTS,
  BULK_IDEAL_CLIP_SECONDS,
  buildVerseCompleteCandidates,
  type BulkArabicLineLimit,
  type BulkAyahsPerClip,
  type BulkClipCandidate,
  type BulkClipCount,
  type BulkGroupingMode,
  type BulkIdealClipSeconds,
} from "@/lib/bulk-clips";
import { buildLineLimitedCaptionSplits } from "@/lib/bulk-caption-splits";
import { BULK_AYAH_REFERENCES, BULK_HADITHS } from "@/lib/bulk-inspiration";
import {
  recognizeQuranInWindows,
  type BulkRecognitionProgress,
} from "@/lib/bulk-recognition";
import {
  createBulkJob,
  activateBulkJob,
  deleteBulkOutput,
  deleteBulkJob,
  loadBulkJobs,
  loadBulkOutput,
  loadBulkSource,
  saveBulkJob,
  saveBulkOutput,
  saveBulkSource,
  type BulkJob,
  type BulkRenderTask,
} from "@/lib/bulk-jobs";
import { captureBulkThumbnails } from "@/lib/bulk-thumbnails";
import { describeImportProgress, importSocialSource, type SocialImportProgress } from "@/lib/social-import";
import { applyStyleSnapshot } from "@/lib/style-snapshot";
import { decodeAudioFile } from "@/lib/audio-import";
import { importSizeError } from "@/lib/import-limits";
import { isSupportedVideoFile } from "@/lib/media-file";
import { useAppStore } from "@/lib/store";
import { DEFAULT_TEMPLATE_STYLE, TEMPLATES } from "@/lib/templates";
import { getSavedTemplates } from "@/lib/saved-templates";
import type { TemplateDefinition } from "@/lib/template-model";
import {
  deliverBulkFilesInGesture,
  deliverFileInGesture,
  renderClipFile,
  saveRenderedToLibrary,
} from "@/lib/clip-export";
import type { Surah, Verse } from "@/types";
import { analyzeArabicTextFit, splitWords } from "@/lib/canvas-utils";
import {
  bulkYoutubeRangeError,
  parseTimecode,
  sourcePlatform,
} from "@/lib/source-link";
import { openBulkCandidateInStudio } from "@/lib/bulk-studio";

type WorkspaceStage = "library" | "source" | "analysing" | "results";
type VerseLookup = Record<string, Verse>;
type PreparedBulkSource = {
  sourceFile: File;
  audioBlob: Blob;
  buffer: AudioBuffer;
  sourceUrl: string;
  job: BulkJob;
};

const FEATURED_TEMPLATES = TEMPLATES.filter((template) => template.featured).slice(0, 5);
const STAGE_ORDER = { prepare: 0.1, listen: 0.35, match: 0.72, align: 0.9 } as const;
const fmt = (seconds: number) => {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
};

function applyCaptionLayout({
  candidates,
  verseByKey,
  template,
  enabled,
  maxLines,
}: {
  candidates: BulkClipCandidate[];
  verseByKey: VerseLookup;
  template: TemplateDefinition | undefined;
  enabled: boolean;
  maxLines: BulkArabicLineLimit;
}) {
  const reset = candidates.map((candidate) => ({
    ...candidate,
    timings: candidate.timings.map((timing) => {
      const clean = { ...timing };
      delete clean.splits;
      delete clean.splitWords;
      delete clean.splitWordTotal;
      delete clean.splitCharFractions;
      return clean;
    }),
  }));
  if (!enabled || !template || typeof document === "undefined") return reset;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return reset;

  return reset.map((candidate) => ({
    ...candidate,
    timings: candidate.timings.map((timing) => {
      const verse = verseByKey[`${candidate.surah}:${timing.verseNumber}`];
      if (!verse) return timing;
      const arabicWords = splitWords(verse.text_uthmani);
      const qcfWords = verse.qcfWords?.filter((word) => word.char_type_name !== "end");
      const split = buildLineLimitedCaptionSplits({
        timing,
        arabicWords,
        maxLines,
        countLines: (_words, from, to) => analyzeArabicTextFit(context, arabicWords.slice(from, to).join(" "), {
          arabicFont: template.settings.arabicFont,
          arabicFontWeight: template.settings.arabicFontWeight,
          arabicFontSize: template.settings.arabicFontSize,
          qcfWords: qcfWords?.slice(from, to),
          arabicVerseNumber: false,
          splitMask: template.settings.splitMask,
          textLayout: template.settings.textLayout,
          frameWidth: 1080,
        }).lineCount,
      });
      return { ...timing, ...split.timing };
    }),
  }));
}

export function BulkCreateWorkspace() {
  const router = useRouter();
  const store = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewEndRef = useRef<number | null>(null);
  const jobRef = useRef<BulkJob | null>(null);
  const restoredRef = useRef(false);
  const stopRenderingRef = useRef(false);

  const [stage, setStage] = useState<WorkspaceStage>("library");
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [link, setLink] = useState("");
  const [linkStart, setLinkStart] = useState("0:00");
  const [linkEnd, setLinkEnd] = useState("30:00");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkProgress, setLinkProgress] = useState<SocialImportProgress | null>(null);
  const linkAbortRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestedCount, setRequestedCount] = useState<BulkClipCount>(20);
  const [idealClipSeconds, setIdealClipSeconds] = useState<BulkIdealClipSeconds>(45);
  const [groupingMode, setGroupingMode] = useState<BulkGroupingMode>("duration");
  const [ayahsPerClip, setAyahsPerClip] = useState<BulkAyahsPerClip>(2);
  const [smartCaptionSplits, setSmartCaptionSplits] = useState(true);
  const [maxArabicLines, setMaxArabicLines] = useState<BulkArabicLineLimit>(2);
  const [sourceQuality, setSourceQuality] = useState<"fast" | "hd">("fast");
  const [visualMode, setVisualMode] = useState<"source" | "template">("source");
  const [templateId, setTemplateId] = useState(FEATURED_TEMPLATES[0]?.id ?? "clean-ink");
  const [templateReplacesMedia, setTemplateReplacesMedia] = useState(false);
  const [progress, setProgress] = useState<BulkRecognitionProgress | null>(null);
  const [candidates, setCandidates] = useState<BulkClipCandidate[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [verseLookup, setVerseLookup] = useState<VerseLookup>({});
  const [inspirationIndex, setInspirationIndex] = useState(0);
  const [inspirationVerses, setInspirationVerses] = useState<VerseLookup>({});
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [job, setJob] = useState<BulkJob | null>(null);
  const [batches, setBatches] = useState<BulkJob[]>([]);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [thumbnailProgress, setThumbnailProgress] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<TemplateDefinition[]>(FEATURED_TEMPLATES);

  const replaceJob = async (next: BulkJob) => {
    const saved = await saveBulkJob(next);
    jobRef.current = saved;
    setJob(saved);
    setBatches((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    return saved;
  };

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  useEffect(() => {
    setAvailableTemplates([...FEATURED_TEMPLATES, ...getSavedTemplates(DEFAULT_TEMPLATE_STYLE)]);
  }, []);

  useEffect(() => {
    void fetchSurahs().then(setSurahs).catch(() => setError("The Quran index could not be loaded. Check your connection and reload."));
  }, []);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const restoredJobs = await Promise.race([
          loadBulkJobs(),
          new Promise<BulkJob[]>((resolve) => {
            window.setTimeout(() => resolve([]), 1_500);
          }),
        ]);
        if (cancelled) return;
        setBatches(restoredJobs);
        setStage(restoredJobs.length ? "library" : "source");
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The saved batch could not be restored.");
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([...new Set(BULK_AYAH_REFERENCES.map((item) => item.surah))].map(async (surah) => {
      const verses = await fetchVerses(surah);
      return verses;
    })).then((groups) => {
      if (cancelled) return;
      setInspirationVerses(Object.fromEntries(groups.flat().map((verse) => [verse.verse_key, verse])));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const inspiration = useMemo(() => {
    const ayahs = BULK_AYAH_REFERENCES.flatMap((item) => {
      const verse = inspirationVerses[`${item.surah}:${item.ayah}`];
      return verse ? [{ ...item, verse }] : [];
    });
    return [...ayahs, ...BULK_HADITHS];
  }, [inspirationVerses]);

  const clearLoadedSource = () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceFile(null);
    setAudioBlob(null);
    setBuffer(null);
    setSourceUrl(null);
    setCandidates([]);
    setVerseLookup({});
    setUnresolvedCount(0);
    setActiveCandidateId(null);
  };

  const openBatch = async (selected: BulkJob) => {
    setRestoring(true);
    setError(null);
    try {
      const stored = await loadBulkSource(selected.id);
      if (!stored) throw new Error("This batch's source media is no longer available in this browser.");
      const source = new File([stored.source], selected.sourceName, { type: selected.sourceType });
      const decoded = await decodeAudioFile(stored.audio);
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      const normalizedTasks = selected.renderTasks.map((task) =>
        task.status === "rendering" ? { ...task, status: "queued" as const, progress: 0 } : task,
      );
      const interrupted = selected.stage === "analysing";
      const normalized = interrupted || selected.stage === "rendering"
        ? await replaceJob({ ...selected, stage: interrupted ? "source" : "results", renderTasks: normalizedTasks })
        : selected;
      await activateBulkJob(normalized.id);
      setSourceFile(source);
      setAudioBlob(stored.audio);
      setBuffer(decoded);
      setSourceUrl(URL.createObjectURL(source));
      setRequestedCount(normalized.requestedCount);
      setIdealClipSeconds(normalized.idealClipSeconds);
      setGroupingMode(normalized.groupingMode);
      setAyahsPerClip(normalized.ayahsPerClip);
      setSmartCaptionSplits(normalized.smartCaptionSplits);
      setMaxArabicLines(normalized.maxArabicLines);
      setSourceQuality(normalized.sourceQuality);
      setVisualMode(normalized.visualMode);
      setTemplateId(normalized.templateId);
      setTemplateReplacesMedia(normalized.templateReplacesMedia === true);
      setCandidates(normalized.candidates);
      setActiveCandidateId(normalized.candidates[0]?.id ?? null);
      setUnresolvedCount(normalized.unresolvedWindows.length);
      setVerseLookup(Object.fromEntries(normalized.verses.map((verse) => [verse.verse_key, verse])));
      jobRef.current = normalized;
      setJob(normalized);
      setStage(normalized.candidates.length ? "results" : "source");
      if (interrupted) setError(`Analysis was safely checkpointed after window ${selected.nextWindowIndex}. Resume when ready.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved batch could not be opened.");
    } finally {
      setRestoring(false);
    }
  };

  const removeBatch = async (selected: BulkJob) => {
    const title = selected.candidates[0]
      ? surahs.find((surah) => surah.id === selected.candidates[0].surah)?.name_simple ?? selected.sourceName
      : selected.sourceName;
    if (!window.confirm(`Delete the saved batch “${title}”? This cannot be undone.`)) return;
    await deleteBulkJob(selected);
    setBatches((items) => items.filter((item) => item.id !== selected.id));
    if (jobRef.current?.id === selected.id) {
      clearLoadedSource();
      jobRef.current = null;
      setJob(null);
      setStage("library");
    }
  };

  useEffect(() => {
    if (stage !== "analysing" || inspiration.length < 2) return;
    const timer = window.setInterval(() => {
      setInspirationIndex((value) => (value + 1) % inspiration.length);
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [inspiration.length, stage]);

  const handleFile = async (file: File): Promise<PreparedBulkSource | null> => {
    const sizeProblem = importSizeError(file.size);
    if (sizeProblem) {
      setError(sizeProblem);
      return null;
    }
    setDecoding(true);
    setError(null);
    // Warm the recognition model and corpus during the decode.
    void import("@/lib/asr").then((asr) => asr.prewarmRecognition());
    void import("@/lib/verse-match").then((m) => m.loadCorpus()).catch(() => {});
    try {
      let resolvedAudio: Blob = file;
      let decoded: AudioBuffer;
      const video = isSupportedVideoFile(file);
      try {
        decoded = await decodeAudioFile(file);
      } catch (reason) {
        if (!video) throw reason;
        const { extractAudioFromVideo } = await import("@/lib/video-audio");
        resolvedAudio = await extractAudioFromVideo(file);
        decoded = await decodeAudioFile(resolvedAudio);
      }
      if (decoded.duration > 60 * 60 + 1) {
        throw new RangeError("Bulk Create currently supports up to 60 minutes. Trim or select a 60-minute section first.");
      }
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      setSourceFile(file);
      setAudioBlob(resolvedAudio);
      setBuffer(decoded);
      const nextSourceUrl = URL.createObjectURL(file);
      setSourceUrl(nextSourceUrl);
      setCandidates([]);
      setVerseLookup({});
      setUnresolvedCount(0);
      const nextJob = createBulkJob({
        source: file,
        duration: decoded.duration,
        requestedCount,
        templateId,
        idealClipSeconds,
        groupingMode,
        ayahsPerClip,
        smartCaptionSplits,
        maxArabicLines,
        sourceQuality,
        visualMode,
      });
      jobRef.current = nextJob;
      setJob(nextJob);
      try {
        await saveBulkSource(nextJob.id, file, resolvedAudio);
        await replaceJob(nextJob);
      } catch {
        setError("The source is ready, but this browser could not preserve the batch for refresh recovery. Keep this tab open.");
      }
      return {
        sourceFile: file,
        audioBlob: resolvedAudio,
        buffer: decoded,
        sourceUrl: nextSourceUrl,
        job: nextJob,
      };
    } catch (reason) {
      setSourceFile(null);
      setAudioBlob(null);
      setBuffer(null);
      setError(reason instanceof Error ? reason.message : "This media could not be read.");
      return null;
    } finally {
      setDecoding(false);
    }
  };

  const analyse = async (prepared?: PreparedBulkSource) => {
    const analysisBuffer = prepared?.buffer ?? buffer;
    const analysisAudio = prepared?.audioBlob ?? audioBlob;
    const analysisFile = prepared?.sourceFile ?? sourceFile;
    const analysisUrl = prepared?.sourceUrl ?? sourceUrl;
    if (!analysisBuffer || !analysisAudio || !analysisFile) return;
    if (surahs.length === 0) {
      setError("The Quran index is still loading. Try again in a moment.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setStage("analysing");
    setError(null);
    setProgress(null);
    const existing = prepared?.job ?? jobRef.current ?? createBulkJob({
      source: analysisFile,
      duration: analysisBuffer.duration,
      requestedCount,
      templateId,
      idealClipSeconds,
      groupingMode,
      ayahsPerClip,
      smartCaptionSplits,
      maxArabicLines,
      sourceQuality,
      visualMode,
    });
    let workingJob: BulkJob = {
      ...existing,
      stage: "analysing",
      requestedCount,
      templateId,
      idealClipSeconds,
      groupingMode,
      ayahsPerClip,
      smartCaptionSplits,
      maxArabicLines,
      sourceQuality,
      visualMode,
      candidates: [],
      verses: [],
      renderTasks: [],
    };
    try {
      workingJob = await replaceJob(workingJob);
      const result = await recognizeQuranInWindows({
        buffer: analysisBuffer,
        surahs,
        signal: controller.signal,
        onProgress: setProgress,
        startWindowIndex: workingJob.nextWindowIndex,
        initialAyahs: workingJob.detectedAyahs,
        initialUnresolvedWindows: workingJob.unresolvedWindows,
        onWindowComplete: async (checkpoint) => {
          workingJob = await replaceJob({
            ...workingJob,
            detectedAyahs: checkpoint.ayahs.map((ayah) => ({ ...ayah })),
            unresolvedWindows: checkpoint.unresolvedWindows.map((window) => ({ ...window })),
            nextWindowIndex: checkpoint.nextWindowIndex,
          });
        },
      });
      let generated = buildVerseCompleteCandidates({
        ayahs: result.ayahs,
        requestedCount,
        templateId,
        idealClipSeconds,
        groupingMode,
        ayahsPerClip,
      });
      const surahIds = [...new Set(generated.map((candidate) => candidate.surah))];
      const groups = await Promise.all(surahIds.map((surah) => fetchVerses(surah)));
      const verses = groups.flat();
      const verseByKey = Object.fromEntries(verses.map((verse) => [verse.verse_key, verse]));
      generated = applyCaptionLayout({
        candidates: generated,
        verseByKey,
        template: availableTemplates.find((template) => template.id === templateId),
        enabled: smartCaptionSplits,
        maxLines: maxArabicLines,
      });
      setVerseLookup(Object.fromEntries(verses.map((verse) => [verse.verse_key, verse])));
      if (analysisUrl && isSupportedVideoFile(analysisFile) && generated.length > 0) {
        setThumbnailProgress(0);
        try {
          const thumbs = await captureBulkThumbnails(analysisUrl, generated, (complete, total) => {
            setThumbnailProgress(Math.round((complete / total) * 100));
          });
          generated = generated.map((candidate) => ({ ...candidate, thumbnail: thumbs[candidate.id] }));
        } catch {
          // A missing review frame must not block Quran review or rendering.
        } finally {
          setThumbnailProgress(null);
        }
      }
      setCandidates(generated);
      setActiveCandidateId(generated[0]?.id ?? null);
      setUnresolvedCount(result.unresolvedWindows.length);
      workingJob = await replaceJob({
        ...workingJob,
        stage: "results",
        detectedAyahs: result.ayahs,
        unresolvedWindows: result.unresolvedWindows,
        candidates: generated,
        verses,
        renderTasks: generated.map((candidate) => ({ candidateId: candidate.id, status: "idle", progress: 0 })),
      });
      setStage("results");
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") {
        setStage("source");
      } else {
        setError(reason instanceof Error ? reason.message : "Bulk analysis could not finish.");
        setStage("source");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const importLink = async () => {
    const platform = sourcePlatform(link);
    if (platform !== "youtube") {
      setError("Bulk link import currently supports permitted YouTube videos. TikTok and Instagram posts can be added as files.");
      return;
    }
    const startSeconds = parseTimecode(linkStart);
    const endSeconds = parseTimecode(linkEnd);
    const rangeProblem = bulkYoutubeRangeError(startSeconds, endSeconds);
    if (rangeProblem) return setError(rangeProblem);
    if (!rightsConfirmed) return setError("Confirm that you own this video or have permission to edit it.");
    setLinkLoading(true);
    setError(null);
    setLinkProgress({ phase: "starting", percent: 0 });
    // Warm the recognition model and Quran corpus while the server downloads,
    // so analysis starts immediately once the file lands.
    void import("@/lib/asr").then((asr) => asr.prewarmRecognition());
    void import("@/lib/verse-match").then((m) => m.loadCorpus()).catch(() => {});
    const controller = new AbortController();
    linkAbortRef.current = controller;
    try {
      const { blob } = await importSocialSource({
        url: link,
        startSeconds,
        endSeconds,
        attestedRights: true,
        bulk: true,
        quality: sourceQuality,
        signal: controller.signal,
        onProgress: setLinkProgress,
      });
      const prepared = await handleFile(new File([blob], "youtube-bulk-source.mp4", { type: "video/mp4" }));
      if (prepared) await analyse(prepared);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setError(reason instanceof Error ? reason.message : "The source could not be imported.");
      }
    } finally {
      if (linkAbortRef.current === controller) linkAbortRef.current = null;
      setLinkLoading(false);
      setLinkProgress(null);
    }
  };

  const applyTemplateToAll = (nextTemplateId: string) => {
    setTemplateId(nextTemplateId);
    setCandidates((items) => {
      const next = applyCaptionLayout({
        candidates: items.map((candidate) => ({ ...candidate, templateId: nextTemplateId })),
        verseByKey: verseLookup,
        template: availableTemplates.find((template) => template.id === nextTemplateId),
        enabled: smartCaptionSplits,
        maxLines: maxArabicLines,
      });
      const current = jobRef.current;
      if (current) {
        const renderTasks = current.renderTasks.map((task) => ({
          candidateId: task.candidateId,
          status: "idle" as const,
          progress: 0,
        }));
        void replaceJob({ ...current, stage: "results", templateId: nextTemplateId, candidates: next, renderTasks });
        void Promise.all(current.renderTasks.map((task) => deleteBulkOutput(current.id, task.candidateId))).catch(() => {});
      }
      return next;
    });
  };

  const prepareCandidate = async (candidate: BulkClipCandidate) => {
    if (!audioBlob || !sourceFile) return;
    const surah = surahs.find((item) => item.id === candidate.surah);
    if (!surah) return;
    let verses = Object.values(verseLookup).filter((verse) => verse.verse_key.startsWith(`${candidate.surah}:`));
    if (verses.length === 0) verses = await fetchVerses(candidate.surah);
    const selectedNumbers = candidate.timings.map((timing) => timing.verseNumber);
    const audioUrl = URL.createObjectURL(audioBlob);
    store.beginNewProject();
    store.setSurah(surah);
    store.setVerses(verses);
    store.setSelectedVerseNumbers(selectedNumbers);
    store.setCurrentVerseIndex(0);
    store.setImportedAudio(audioUrl, `${sourceFile.name} · clip ${candidate.order}`, candidate.timings.map((item) => {
      const timing = { ...item };
      delete (timing as Partial<typeof timing>).surah;
      delete (timing as Partial<typeof timing>).confidence;
      delete (timing as Partial<typeof timing>).sourceWindow;
      return timing;
    }));
    store.setBackground({ ...DEFAULT_TEMPLATE_STYLE.background });
    store.setBackgroundFit(DEFAULT_TEMPLATE_STYLE.backgroundFit ?? "cover");
    store.setFitBackdrop(DEFAULT_TEMPLATE_STYLE.fitBackdrop ?? "black");
    if (visualMode === "source" && isSupportedVideoFile(sourceFile) && sourceUrl) {
      store.setBackground({ type: "video", value: sourceUrl, label: sourceFile.name });
      store.setBackgroundFit("cover");
      store.setBackgroundVideoSync(true);
    }
    const template = availableTemplates.find((item) => item.id === candidate.templateId);
    // With source visuals the clip's media is the imported video: the template
    // may only restyle it unless the batch explicitly opted into replacement.
    if (template) {
      applyTemplate(template, visualMode === "template"
        ? undefined
        : { replaceMedia: jobRef.current?.templateReplacesMedia === true });
    }
    const override = jobRef.current?.styleOverride;
    if (override) applyStyleSnapshot(override);
    // The clip's own saved look wins last — renders must match what the
    // creator saw when they edited this clip in Studio.
    if (candidate.styleOverride) applyStyleSnapshot(candidate.styleOverride);
    return true;
  };

  const openCandidate = async (candidate: BulkClipCandidate) => {
    const current = jobRef.current;
    if (!current) return;
    try {
      await openBulkCandidateInStudio(current.id, candidate.id);
      router.push(`/studio?bulk=${encodeURIComponent(current.id)}&clip=${encodeURIComponent(candidate.id)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This clip could not be opened in Studio.");
    }
  };

  const setTemplateMediaPolicyForJob = (replaces: boolean) => {
    setTemplateReplacesMedia(replaces);
    const current = jobRef.current;
    if (current) void replaceJob({ ...current, templateReplacesMedia: replaces });
  };

  const updateCandidates = (next: BulkClipCandidate[]) => {
    setCandidates(next);
    const current = jobRef.current;
    if (current) void replaceJob({ ...current, candidates: next });
  };

  const toggleApproved = (candidateId: string) => {
    updateCandidates(candidates.map((candidate) =>
      candidate.id === candidateId ? { ...candidate, approved: !candidate.approved } : candidate,
    ));
  };

  const updateRenderTask = async (candidateId: string, patch: Partial<BulkRenderTask>, persist = true) => {
    const current = jobRef.current;
    if (!current) return null;
    const existing = current.renderTasks.find((task) => task.candidateId === candidateId)
      ?? { candidateId, status: "idle" as const, progress: 0 };
    const nextTask = { ...existing, ...patch };
    const renderTasks = current.renderTasks.some((task) => task.candidateId === candidateId)
      ? current.renderTasks.map((task) => task.candidateId === candidateId ? nextTask : task)
      : [...current.renderTasks, nextTask];
    const next = { ...current, renderTasks };
    jobRef.current = next;
    setJob(next);
    return persist ? await replaceJob(next) : next;
  };

  const runRenderQueue = async (candidateIds?: string[]) => {
    const currentJob = jobRef.current;
    if (!currentJob || rendering) return;
    const targets = candidates.filter((candidate) =>
      (candidateIds ? candidateIds.includes(candidate.id) : candidate.approved)
      && currentJob.renderTasks.find((task) => task.candidateId === candidate.id)?.status !== "ready",
    );
    if (targets.length === 0) return;
    stopRenderingRef.current = false;
    setRendering(true);
    setError(null);
    let queuedJob = { ...currentJob, stage: "rendering" as const };
    for (const candidate of targets) {
      const existing = queuedJob.renderTasks.find((task) => task.candidateId === candidate.id);
      const queuedTask: BulkRenderTask = { ...existing, candidateId: candidate.id, status: "queued", progress: 0, error: undefined };
      queuedJob = {
        ...queuedJob,
        renderTasks: queuedJob.renderTasks.some((task) => task.candidateId === candidate.id)
          ? queuedJob.renderTasks.map((task) => task.candidateId === candidate.id ? queuedTask : task)
          : [...queuedJob.renderTasks, queuedTask],
      };
    }
    await replaceJob(queuedJob);
    try {
      for (const candidate of targets) {
        if (stopRenderingRef.current) {
          await updateRenderTask(candidate.id, { status: "cancelled", progress: 0 });
          continue;
        }
        await updateRenderTask(candidate.id, { status: "rendering", progress: 1, error: undefined });
        try {
          const prepared = await prepareCandidate(candidate);
          if (!prepared) throw new Error("The source media is unavailable.");
          const rendered = await renderClipFile((complete, total) => {
            const percent = total > 0 ? Math.max(1, Math.min(99, Math.round((complete / total) * 100))) : 1;
            void updateRenderTask(candidate.id, { progress: percent }, false);
          });
          if (!rendered) throw new Error("No complete Quran rows were available to render.");
          const extension = rendered.file.type.includes("mp4") ? "mp4" : "webm";
          const output = new File(
            [rendered.file],
            `ayahclip-${candidate.surah}-${candidate.ayahStart}-${candidate.ayahEnd}.${extension}`,
            { type: rendered.file.type },
          );
          await saveBulkOutput(currentJob.id, candidate.id, output);
          const librarySaved = await saveRenderedToLibrary(output);
          await updateRenderTask(candidate.id, {
            status: "ready",
            progress: 100,
            outputName: output.name,
            outputType: output.type,
            outputSize: output.size,
            librarySaved,
          });
        } catch (reason) {
          await updateRenderTask(candidate.id, {
            status: "failed",
            progress: 0,
            error: reason instanceof Error ? reason.message : "This clip could not be rendered.",
          });
        }
      }
    } finally {
      const latest = jobRef.current;
      if (latest) {
        const completed = latest.renderTasks.filter((task) => task.status === "ready").length;
        await replaceJob({ ...latest, stage: completed > 0 ? "complete" : "results" });
      }
      setRendering(false);
    }
  };

  const outputFile = async (candidateId: string) => {
    const current = jobRef.current;
    const task = current?.renderTasks.find((item) => item.candidateId === candidateId);
    if (!current || !task?.outputName) return null;
    const blob = await loadBulkOutput(current.id, candidateId);
    return blob ? new File([blob], task.outputName, { type: task.outputType ?? blob.type }) : null;
  };

  const deliverCandidate = async (candidateId: string) => {
    const file = await outputFile(candidateId);
    if (file) await deliverFileInGesture(file);
  };

  const deliverReadyBatch = async () => {
    const current = jobRef.current;
    if (!current) return;
    setDeliveryBusy(true);
    try {
      const files = (await Promise.all(
        current.renderTasks.filter((task) => task.status === "ready").map((task) => outputFile(task.candidateId)),
      )).filter((file): file is File => Boolean(file));
      await deliverBulkFilesInGesture(files);
    } finally {
      setDeliveryBusy(false);
    }
  };

  const startNewBatch = async () => {
    abortRef.current?.abort();
    stopRenderingRef.current = true;
    clearLoadedSource();
    jobRef.current = null;
    setJob(null);
    setError(null);
    setStage("source");
  };

  const togglePreview = async (candidate: BulkClipCandidate) => {
    const player = previewRef.current;
    if (!player || !sourceUrl) return;
    if (activePreview === candidate.id && !player.paused) {
      player.pause();
      setActivePreview(null);
      return;
    }
    player.currentTime = candidate.start;
    previewEndRef.current = candidate.end;
    await player.play();
    setActivePreview(candidate.id);
  };

  const overallProgress = progress
    ? Math.round(((progress.window - 1 + STAGE_ORDER[progress.recognition.stage]) / progress.windowCount) * 100)
    : 1;
  const approvedCount = candidates.filter((candidate) => candidate.approved).length;
  const readyCount = job?.renderTasks.filter((task) => task.status === "ready").length ?? 0;
  const failedCount = job?.renderTasks.filter((task) => task.status === "failed").length ?? 0;
  const renderTaskById = Object.fromEntries((job?.renderTasks ?? []).map((task) => [task.candidateId, task]));
  const activeCandidateIndex = Math.max(0, candidates.findIndex((candidate) => candidate.id === activeCandidateId));
  const activeCandidate = candidates[activeCandidateIndex];
  const sourceDuration = buffer?.duration ?? job?.duration ?? candidates.at(-1)?.end ?? 0;
  const selectRelativeCandidate = (offset: number) => {
    if (!candidates.length) return;
    const index = Math.max(0, Math.min(candidates.length - 1, activeCandidateIndex + offset));
    setActiveCandidateId(candidates[index].id);
  };

  return (
    <main className="bg-mihrab min-h-[calc(100dvh-65px)] px-4 pb-24 pt-8 sm:px-5 sm:pt-12">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-gold-soft/75">Bulk Create</p>
          <h1 className="font-display mt-3 text-3xl leading-tight text-parchment sm:text-5xl">One recitation. Complete ayahs. A reviewable clip set.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
            Choose how many drafts you want. AyahClip uses duration only to balance the set, then places every cut at a detected ayah boundary.
          </p>
        </header>

        {restoring && (
          <div className="mt-8 rounded-2xl border border-[var(--hairline-soft)] bg-white/[0.025] px-5 py-4 text-sm text-[var(--muted)]" role="status">
            Restoring your last bulk batch…
          </div>
        )}

        {!restoring && stage === "library" && (
          <section className="mt-9" aria-labelledby="bulk-collections-heading">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--hairline-soft)] pb-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold-soft/70">Collections</p>
                <h2 id="bulk-collections-heading" className="mt-2 text-2xl font-medium text-parchment">Your bulk batches</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">Open a set to review its clips one at a time.</p>
              </div>
              <button type="button" onClick={() => void startNewBatch()} className="btn-gold min-h-11 rounded-xl px-5 text-sm">New batch</button>
            </div>
            {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-100">{error}</p>}
            {batches.length === 0 ? (
              <div className="mt-7 rounded-2xl border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
                <p className="text-lg font-medium text-parchment">No bulk collections yet</p>
                <button type="button" onClick={() => void startNewBatch()} className="btn-gold mt-5 min-h-11 rounded-xl px-5 text-sm">Create your first batch</button>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {batches.map((batch) => {
                  const first = batch.candidates[0];
                  const surahIds = [...new Set(batch.candidates.map((candidate) => candidate.surah))];
                  const title = surahIds.map((id) => surahs.find((surah) => surah.id === id)?.name_simple ?? `Surah ${id}`).slice(0, 2).join(" · ") || batch.sourceName;
                  return (
                    <article key={batch.id} className="group relative aspect-square overflow-hidden rounded-2xl border border-[var(--hairline-soft)] bg-[#101115]">
                      <button type="button" onClick={() => void openBatch(batch)} className="absolute inset-0 z-10 flex min-h-11 w-full items-end p-4 text-left" aria-label={`Open ${title} batch`}>
                        {first?.thumbnail && <span className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.03]" style={{ backgroundImage: `url(${first.thumbnail})` }} />}
                        <span className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
                        <span className="relative block min-w-0">
                          <span className="block truncate text-sm font-medium text-white">{title}</span>
                          <span className="mt-1 block text-xs text-white/65">{batch.candidates.length} clips · {fmt(batch.duration)}</span>
                        </span>
                      </button>
                      <button type="button" onClick={() => void removeBatch(batch)} className="absolute right-2 top-2 z-20 min-h-11 min-w-11 rounded-xl bg-black/65 px-3 text-xs text-white/75 opacity-100 backdrop-blur sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" aria-label={`Delete ${title} batch`}>Delete</button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {!restoring && stage === "source" && (
          <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="panel p-5 sm:p-7" aria-labelledby="bulk-source-heading">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold-soft/70">1 · Source</p>
                  <h2 id="bulk-source-heading" className="mt-2 text-xl font-medium text-parchment">Add up to 60 minutes</h2>
                </div>
                {buffer && <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">{fmt(buffer.duration)} ready</span>}
              </div>

              <input ref={fileInputRef} type="file" accept="audio/*,video/*,.mov,.m4a" aria-label="Bulk source file" className="sr-only" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file).then((prepared) => {
                  if (prepared) void analyse(prepared);
                });
              }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-6 flex min-h-32 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--hairline)] bg-white/[0.02] px-5 text-center transition-colors hover:border-[var(--gold)] hover:bg-[rgba(201,162,75,0.04)]">
                <span className="text-sm font-medium text-parchment">{decoding ? "Preparing media…" : sourceFile?.name ?? "Choose a video or audio file"}</span>
                <span className="mt-1 text-xs leading-5 text-[var(--muted)]">MP4, MOV, MP3, M4A, or WAV · 750 MB maximum</span>
              </button>

              <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-[var(--muted-deep)]"><span className="h-px flex-1 bg-white/[0.07]" />or import a permitted YouTube section<span className="h-px flex-1 bg-white/[0.07]" /></div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_auto]">
                <input value={link} onChange={(event) => { setLink(event.target.value); setRightsConfirmed(false); }} className="field min-h-11 px-3 text-sm" placeholder="https://youtu.be/…" aria-label="YouTube link" />
                <input value={linkStart} onChange={(event) => setLinkStart(event.target.value)} className="field min-h-11 px-3 text-sm" aria-label="Start time" />
                <input value={linkEnd} onChange={(event) => setLinkEnd(event.target.value)} className="field min-h-11 px-3 text-sm" aria-label="End time" />
                <button type="button" onClick={() => void importLink()} disabled={linkLoading} className="btn-ghost min-h-11 rounded-xl px-4 text-sm disabled:opacity-50">{linkLoading ? "Importing…" : "Import & create"}</button>
              </div>
              {linkLoading && (
                <div role="status" className="mt-4 rounded-xl border border-[var(--hairline-soft)] bg-white/[0.02] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-soft/80">YouTube import</p>
                    <button type="button" onClick={() => linkAbortRef.current?.abort()} className="text-xs text-[var(--muted)] underline-offset-2 hover:text-parchment hover:underline">Cancel</button>
                  </div>
                  <p className="mt-2 text-xs tabular-nums text-[var(--muted)]">{describeImportProgress(linkProgress)}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                    <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${Math.max(2, linkProgress?.percent ?? 0)}%` }} />
                  </div>
                </div>
              )}
              <fieldset className="mt-4">
                <legend className="text-xs text-[var(--muted)]">YouTube import quality</legend>
                <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Bulk YouTube import quality">
                  {([
                    ["fast", "Fast draft", "480p · fastest path"],
                    ["hd", "HD source", "Up to 720p · slower"],
                  ] as const).map(([value, label, detail]) => (
                    <button key={value} type="button" role="radio" aria-checked={sourceQuality === value} onClick={() => setSourceQuality(value)} className={`min-h-11 rounded-xl border px-3 py-2 text-left ${sourceQuality === value ? "border-[var(--gold)] bg-[rgba(201,162,75,0.08)]" : "border-[var(--hairline-soft)]"}`}>
                      <span className="block text-xs font-medium text-parchment">{label}</span>
                      <span className="mt-0.5 block text-[10px] text-[var(--muted)]">{detail}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-xs leading-5 text-[var(--muted)]">
                <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-[var(--gold)]" />
                <span>I own this video or have permission from its rights holder to download and edit it.</span>
              </label>
              {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm leading-5 text-red-100">{error}</p>}
            </section>

            <aside className="panel p-5 sm:p-6">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold-soft/70">2 · Output</p>
              <fieldset className="mt-5">
                <legend className="text-sm font-medium text-parchment">Draft clips</legend>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {BULK_CLIP_COUNTS.map((count) => <button key={count} type="button" onClick={() => setRequestedCount(count)} aria-pressed={requestedCount === count} className={`min-h-11 rounded-xl border text-sm ${requestedCount === count ? "border-[var(--gold)] bg-[rgba(201,162,75,0.12)] text-parchment" : "border-[var(--hairline-soft)] text-[var(--muted)]"}`}>{count}</button>)}
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Up to this many. Short sources may contain fewer trustworthy complete passages.</p>
              </fieldset>
              <fieldset className="mt-6">
                <legend className="text-sm font-medium text-parchment">How should ayahs be grouped?</legend>
                <div className="mt-3 grid gap-2">
                  {([
                    ["duration", "Smart length", "Balance duration without cutting an ayah"],
                    ["exact", "Exact ayah count", "Every draft has the count you choose"],
                    ["whole-passage", "Whole detected passage", "Keep Al-Fatihah or another contiguous passage together"],
                  ] as const).map(([value, label, detail]) => (
                    <button key={value} type="button" onClick={() => setGroupingMode(value)} aria-pressed={groupingMode === value} className={`min-h-11 rounded-xl border px-3 py-2 text-left ${groupingMode === value ? "border-[var(--gold)] bg-[rgba(201,162,75,0.1)]" : "border-[var(--hairline-soft)]"}`}>
                      <span className="block text-xs font-medium text-parchment">{label}</span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-[var(--muted)]">{detail}</span>
                    </button>
                  ))}
                </div>
                {groupingMode === "duration" && (
                  <div className="mt-3 grid grid-cols-4 gap-2" aria-label="Ideal clip length">
                    {BULK_IDEAL_CLIP_SECONDS.map((seconds) => <button key={seconds} type="button" onClick={() => setIdealClipSeconds(seconds)} aria-pressed={idealClipSeconds === seconds} className={`min-h-11 rounded-xl border text-sm ${idealClipSeconds === seconds ? "border-[var(--gold)] bg-[rgba(201,162,75,0.12)] text-parchment" : "border-[var(--hairline-soft)] text-[var(--muted)]"}`}>{seconds}s</button>)}
                  </div>
                )}
                {groupingMode === "exact" && (
                  <div className="mt-3 grid grid-cols-4 gap-2" aria-label="Exact ayahs per clip">
                    {BULK_AYAHS_PER_CLIP.map((count) => <button key={count} type="button" onClick={() => setAyahsPerClip(count)} aria-pressed={ayahsPerClip === count} className={`min-h-11 rounded-xl border text-sm ${ayahsPerClip === count ? "border-[var(--gold)] bg-[rgba(201,162,75,0.12)] text-parchment" : "border-[var(--hairline-soft)] text-[var(--muted)]"}`}>{count}</button>)}
                  </div>
                )}
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  {groupingMode === "exact"
                    ? `Only complete groups of ${ayahsPerClip} ayahs become drafts; an incomplete remainder is withheld.`
                    : groupingMode === "whole-passage"
                      ? "One draft is created for each uninterrupted detected passage in a surah."
                      : "Usually 1–4 complete ayahs; duration bends to protect the Quran boundary."}
                </p>
              </fieldset>
              <fieldset className="mt-6">
                <legend className="text-sm font-medium text-parchment">Visuals</legend>
                <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Bulk clip visuals">
                  {([
                    ["source", "Keep source video"],
                    ["template", "Use preset background"],
                  ] as const).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={visualMode === value} onClick={() => setVisualMode(value)} className={`min-h-11 rounded-xl border px-3 text-xs ${visualMode === value ? "border-[var(--gold)] bg-[rgba(201,162,75,0.1)] text-parchment" : "border-[var(--hairline-soft)] text-[var(--muted)]"}`}>{label}</button>
                  ))}
                </div>
              </fieldset>
              <div className="mt-6 rounded-xl border border-[var(--hairline-soft)] p-4">
                <label className="flex cursor-pointer items-start justify-between gap-4 text-sm text-parchment">
                  <span><span className="block font-medium">Keep Arabic captions compact</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Use model-aligned word timing to page long ayahs without cutting their audio.</span></span>
                  <input type="checkbox" checked={smartCaptionSplits} onChange={(event) => setSmartCaptionSplits(event.target.checked)} className="mt-1 h-5 w-5 accent-[var(--gold)]" />
                </label>
                {smartCaptionSplits && <label className="mt-4 block text-xs text-[var(--muted)]">Maximum Arabic lines
                  <select value={maxArabicLines} onChange={(event) => setMaxArabicLines(Number(event.target.value) as BulkArabicLineLimit)} className="field mt-2 min-h-11 w-full px-3 text-sm text-parchment">
                    {BULK_ARABIC_LINE_LIMITS.map((lines) => <option key={lines} value={lines}>{lines} lines</option>)}
                  </select>
                </label>}
              </div>
              <label className="mt-6 block text-sm font-medium text-parchment" htmlFor="bulk-template">Text and layout preset</label>
              <select id="bulk-template" value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="field mt-3 min-h-11 w-full px-3 text-sm">
                {availableTemplates.map((template) => <option key={template.id} value={template.id}>{template.source === "user" ? "My preset · " : ""}{template.name}</option>)}
              </select>
              <button type="button" onClick={() => void analyse()} disabled={!buffer || decoding || linkLoading || surahs.length === 0} className="btn-gold mt-7 min-h-12 w-full rounded-xl px-5 text-sm disabled:cursor-not-allowed disabled:opacity-45">{job?.nextWindowIndex ? "Resume creating drafts" : "Create verse-complete drafts"}</button>
              <p className="mt-3 text-center text-xs leading-5 text-[var(--muted)]">{job?.nextWindowIndex ? `Resume from saved window ${job.nextWindowIndex + 1}.` : "A 30-minute source may take 5–8 minutes; an hour roughly doubles that."} Progress is saved after every window.</p>
            </aside>
          </div>
        )}

        {stage === "analysing" && (
          <AnalysisView progress={progress} overallProgress={overallProgress} thumbnailProgress={thumbnailProgress} inspiration={inspiration[inspirationIndex]} onCancel={() => abortRef.current?.abort()} />
        )}

        {stage === "results" && (
          <section className="mt-9">
            <div className="flex flex-col gap-5 border-b border-[var(--hairline-soft)] pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold-soft/70">Review</p>
                <h2 className="mt-2 text-2xl font-medium text-parchment">{candidates.length} verse-complete drafts</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">{approvedCount} approved · {readyCount} rendered{failedCount ? ` · ${failedCount} need attention` : ""}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted-deep)]">{unresolvedCount ? `${unresolvedCount} ambiguous source window${unresolvedCount === 1 ? " was" : "s were"} withheld instead of guessed.` : "Every analysed window produced a confident Quran match."}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setStage("library")} className="btn-ghost min-h-11 rounded-xl px-4 text-sm">Collections</button>
                <div className="flex items-center rounded-xl border border-[var(--hairline-soft)]" aria-label="Clip navigation">
                  <button type="button" onClick={() => selectRelativeCandidate(-1)} disabled={activeCandidateIndex === 0} className="min-h-11 min-w-11 rounded-l-xl text-lg text-parchment disabled:opacity-30" aria-label="Previous clip">←</button>
                  <span className="px-2 text-xs tabular-nums text-[var(--muted)]">{candidates.length ? activeCandidateIndex + 1 : 0} / {candidates.length}</span>
                  <button type="button" onClick={() => selectRelativeCandidate(1)} disabled={activeCandidateIndex >= candidates.length - 1} className="min-h-11 min-w-11 rounded-r-xl text-lg text-parchment disabled:opacity-30" aria-label="Next clip">→</button>
                </div>
                <select value={templateId} onChange={(event) => applyTemplateToAll(event.target.value)} className="field min-h-11 px-3 text-sm" aria-label="Apply preset to all clips">
                  {availableTemplates.map((template) => <option key={template.id} value={template.id}>All clips · {template.name}</option>)}
                </select>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--hairline-soft)] px-3 text-xs text-[var(--muted)]" title="When off, presets restyle text and layout but every clip keeps its current media.">
                  <input
                    type="checkbox"
                    checked={templateReplacesMedia}
                    onChange={(event) => setTemplateMediaPolicyForJob(event.target.checked)}
                    className="h-4 w-4 accent-[var(--gold)]"
                  />
                  <span>Preset replaces media</span>
                </label>
                <button type="button" onClick={() => void runRenderQueue()} disabled={rendering || approvedCount === 0} className="btn-gold min-h-11 rounded-xl px-4 text-sm disabled:opacity-45">{rendering ? "Rendering queue…" : `Render approved (${approvedCount})`}</button>
                {readyCount > 0 && <button type="button" onClick={() => void deliverReadyBatch()} disabled={deliveryBusy} className="btn-ghost min-h-11 rounded-xl px-4 text-sm disabled:opacity-45">{deliveryBusy ? "Preparing…" : `Download ready (${readyCount})`}</button>}
                {rendering && <button type="button" onClick={() => { stopRenderingRef.current = true; }} className="btn-ghost min-h-11 rounded-xl px-4 text-sm">Stop after current</button>}
                <button type="button" onClick={() => void startNewBatch()} disabled={rendering} className="btn-ghost min-h-11 rounded-xl px-4 text-sm disabled:opacity-45">New batch</button>
              </div>
            </div>

            {sourceUrl && <video ref={previewRef} src={sourceUrl} className="sr-only" playsInline onTimeUpdate={(event) => {
              if (previewEndRef.current !== null && event.currentTarget.currentTime >= previewEndRef.current) {
                event.currentTarget.pause();
                setActivePreview(null);
              }
            }} />}

            {candidates.length > 0 && (
              <BulkTimelineOverview
                candidates={candidates}
                duration={sourceDuration}
                activeCandidateId={activeCandidate?.id ?? null}
                renderTaskById={renderTaskById}
                onSelect={setActiveCandidateId}
              />
            )}

            {candidates.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
                <h3 className="text-lg font-medium text-parchment">No trustworthy clip ranges yet</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">The source may include speech, noise, or recitation spanning ambiguous windows. No Quran range was guessed.</p>
                <button type="button" onClick={() => setStage("source")} className="btn-gold mt-5 min-h-11 rounded-xl px-5 text-sm">Try another section</button>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {candidates.filter((candidate) => candidate.id === activeCandidate?.id).map((candidate) => {
                  const firstVerse = verseLookup[`${candidate.surah}:${candidate.ayahStart}`];
                  const surah = surahs.find((item) => item.id === candidate.surah);
                  const template = availableTemplates.find((item) => item.id === candidate.templateId);
                  const task = renderTaskById[candidate.id];
                  return (
                    <article key={candidate.id} className={`overflow-hidden rounded-2xl border bg-[rgba(16,17,21,0.78)] transition-colors ${candidate.approved ? "border-[var(--hairline)]" : "border-white/[0.06] opacity-65"}`}>
                      <div className="grid gap-0 sm:grid-cols-[2.5rem_7rem_minmax(0,1fr)] lg:grid-cols-[2.5rem_7rem_minmax(0,1fr)_13rem]">
                        <label className="flex min-h-12 cursor-pointer items-center justify-center border-b border-[var(--hairline-soft)] sm:border-b-0 sm:border-r">
                          <input type="checkbox" checked={candidate.approved} onChange={() => toggleApproved(candidate.id)} aria-label={`Approve clip ${candidate.order}`} className="h-5 w-5 accent-[var(--gold)]" />
                        </label>
                        <div className="relative aspect-video overflow-hidden bg-black sm:aspect-[9/16]">
                          {candidate.thumbnail ? <div role="img" aria-label={`Source frame for clip ${candidate.order}`} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${candidate.thumbnail})` }} /> : <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-[var(--muted-deep)]">Audio source</div>}
                          <span className="absolute bottom-2 left-2 rounded-md bg-black/75 px-1.5 py-1 text-[10px] tabular-nums text-white">{fmt(candidate.duration)}</span>
                        </div>
                        <div className="min-w-0 p-4 sm:p-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-parchment">{surah?.name_simple ?? `Surah ${candidate.surah}`} · {candidate.ayahStart}{candidate.ayahEnd === candidate.ayahStart ? "" : `–${candidate.ayahEnd}`}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] ${candidate.confidence === "high" ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-100"}`}>{candidate.confidence}</span>
                            <span className="text-xs tabular-nums text-[var(--muted-deep)]">{fmt(candidate.start)}–{fmt(candidate.end)}</span>
                            {candidate.timings.some((timing) => timing.splits?.length) && <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-sky-100">Model-timed caption pages</span>}
                          </div>
                          <p dir="rtl" lang="ar" className="font-arabic mt-3 line-clamp-2 text-right text-xl font-normal leading-9 text-parchment">{firstVerse?.text_uthmani ?? "Quran text loading"}</p>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{firstVerse?.translation ?? "Translation loading"}</p>
                          <div className="mt-3 flex min-w-0 items-center gap-2">
                            <span className="h-6 w-6 shrink-0 rounded-md border border-white/10" style={{ background: template?.swatch }} />
                            <span className="truncate text-xs text-[var(--muted)]">{template?.name}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap content-center gap-2 border-t border-[var(--hairline-soft)] p-4 sm:col-start-2 sm:col-end-4 lg:col-start-auto lg:col-end-auto lg:border-l lg:border-t-0">
                          {task?.status === "rendering" || task?.status === "queued" ? (
                            <div className="w-full" role="status">
                              <div className="flex justify-between text-xs text-[var(--muted)]"><span>{task.status === "queued" ? "Queued" : "Rendering"}</span><span>{task.progress}%</span></div>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full bg-gold transition-[width]" style={{ width: `${task.progress}%` }} /></div>
                            </div>
                          ) : task?.status === "ready" ? (
                            <button type="button" onClick={() => void deliverCandidate(candidate.id)} className="btn-gold min-h-11 flex-1 rounded-xl px-3 text-xs">Download</button>
                          ) : (
                            <button type="button" onClick={() => void runRenderQueue([candidate.id])} disabled={rendering} className="btn-gold min-h-11 flex-1 rounded-xl px-3 text-xs disabled:opacity-45">{task?.status === "failed" ? "Retry render" : "Render"}</button>
                          )}
                          <button type="button" onClick={() => void togglePreview(candidate)} className="btn-ghost min-h-11 flex-1 rounded-xl px-3 text-xs">{activePreview === candidate.id ? "Pause" : "Listen"}</button>
                          <button type="button" onClick={() => void openCandidate(candidate)} className="btn-ghost min-h-11 w-full rounded-xl px-3 text-xs">Open in Studio</button>
                          {task?.status === "failed" && <p className="w-full text-xs leading-5 text-red-200">{task.error}</p>}
                          {task?.status === "ready" && task.librarySaved === false && <p className="w-full text-[10px] leading-4 text-amber-100">Rendered, but local Library storage was full.</p>}
                        </div>
                      </div>
                    </article>
                  );
                })}
                <nav className="flex gap-2 overflow-x-auto pb-2 pt-2" aria-label="Batch clips">
                  {candidates.map((candidate, index) => {
                    const surah = surahs.find((item) => item.id === candidate.surah);
                    const task = renderTaskById[candidate.id];
                    return (
                      <button key={candidate.id} type="button" onClick={() => setActiveCandidateId(candidate.id)} aria-current={candidate.id === activeCandidate?.id ? "true" : undefined} className={`relative min-h-24 w-24 shrink-0 overflow-hidden rounded-xl border text-left ${candidate.id === activeCandidate?.id ? "border-[var(--gold)]" : "border-[var(--hairline-soft)]"}`}>
                        {candidate.thumbnail && <span className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${candidate.thumbnail})` }} />}
                        <span className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
                        <span className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{index + 1}</span>
                        <span className="absolute bottom-2 left-2 right-2 truncate text-[10px] font-medium text-white">{surah?.name_simple ?? `Surah ${candidate.surah}`} {candidate.ayahStart}–{candidate.ayahEnd}</span>
                        {task?.status === "ready" && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-300" aria-label="Rendered" />}
                      </button>
                    );
                  })}
                </nav>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function BulkTimelineOverview({
  candidates,
  duration,
  activeCandidateId,
  renderTaskById,
  onSelect,
}: {
  candidates: BulkClipCandidate[];
  duration: number;
  activeCandidateId: string | null;
  renderTaskById: Record<string, BulkRenderTask | undefined>;
  onSelect: (candidateId: string) => void;
}) {
  const safeDuration = Math.max(duration, candidates.at(-1)?.end ?? 1, 1);

  return (
    <section className="mt-6 rounded-2xl border border-[var(--hairline-soft)] bg-[rgba(16,17,21,0.62)] p-4" aria-labelledby="bulk-timeline-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="bulk-timeline-heading" className="text-sm font-medium text-parchment">Source timeline</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">Each segment is a complete-ayah draft. Select a range to review its text, listen, render, or open it in Studio.</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold" />Active</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-300" />Ready</span>
          <span className="tabular-nums">{fmt(safeDuration)}</span>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto pb-1">
        <div className="relative h-20 min-w-[720px] rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)]">
          <div className="absolute inset-x-3 top-8 h-2 rounded-full bg-white/[0.07]" />
          {candidates.map((candidate) => {
            const left = Math.max(0, Math.min(100, (candidate.start / safeDuration) * 100));
            const width = Math.max(2.5, Math.min(100 - left, ((candidate.end - candidate.start) / safeDuration) * 100));
            const active = candidate.id === activeCandidateId;
            const task = renderTaskById[candidate.id];
            const statusClass = task?.status === "ready"
              ? "bg-emerald-300 text-[var(--ink-deep)]"
              : candidate.approved
                ? "bg-gold text-[var(--ink-deep)]"
                : "bg-white/[0.18] text-parchment";

            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => onSelect(candidate.id)}
                aria-label={`Review clip ${candidate.order}, ${fmt(candidate.start)} to ${fmt(candidate.end)}`}
                aria-current={active ? "true" : undefined}
                className={`absolute top-4 h-11 min-w-8 rounded-lg px-2 text-left transition-[transform,border-color,background-color] hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${statusClass} ${active ? "ring-2 ring-gold-soft ring-offset-2 ring-offset-[var(--ink-deep)]" : ""}`}
                style={{ left: `calc(${left}% + 12px)`, width: `calc(${width}% - 24px)` }}
              >
                <span className="block truncate text-[10px] font-semibold tabular-nums">{candidate.order}</span>
                <span className="block truncate text-[9px] tabular-nums opacity-75">{fmt(candidate.start)}-{fmt(candidate.end)}</span>
              </button>
            );
          })}
          <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[9px] tabular-nums text-[var(--muted-deep)]">
            <span>0:00</span>
            <span>{fmt(safeDuration)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnalysisView({ progress, overallProgress, thumbnailProgress, inspiration, onCancel }: {
  progress: BulkRecognitionProgress | null;
  overallProgress: number;
  thumbnailProgress: number | null;
  inspiration: (typeof BULK_HADITHS)[number] | ({ kind: "ayah"; surah: number; ayah: number; reference: string; verse: Verse }) | undefined;
  onCancel: () => void;
}) {
  return (
    <section className="mx-auto mt-10 max-w-3xl text-center" aria-live="polite">
      <div className="relative mx-auto flex h-28 w-28 items-center justify-center" aria-hidden="true">
        <span className="absolute inset-0 rounded-full border border-[var(--hairline)] bulk-orbit" />
        <span className="absolute inset-4 rounded-full border border-gold/30 bulk-orbit-reverse" />
        <span className="font-arabic text-3xl font-normal text-gold-soft">اقْرَأْ</span>
      </div>
      <p className="mt-7 text-xs font-medium uppercase tracking-[0.2em] text-gold-soft/70">{thumbnailProgress === null ? `Analysing window ${progress?.window ?? 1} of ${progress?.windowCount ?? "…"}` : "Preparing review frames"}</p>
      <h2 className="mt-3 text-2xl font-medium text-parchment">{thumbnailProgress === null ? progress?.recognition.detail ?? "Preparing the Quran recognition model" : `Building visual results · ${thumbnailProgress}%`}</h2>
      <div className="mx-auto mt-6 h-1.5 max-w-xl overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${thumbnailProgress === null ? Math.max(2, overallProgress) : thumbnailProgress}%` }} />
      </div>
      <p className="mt-2 text-xs tabular-nums text-[var(--muted)]">{thumbnailProgress ?? overallProgress}% · cuts are placed only after complete ayahs</p>

      {inspiration && (
        <div key={inspiration.kind === "hadith" ? inspiration.reference : inspiration.reference} className="bulk-inspiration mx-auto mt-10 max-w-2xl border-y border-[var(--hairline-soft)] px-4 py-7">
          {inspiration.kind === "ayah" ? (
            <>
              <p dir="rtl" lang="ar" className="font-arabic text-2xl font-normal leading-10 text-parchment">{inspiration.verse.text_uthmani}</p>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">{inspiration.verse.translation}</p>
            </>
          ) : <p className="mx-auto max-w-xl text-base leading-7 text-parchment">“{inspiration.text}”</p>}
          <p className="mt-4 text-xs font-medium text-gold-soft">{inspiration.reference}</p>
          {inspiration.kind === "hadith" && <a href={inspiration.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-[var(--muted)] underline decoration-white/20 underline-offset-4 hover:text-parchment">Verified source</a>}
        </div>
      )}
      <button type="button" onClick={onCancel} className="btn-ghost mt-7 min-h-11 rounded-xl px-5 text-sm">Cancel analysis</button>
    </section>
  );
}
