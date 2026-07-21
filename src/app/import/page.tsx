"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSurahs, fetchVerses } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { getTranslationLanguage } from "@/lib/translations";
import {
  decodeAudioFile,
  autoSegment,
  verseTextAt,
} from "@/lib/audio-import";
import {
  getVerseWeights,
  loadCorpus,
} from "@/lib/verse-match";
import {
  alignmentFailureMessage,
} from "@/lib/alignment-feedback";
import { Surah, Verse } from "@/types";
import {
  browserDeviceMemoryGb,
  importSizeError,
  recognitionDurationError,
  recognitionDurationWarning,
  RECOMMENDED_IMPORT_BYTES,
} from "@/lib/import-limits";
import {
  RECOGNITION_STAGES,
  recognitionActionLabel,
  type RecognitionProgress,
} from "@/lib/recognition-progress";
import {
  durationBucket,
  startCreatorJourney,
  trackProductEvent,
} from "@/lib/telemetry";
import { isSupportedVideoFile } from "@/lib/media-file";
import { describeImportProgress, importSocialSource, type SocialImportProgress } from "@/lib/social-import";
import {
  recognizeQuranPassage,
  type QuranRecognitionCandidate as RecognitionCandidate,
  type QuranRecognitionResult as RecognitionResult,
} from "@/lib/quran-recognition";
import {
  isNativeMobileEditor,
  requestNativeProjectHydration,
  sendNativeProjectChange,
  type MobileProjectSnapshotV1,
} from "@/lib/mobile-bridge";
import { snapshotFromRecognition } from "@/lib/mobile-project-adapter";
import {
  formatTimecode,
  parseTimecode,
  sourcePlatform,
  youtubeRangeError,
} from "@/lib/source-link";

// Very short files are often UI test tones, accidental taps, or a single
// breath. Loading the full local ASR model for them adds memory pressure while
// producing little useful evidence; the manual Recognise action remains ready.
const MIN_AUTOMATIC_RECOGNITION_SECONDS = 10;

export default function ImportPage() {
  const router = useRouter();
  const store = useAppStore();

  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [sourceAudio, setSourceAudio] = useState<Blob | null>(null); // audio used for the clip (extracted for video)
  const [videoUrl, setVideoUrl] = useState<string | null>(null); // original video, to optionally use as background
  const [videoMode, setVideoMode] = useState<"replace-visuals" | "keep-video">("replace-visuals");
  const [videoFit, setVideoFit] = useState<"cover" | "contain">("contain");
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [decodeMsg, setDecodeMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [socialURL, setSocialURL] = useState("");
  const [socialDownloading, setSocialDownloading] = useState(false);
  const [socialProgress, setSocialProgress] = useState<SocialImportProgress | null>(null);
  const socialAbortRef = useRef<AbortController | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [segmentStart, setSegmentStart] = useState("0:00");
  const [segmentEnd, setSegmentEnd] = useState("3:00");
  const [youtubeRightsConfirmed, setYoutubeRightsConfirmed] = useState(false);
  const [sourceQuality, setSourceQuality] = useState<"fast" | "hd">("fast");
  const [autoRecognize, setAutoRecognize] = useState(true);
  const [socialElapsed, setSocialElapsed] = useState(0);
  const socialImportStartedRef = useRef(false);

  const detectedSourcePlatform = sourcePlatform(socialURL);
  const isYouTubeSource = detectedSourcePlatform === "youtube";
  const segmentStartSeconds = parseTimecode(segmentStart);
  const segmentEndSeconds = parseTimecode(segmentEnd);
  const segmentProblem = isYouTubeSource
    ? youtubeRangeError(segmentStartSeconds, segmentEndSeconds)
    : null;
  const segmentDuration = segmentStartSeconds !== null && segmentEndSeconds !== null
    ? Math.max(0, segmentEndSeconds - segmentStartSeconds)
    : 0;

  const [surahId, setSurahId] = useState(1);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("1");
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const decodeOperationRef = useRef(0);
  const detectAbortRef = useRef<AbortController | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);
  const previewStopAtRef = useRef<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPlayingKey, setPreviewPlayingKey] = useState<string | null>(null);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [detectedVerses, setDetectedVerses] = useState<Verse[]>([]);

  const openFilePicker = () => {
    const el = fileInputRef.current;
    if (!el) return;
    // Reset so picking the same file twice still fires onChange.
    el.value = "";
    el.click();
  };

  const [detecting, setDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState<RecognitionProgress | null>(null);
  const [rangeConfirmed, setRangeConfirmed] = useState(false);
  const [detected, setDetected] = useState<RecognitionResult | null>(null);
  const [recognitionCandidates, setRecognitionCandidates] = useState<RecognitionCandidate[]>([]);
  const [nativeSnapshot, setNativeSnapshot] = useState<MobileProjectSnapshotV1 | null>(null);
  const [nativeSourceURL, setNativeSourceURL] = useState<string | null>(null);
  const nativeHydrationStartedRef = useRef(false);

  const runRecognition = useCallback(async (targetBuffer: AudioBuffer) => {
    if (surahs.length === 0) {
      setDetectError("The Quran index is still loading. Wait a moment, then recognise again.");
      return;
    }
    detectAbortRef.current?.abort();
    const controller = new AbortController();
    detectAbortRef.current = controller;
    setDetecting(true);
    setDetectError(null);
    try {
      const outcome = await recognizeQuranPassage({
        buffer: targetBuffer,
        surahs,
        deviceMemoryGb: browserDeviceMemoryGb(),
        signal: controller.signal,
        onProgress: setDetectProgress,
      });
      if (controller.signal.aborted || detectAbortRef.current !== controller) return;
      if (outcome.kind === "matched") {
        const result = outcome.result;
        setSurahId(result.surah);
        setFrom(String(result.ayahStart));
        setTo(String(result.ayahEnd));
        setRecognitionCandidates([]);
        setRangeConfirmed(false);
        setDetected(result);
      } else if (outcome.kind === "ambiguous") {
        setRecognitionCandidates(outcome.candidates);
        setDetected(null);
        setRangeConfirmed(false);
        setDetectError(outcome.message);
      } else {
        setDetectError(detected
          ? "Couldn't confidently match this run. Your previous Quran range is still available below."
          : outcome.message);
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setDetectError(`${alignmentFailureMessage(error)} ${detected
          ? "Your previous Quran range is still available below."
          : "You can still pick the verses manually below."}`);
      }
    } finally {
      if (detectAbortRef.current === controller) {
        detectAbortRef.current = null;
        setDetecting(false);
        setDetectProgress(null);
      }
    }
  }, [detected, surahs]);

  const autoDetect = () => {
    if (buffer) void runRecognition(buffer);
  };

  const chooseRecognitionCandidate = (candidate: RecognitionCandidate) => {
    setSurahId(candidate.surah);
    setFrom(String(candidate.ayahStart));
    setTo(String(candidate.ayahEnd));
    setDetected({ ...candidate, confidence: "selected" });
    setRecognitionCandidates([]);
    setDetectError(null);
    setRangeConfirmed(false);
  };

  const clearRecognitionChoice = () => {
    // A deliberate manual correction always wins over an in-flight automatic
    // result. Otherwise a late model response could overwrite the creator's
    // selected range just as they continue to Studio.
    detectAbortRef.current?.abort();
    setDetected(null);
    setRecognitionCandidates([]);
    setDetectError(null);
    setRangeConfirmed(false);
  };

  const cancelDetection = () => {
    setDetectProgress({ stage: detectProgress?.stage ?? "listen", detail: "Cancelling recognition" });
    detectAbortRef.current?.abort();
  };

  useEffect(() => {
    startCreatorJourney();
    fetchSurahs().then(setSurahs).catch(() => {
      setError("Couldn't load the Quran index. Check your connection, then reload this page.");
    });
  }, []);

  useEffect(() => () => detectAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!socialDownloading) {
      setSocialElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const tick = () => setSocialElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [socialDownloading]);

  useEffect(() => {
    if (!sourceAudio) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(sourceAudio);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceAudio]);

  useEffect(() => {
    let cancelled = false;
    if (!detected) {
      setDetectedVerses([]);
      return;
    }
    const language = getTranslationLanguage(store.translationLanguage);
    void fetchVerses(detected.surah, language.resourceId).then((verses) => {
      if (cancelled) return;
      setDetectedVerses(verses.filter((verse) =>
        verse.verse_number >= detected.ayahStart && verse.verse_number <= detected.ayahEnd
      ));
    }).catch(() => {
      if (!cancelled) setDetectedVerses([]);
    });
    return () => { cancelled = true; };
  }, [detected, store.translationLanguage]);

  useEffect(() => {
    previewAudioRef.current?.pause();
    previewStopAtRef.current = null;
    setPreviewPlayingKey(null);
    setPreviewCurrentTime(0);
    setPreviewError(null);
  }, [detected, previewUrl]);

  const surah = surahs.find((s) => s.id === surahId);

  const handleFile = useCallback(async (f: File | undefined): Promise<AudioBuffer | null> => {
    if (!f) return null;
    detectAbortRef.current?.abort();
    const sizeError = importSizeError(f.size);
    if (sizeError) {
      setError(sizeError);
      return null;
    }
    const operation = ++decodeOperationRef.current;
    setFile(f);
    setBuffer(null);
    setSourceAudio(null);
    setError(null);
    setDetectError(null);
    setDetected(null);
    setRecognitionCandidates([]);
    setRangeConfirmed(false);
    setBuildError(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const isVideo = isSupportedVideoFile(f);
    setVideoUrl(isVideo ? URL.createObjectURL(f) : null);
    setVideoMode("replace-visuals");
    setVideoFit("contain");
    setDecoding(true);
    try {
      let audioBlob: Blob = f;
      let buf: AudioBuffer;
      // Safari and Chromium can decode the AAC track in ordinary MP4/MOV files
      // directly. This avoids copying a phone-sized video into ffmpeg.wasm — a
      // large, unnecessary allocation that could terminate the iOS web view.
      if (isVideo) {
        setDecodeMsg("Reading video audio…");
        try {
          buf = await decodeAudioFile(f);
        } catch {
          if (isNativeMobileEditor(window.location.search)) {
            throw new Error("native-video-decode");
          }
          setDecodeMsg("Converting video audio…");
          const { extractAudioFromVideo } = await import("@/lib/video-audio");
          audioBlob = await extractAudioFromVideo(f);
          if (decodeOperationRef.current !== operation) return null;
          buf = await decodeAudioFile(audioBlob);
        }
      } else {
        setDecodeMsg("Reading audio…");
        buf = await decodeAudioFile(audioBlob);
      }
      if (decodeOperationRef.current !== operation) return null;
      setSourceAudio(audioBlob);
      setBuffer(buf);
      trackProductEvent("source_loaded", {
        sourceKind: isVideo ? "video" : "audio",
        durationBucket: durationBucket(buf.duration),
      });
      return buf;
    } catch (cause) {
      if (decodeOperationRef.current !== operation) return null;
      setError(
        cause instanceof Error && cause.message === "native-video-decode"
          ? "This video’s audio format is not supported on iPhone. Export it as an MP4 with AAC audio, then try again."
          : "Couldn't read the audio from this file. Try an MP3/M4A/WAV, or a different video."
      );
      return null;
    } finally {
      if (decodeOperationRef.current === operation) {
        setDecoding(false);
        setDecodeMsg(null);
      }
    }
  }, [videoUrl]);

  const importSocialPost = useCallback(async (value = socialURL) => {
    const url = value.trim();
    if (!url || socialDownloading) return;
    const platform = sourcePlatform(url);
    const startSeconds = parseTimecode(segmentStart);
    const endSeconds = parseTimecode(segmentEnd);
    if (platform === "youtube") {
      const rangeError = youtubeRangeError(startSeconds, endSeconds);
      if (rangeError) {
        setSocialError(rangeError);
        return;
      }
      if (!youtubeRightsConfirmed) {
        setSocialError("Confirm that you own this YouTube video or have permission to edit it.");
        return;
      }
    }
    setSocialDownloading(true);
    setSocialError(null);
    setSocialProgress({ phase: "starting", percent: 0 });
    // Warm the recognition model and Quran corpus while the server downloads,
    // so auto-recognition starts immediately once the file lands.
    void import("@/lib/asr").then((asr) => asr.prewarmRecognition());
    void import("@/lib/verse-match").then((m) => m.loadCorpus()).catch(() => {});
    const controller = new AbortController();
    socialAbortRef.current = controller;
    try {
      const { blob, fileName } = await importSocialSource({
        url,
        ...(platform === "youtube" ? {
          startSeconds,
          endSeconds,
          attestedRights: youtubeRightsConfirmed,
          quality: sourceQuality,
        } : {}),
        signal: controller.signal,
        onProgress: setSocialProgress,
      });
      const name = fileName || `social-source-${Date.now()}.mp4`;
      const resolvedFile = new File([blob], name, { type: "video/mp4" });
      const decoded = await handleFile(resolvedFile);
      setVideoMode("keep-video");
      if (platform === "youtube") setVideoFit("cover");
      setSocialURL(url);
      if (decoded && autoRecognize) void runRecognition(decoded);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setSocialError(reason instanceof Error ? reason.message : "AyahClip could not download that post.");
      }
    } finally {
      if (socialAbortRef.current === controller) socialAbortRef.current = null;
      setSocialDownloading(false);
      setSocialProgress(null);
    }
  }, [autoRecognize, handleFile, runRecognition, segmentEnd, segmentStart, socialDownloading, socialURL, sourceQuality, youtubeRightsConfirmed]);

  const pasteSocialLink = async () => {
    try {
      const pasted = await navigator.clipboard.readText();
      setSocialURL(pasted.trim());
      setYoutubeRightsConfirmed(false);
      setSocialError(null);
    } catch {
      setSocialError("Clipboard access was blocked. Press and hold the field to paste the link.");
    }
  };

  useEffect(() => {
    if (socialImportStartedRef.current) return;
    const sharedURL = new URLSearchParams(window.location.search).get("social");
    if (!sharedURL) return;
    socialImportStartedRef.current = true;
    setSocialURL(sharedURL);
    void importSocialPost(sharedURL);
  }, [importSocialPost]);

  useEffect(() => {
    if (!isNativeMobileEditor(window.location.search) || nativeHydrationStartedRef.current) return;
    nativeHydrationStartedRef.current = true;
    let cancelled = false;
    void requestNativeProjectHydration("ayahclip-web-0.1.0", [
      "unknown-passage-recognition",
      "manual-quran-range",
      "recognition-review",
      "native-media",
    ]).then(async (snapshot) => {
      if (!snapshot || cancelled) return;
      const source = snapshot.media.find((item) =>
        item.contentType.startsWith("audio/") || item.contentType.startsWith("video/"));
      if (!source) throw new Error("The native project has no recitation media to recognise.");
      const response = await fetch(source.url, { cache: "no-store" });
      if (!response.ok) throw new Error("The imported iPhone media could not be opened.");
      const blob = await response.blob();
      if (cancelled) return;
      const extension = source.contentType.startsWith("video/")
        ? source.contentType.includes("quicktime") ? "mov" : "mp4"
        : source.contentType.includes("wav") ? "wav"
          : source.contentType.includes("mpeg") ? "mp3" : "m4a";
      const nativeFile = new File([blob], `iPhone import.${extension}`, {
        type: source.contentType,
      });
      setNativeSnapshot(snapshot);
      setNativeSourceURL(source.url);
      const decoded = await handleFile(nativeFile);
      if (decoded && autoRecognize && decoded.duration >= MIN_AUTOMATIC_RECOGNITION_SECONDS) {
        void runRecognition(decoded);
      }
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setError(reason instanceof Error
          ? reason.message
          : "The imported iPhone media could not be opened.");
      }
    });
    return () => { cancelled = true; };
  }, [autoRecognize, handleFile, runRecognition]);

  const cancelDecode = async () => {
    decodeOperationRef.current += 1;
    setDecoding(false);
    setDecodeMsg(null);
    setFile(null);
    setSourceAudio(null);
    setBuffer(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    const { cancelAudioExtraction } = await import("@/lib/video-audio");
    cancelAudioExtraction();
  };

  const create = async () => {
    if (!buffer || !sourceAudio || !surah || !rangeConfirmed) return;
    const lo = Math.max(1, Math.min(surah.verses_count, parseInt(from) || 1));
    const hi = Math.max(lo, Math.min(surah.verses_count, parseInt(to) || lo));
    const verseNumbers = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

    setBuilding(true);
    setBuildError(null);
    try {
      const lang = getTranslationLanguage(store.translationLanguage);
      const verses = await fetchVerses(surah.id, lang.resourceId);

      // Cut the clip into per-verse blocks on the recitation's real pauses (text
      // length only decides which pause belongs to which verse). Studio's "Align
      // by recitation" can later refine this with word onsets for run-on clips.
      await loadCorpus();
      const timings = detected &&
        detected.surah === surah.id &&
        detected.ayahStart === lo &&
        detected.ayahEnd === hi
        ? detected.timings.map((timing) => ({ ...timing }))
        : autoSegment(buffer, verseNumbers, getVerseWeights(surah.id, lo, hi));
      // Revoke the previous import's blob URL before minting a new one — it's about
      // to be replaced wholesale by beginNewProject, so nothing references it. Saved
      // projects persist the blob to IndexedDB (not the URL), so they're unaffected.
      const prevSource = store.audioSource;
      if (prevSource.mode === "imported" && prevSource.url.startsWith("blob:")) {
        URL.revokeObjectURL(prevSource.url);
      }
      const url = nativeSourceURL ?? URL.createObjectURL(sourceAudio);

      store.beginNewProject();
      store.setSurah(surah);
      store.setVerses(verses);
      store.setSelectedVerseNumbers(verseNumbers);
      store.setCurrentVerseIndex(0);
      store.setImportedAudio(url, file?.name ?? "Imported audio", timings);
      if (nativeSnapshot) store.setProjectId(nativeSnapshot.id);
      // Use the uploaded video itself as the clip background, with the creator's
      // chosen initial 9:16 fit. Studio keeps crop, position, and scale editable.
      if (videoUrl && videoMode === "keep-video") {
        store.setBackground({
          type: "video",
          value: nativeSourceURL ?? videoUrl,
          label: file?.name ?? "Uploaded video",
        });
        store.setBackgroundFit(videoFit);
        store.setBackgroundVideoSync(true); // lip-sync the video to the recitation
      }
      if (videoUrl && videoMode === "replace-visuals") {
        URL.revokeObjectURL(videoUrl);
      }
      if (nativeSnapshot) {
        const updatedSnapshot = snapshotFromRecognition(
          nativeSnapshot,
          surah,
          verses,
          verseNumbers,
          timings,
        );
        if (!await sendNativeProjectChange(updatedSnapshot)) {
          throw new Error("The confirmed Quran range could not be saved to the iPhone project.");
        }
        setNativeSnapshot(updatedSnapshot);
        router.push("/studio?native=ios&bridge=1&project=" + encodeURIComponent(updatedSnapshot.id));
        return;
      }
      router.push(videoUrl && videoMode === "keep-video" ? "/studio" : "/styles?from=import");
    } catch {
      setBuildError("Couldn't prepare this clip. Check your connection and try again; your range selection is still here.");
    } finally {
      setBuilding(false);
    }
  };

  const fmt = (s: number) => {
    const seconds = Math.max(0, Math.floor(s));
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
  };
  const toggleRecognitionPreview = async (
    key: string,
    start: number,
    end: number,
  ) => {
    const audio = previewAudioRef.current;
    if (!audio || !previewUrl) return;
    if (previewPlayingKey === key && !audio.paused) {
      audio.pause();
      setPreviewPlayingKey(null);
      return;
    }
    const safeStart = Math.max(0, Math.min(start, Math.max(0, (audio.duration || buffer?.duration || end) - 0.01)));
    const safeEnd = Math.max(safeStart + 0.05, Math.min(end, audio.duration || buffer?.duration || end));
    previewStopAtRef.current = safeEnd;
    audio.currentTime = safeStart;
    setPreviewCurrentTime(safeStart);
    try {
      await audio.play();
      setPreviewPlayingKey(key);
      setPreviewError(null);
    } catch {
      setPreviewPlayingKey(null);
      setPreviewError("This browser couldn't preview the selected audio. You can still verify and refine it in Studio.");
    }
  };

  const updateRecognitionPreview = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    setPreviewCurrentTime(audio.currentTime);
    const stopAt = previewStopAtRef.current;
    if (stopAt !== null && audio.currentTime >= stopAt - 0.025) {
      audio.pause();
      audio.currentTime = stopAt;
      setPreviewCurrentTime(stopAt);
      setPreviewPlayingKey(null);
      previewStopAtRef.current = null;
    }
  };
  const recognitionBlock = buffer
    ? recognitionDurationError(buffer.duration, browserDeviceMemoryGb())
    : null;
  const recognitionWarning = buffer && !recognitionBlock
    ? recognitionDurationWarning(buffer.duration)
    : null;

  return (
    <main className="bg-mihrab min-h-[calc(100dvh-65px)]">
      <div className="mx-auto max-w-6xl px-5 py-8 lg:py-10">
        <header className="grid gap-6 border-b border-[var(--hairline-soft)] pb-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] lg:items-end">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.24em] text-gold-soft/70">
              Import recitation
            </p>
            <h1 className="font-display max-w-2xl text-2xl tracking-wide text-parchment sm:text-4xl">
              Import a recitation
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Add media, confirm the verses, then edit.
            </p>
          </div>
          <ol className="hidden grid-cols-3 gap-px overflow-hidden rounded-xl border border-[var(--hairline-soft)] bg-[var(--hairline-soft)] text-[11px] text-[var(--muted)] sm:grid">
          {[
            ["01", "Add media"],
            ["02", "Confirm verses"],
            ["03", "Style & export"],
          ].map(([number, label]) => (
            <li key={number} className="bg-[var(--ink-deep)] px-3 py-3">
              <span className="mr-1.5 tabular-nums text-gold-soft">{number}</span>{label}
            </li>
          ))}
          </ol>
        </header>

        <div className="mt-7 grid items-start gap-5 lg:grid-cols-[minmax(340px,0.82fr)_minmax(0,1.48fr)]">

        {/* Step 1 — upload */}
        <section className="panel p-5 lg:sticky lg:top-[88px]" aria-labelledby="source-heading">
          <div className="mb-4 flex items-start justify-between gap-4 border-b border-[var(--hairline-soft)] pb-4">
            <div>
              <p className="text-xs sm:text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft/75">Step 1</p>
              <h2 id="source-heading" className="mt-1 text-base font-medium text-parchment">Source media</h2>
            </div>
            {buffer && (
              <span className="rounded-full border border-emerald-soft/20 bg-emerald-soft/10 px-2.5 py-1 text-xs sm:text-[10px] text-emerald-soft">Ready</span>
            )}
          </div>
          <div className="mb-4 rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-3">
            <label htmlFor="social-post-url" className="text-xs font-medium text-parchment">
              Import from a link
            </label>
            <p className="mt-1 text-xs leading-4 text-[var(--muted-deep)]">
              Your YouTube video, or a permitted TikTok or Instagram post.
            </p>
            <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
              <input
                id="social-post-url"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                value={socialURL}
                onInput={(event) => {
                  setSocialURL(event.currentTarget.value);
                  setSocialError(null);
                }}
                onChange={(event) => {
                  setSocialURL(event.target.value);
                  setSocialError(null);
                }}
                onKeyDown={(event) => event.key === "Enter" && void importSocialPost()}
                placeholder="https://youtube.com/watch?v=…"
                className="field min-h-11 min-w-0 flex-1 px-3 text-base sm:text-sm"
              />
              <button
                type="button"
                onClick={pasteSocialLink}
                disabled={socialDownloading}
                className="min-h-11 rounded-lg border border-[var(--hairline)] px-3 text-xs text-parchment disabled:opacity-50"
              >
                Paste
              </button>
            </div>
            {isYouTubeSource && (
              <div className="mt-3 border-t border-[var(--hairline-soft)] pt-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs text-[var(--muted)]">
                    Start
                    <input
                      type="text"
                      inputMode="numeric"
                      value={segmentStart}
                      onChange={(event) => setSegmentStart(event.target.value)}
                      onBlur={() => segmentStartSeconds !== null && setSegmentStart(formatTimecode(segmentStartSeconds))}
                      aria-describedby="youtube-range-help"
                      className="field mt-1 min-h-10 w-full px-3 text-base tabular-nums sm:text-sm"
                    />
                  </label>
                  <span className="pb-3 text-[var(--muted-deep)]" aria-hidden="true">→</span>
                  <label className="min-w-0 flex-1 text-xs text-[var(--muted)]">
                    End
                    <input
                      type="text"
                      inputMode="numeric"
                      value={segmentEnd}
                      onChange={(event) => setSegmentEnd(event.target.value)}
                      onBlur={() => segmentEndSeconds !== null && setSegmentEnd(formatTimecode(segmentEndSeconds))}
                      aria-describedby="youtube-range-help"
                      className="field mt-1 min-h-10 w-full px-3 text-base tabular-nums sm:text-sm"
                    />
                  </label>
                  <span className="pb-2.5 text-xs tabular-nums text-gold-soft">
                    {!segmentProblem && segmentDuration > 0 ? `${formatTimecode(segmentDuration)} selected` : "Max 8:00"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Quick segment length">
                  {[1, 3, 5].map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => {
                        const start = parseTimecode(segmentStart) ?? 0;
                        setSegmentStart(formatTimecode(start));
                        setSegmentEnd(formatTimecode(start + minutes * 60));
                        setSocialError(null);
                      }}
                      className="rounded-full border border-[var(--hairline-soft)] px-2.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--hairline)] hover:text-parchment"
                    >
                      {minutes} min
                    </button>
                  ))}
                  <span id="youtube-range-help" className="ml-auto text-xs text-[var(--muted-deep)]">Use m:ss or h:mm:ss</span>
                </div>
                {segmentProblem && <p className="mt-2 text-xs text-red-300">{segmentProblem}</p>}
                <fieldset className="mt-3">
                  <legend className="text-xs text-[var(--muted)]">Import quality</legend>
                  <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="YouTube import quality">
                    {([
                      ["fast", "Fast", "480p · usually seconds"],
                      ["hd", "HD", "Up to 720p · may be slower"],
                    ] as const).map(([value, label, detail]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={sourceQuality === value}
                        onClick={() => setSourceQuality(value)}
                        className={`min-h-11 rounded-lg border px-3 py-2 text-left transition-colors ${
                          sourceQuality === value
                            ? "border-[var(--gold)] bg-[rgba(201,162,75,0.08)]"
                            : "border-[var(--hairline-soft)] hover:border-[var(--hairline)]"
                        }`}
                      >
                        <span className="block text-xs font-medium text-parchment">{label}</span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)] sm:text-[10px]">{detail}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-4 text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={youtubeRightsConfirmed}
                    onChange={(event) => setYoutubeRightsConfirmed(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--gold)]"
                  />
                  <span>I own this video or have permission from its rights holder to download and edit it.</span>
                </label>
              </div>
            )}
            <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--hairline-soft)] px-3 py-2 text-xs text-parchment">
              <span>
                <span className="block font-medium">Recognise verses after import</span>
                <span className="mt-0.5 block text-xs leading-4 text-[var(--muted)]">Starts local Quran matching automatically for clips of 10 seconds or longer.</span>
              </span>
              <input
                type="checkbox"
                checked={autoRecognize}
                onChange={(event) => setAutoRecognize(event.target.checked)}
                className="h-5 w-5 shrink-0 accent-[var(--gold)]"
              />
            </label>
            <button
              type="button"
              onClick={() => void importSocialPost()}
              disabled={
                !socialURL.trim()
                || socialDownloading
                || (isYouTubeSource && (Boolean(segmentProblem) || !youtubeRightsConfirmed))
              }
              className="btn-gold mt-3 min-h-11 w-full rounded-lg px-4 text-xs disabled:opacity-50"
            >
              {socialDownloading
                ? isYouTubeSource ? "Importing segment…" : "Downloading…"
                : isYouTubeSource && !segmentProblem
                  ? `Import ${formatTimecode(segmentDuration)} segment`
                  : "Import video"}
            </button>
            {socialDownloading && (
              <div role="status" className="mt-3 rounded-lg border border-[var(--hairline-soft)] bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs tabular-nums text-gold-soft">{describeImportProgress(socialProgress)} · {socialElapsed}s</p>
                  <button type="button" onClick={() => socialAbortRef.current?.abort()} className="text-xs text-[var(--muted)] underline-offset-2 hover:text-parchment hover:underline">Cancel</button>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${Math.max(2, socialProgress?.percent ?? 0)}%` }} />
                </div>
                <p className="mt-2 text-[11px] leading-4 text-[var(--muted)]">
                  {isYouTubeSource ? "Only the selected range is downloaded." : "Keep AyahClip open; public posts usually take a few seconds."}
                </p>
              </div>
            )}
            {socialError && <p role="alert" className="mt-2 text-xs leading-4 text-red-300">{socialError}</p>}
            <p className="mt-2 hidden text-xs leading-4 text-[var(--muted-deep)] sm:block">
              Public links import directly. AyahClip trims only your selected range and keeps the video editable in Studio.
            </p>
          </div>
          {/* Defensive uploader: explicit ref + button.click() — iOS WebKit
              has historically refused to open the picker for label-wrapped
              hidden file inputs. The button is the user-gesture target;
              programmatic input.click() is guaranteed to work inside it. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*,.mov,.m4v"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              void handleFile(selected).then((decoded) => {
                if (decoded && autoRecognize && decoded.duration >= MIN_AUTOMATIC_RECOGNITION_SECONDS) {
                  void runRecognition(decoded);
                }
              });
            }}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={openFilePicker}
            className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--ink-deep)]/55 p-7 text-center transition-colors hover:border-gold focus-visible:border-gold"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--hairline)] text-xl text-gold-soft">↑</span>
            <span className="text-sm text-parchment">
              {file ? file.name : "Choose audio or video"}
            </span>
            <span className="text-xs text-[var(--muted-deep)]">
              {decoding
                ? decodeMsg ?? "Reading audio…"
                : buffer
                  ? `Loaded · ${fmt(buffer.duration)}`
                  : "MP3, M4A, WAV, MP4, WebM or MOV · processed locally"}
            </span>
          </button>
          <div className="mt-3 flex items-start justify-between gap-4 text-[10px] leading-4 text-[var(--muted-deep)]">
            <p className="hidden sm:block">
              Best under 20 minutes or {Math.round(RECOMMENDED_IMPORT_BYTES / 1024 / 1024)} MB. Longer media can use substantial browser memory during decoding and export.
            </p>
            {decoding && (
              <button type="button" onClick={cancelDecode} className="min-h-9 shrink-0 rounded-full border border-[var(--hairline)] px-3 text-[var(--muted)] hover:border-gold hover:text-parchment">
                Cancel
              </button>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          {(recognitionBlock || recognitionWarning) && (
            <p className={`mt-3 rounded-lg border px-3 py-2 text-xs sm:text-[11px] leading-relaxed ${
              recognitionBlock
                ? "border-red-400/25 bg-red-400/10 text-red-200"
                : "border-amber-400/25 bg-amber-400/10 text-amber-100/85"
            }`}>
              {recognitionBlock ?? recognitionWarning}
            </p>
          )}

          {/* A video may be used intact or treated as an audio source. */}
          {videoUrl && buffer && (
            <fieldset className="mt-4">
              <legend className="mb-2 text-xs font-medium text-[var(--muted)]">What should AyahClip keep?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <VideoChoice
                  checked={videoMode === "replace-visuals"}
                  onChange={() => setVideoMode("replace-visuals")}
                  title="Keep audio, replace visuals"
                  description="Recommended · choose a template and add your own reciter image or B-roll."
                />
                <VideoChoice
                  checked={videoMode === "keep-video"}
                  onChange={() => setVideoMode("keep-video")}
                  title="Keep video and audio"
                  description="Use the uploaded video intact and keep it lip-synced in Studio."
                />
              </div>
              {videoMode === "keep-video" && (
                <div className="mt-3 flex flex-col gap-2 border-t border-[var(--hairline-soft)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-parchment">Mobile framing</p>
                    <p className="mt-0.5 text-xs sm:text-[10px] text-[var(--muted-deep)]">You can fine-tune crop, position, and scale in Studio.</p>
                  </div>
                  <div className="flex shrink-0 gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1" role="radiogroup" aria-label="Initial mobile framing">
                    {([
                      ["cover", "Fill 9:16 (crop)"],
                      ["contain", "Show whole"],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={videoFit === value}
                        onClick={() => setVideoFit(value)}
                        className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                          videoFit === value
                            ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                            : "text-[var(--muted)] hover:text-parchment"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>
          )}
        </section>

        {/* Step 2 — verses */}
        <section className="panel min-w-0 p-5 lg:p-6" aria-labelledby="passage-heading">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--hairline-soft)] pb-4">
            <div>
              <p className="text-xs sm:text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft/75">Step 2</p>
              <h2 id="passage-heading" className="mt-1 text-base font-medium text-parchment">Identify and verify the passage</h2>
              <p className="mt-1 hidden text-[11px] leading-4 text-[var(--muted)] sm:block">Listen, correct the range if needed, then confirm.</p>
            </div>
            {rangeConfirmed && (
              <span className="rounded-full border border-emerald-soft/20 bg-emerald-soft/10 px-2.5 py-1 text-xs sm:text-[10px] text-emerald-soft">Range confirmed</span>
            )}
          </div>

          <div className="mb-5 min-w-0 overflow-hidden rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)]">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-parchment">Recognise and align locally</p>
                <p className="mt-0.5 hidden text-[11px] leading-4 text-[var(--muted)] sm:block">
                  Finds the Quran range, then places editable ayah boundaries. Audio never leaves this browser.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={autoDetect}
                  disabled={detecting || !buffer || surahs.length === 0 || !!recognitionBlock}
                  className="btn-gold min-h-11 rounded-full px-4 text-xs disabled:opacity-50"
                >
                  {recognitionActionLabel(
                    detecting,
                    detectProgress,
                    Boolean(detected || recognitionCandidates.length),
                  )}
                </button>
                {detecting && (
                  <button
                    type="button"
                    onClick={cancelDetection}
                    className="min-h-11 rounded-full border border-[var(--hairline)] px-3 text-xs sm:text-[11px] text-[var(--muted)] hover:border-gold hover:text-parchment"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {detectProgress && <RecognitionProgressPanel progress={detectProgress} />}

            {detectError && (
              <div role="alert" className="border-t border-amber-400/20 bg-amber-400/[0.08] px-4 py-3 text-xs sm:text-[11px] leading-relaxed text-amber-100/90">
                <span className="font-medium text-amber-100">Recognition needs your help.</span>{" "}
                {detectError}
              </div>
            )}

            {recognitionCandidates.length > 0 && (
              <div className="border-t border-[var(--hairline-soft)] px-4 py-4">
                <p className="text-xs sm:text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100/70">
                  Possible Quran ranges
                </p>
                <p className="mt-1 text-xs sm:text-[11px] leading-4 text-[var(--muted)]">
                  Tap a range to keep its prepared ayah cuts. Short verses can occur in more than one place, so use the editable Quran range below if yours is not listed.
                </p>
                <div role="group" aria-label="Possible Quran ranges" className="mt-3 grid gap-2">
                  {recognitionCandidates.map((candidate, index) => (
                    <button
                      key={candidate.key}
                      type="button"
                      onClick={() => chooseRecognitionCandidate(candidate)}
                      className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-[var(--hairline-soft)] bg-[var(--surface)] px-3 py-2.5 text-left transition-colors hover:border-gold/45 focus-visible:border-gold"
                    >
                      <span>
                        <span className="block text-xs sm:text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                          {index === 0 ? "Closest match" : `Alternative ${index}`}
                        </span>
                        <span className="mt-0.5 block text-sm text-parchment">{candidate.ref}</span>
                      </span>
                      <span className="shrink-0 text-xs text-gold-soft">Choose</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {detected && (
              <div className="border-t border-[var(--hairline-soft)] bg-[rgba(201,162,75,0.035)] px-4 py-4">
                <p className="text-xs sm:text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Suggested Quran range
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <p className="font-display text-xl text-parchment">{detected.ref}</p>
                  <span aria-label="Quran range confidence" className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                    Range: {detected.confidence === "selected" ? "creator selected" : `${detected.confidence} confidence`}
                  </span>
                  <span aria-label="Ayah cut method" className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                    Cuts: {detected.review.methodLabel}
                  </span>
                </div>
                <p className={`mt-3 rounded-lg border px-3 py-2.5 text-xs sm:text-[11px] leading-relaxed ${
                  detected.review.reviewVerseNumbers.length
                    ? "border-amber-400/25 bg-amber-400/10 text-amber-100/85"
                    : "border-emerald-soft/20 bg-emerald-soft/10 text-emerald-soft"
                }`}>
                  {detected.review.message} Confirm the Quran range below before continuing.
                </p>
                {previewUrl && detected.timings.length > 0 && (
                  <section className="mt-4 border-t border-[var(--hairline-soft)] pt-4" aria-labelledby="listen-verify-heading">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p id="listen-verify-heading" className="text-xs font-medium text-parchment">Listen and verify</p>
                        <p className="mt-0.5 text-xs sm:text-[10px] leading-4 text-[var(--muted)]">Play the whole suggestion or check each ayah before confirming the range.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleRecognitionPreview(
                          "passage",
                          detected.timings[0].start,
                          detected.timings[detected.timings.length - 1].end,
                        )}
                        className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs sm:text-[11px] font-medium transition-colors ${
                          previewPlayingKey === "passage"
                            ? "border-gold bg-gold/10 text-gold-soft"
                            : "border-[var(--hairline)] text-parchment hover:border-gold"
                        }`}
                        aria-label={previewPlayingKey === "passage" ? "Pause suggested passage" : "Play suggested passage"}
                      >
                        <PreviewPlayIcon playing={previewPlayingKey === "passage"} />
                        {previewPlayingKey === "passage" ? "Pause passage" : "Play passage"}
                      </button>
                    </div>
                    <div className="mt-3 divide-y divide-[var(--hairline-soft)] rounded-xl border border-[var(--hairline-soft)] bg-[var(--surface)]/55">
                      {detected.timings.map((timing) => {
                        const key = `ayah-${timing.verseNumber}`;
                        const playing = previewPlayingKey === key;
                        const playingInPassage = previewPlayingKey === "passage" &&
                          previewCurrentTime >= timing.start &&
                          previewCurrentTime <= timing.end;
                        const verse = detectedVerses.find((item) => item.verse_number === timing.verseNumber);
                        const partial = Boolean(timing.wordRange);
                        const duration = Math.max(0.05, timing.end - timing.start);
                        const progress = playing || playingInPassage
                          ? Math.max(0, Math.min(100, ((previewCurrentTime - timing.start) / duration) * 100))
                          : 0;
                        return (
                          <div key={`${timing.verseNumber}-${timing.start}`} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[rgba(201,162,75,0.03)]">
                            <button
                              type="button"
                              onClick={() => toggleRecognitionPreview(key, timing.start, timing.end)}
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                playing
                                  ? "border-gold bg-gold text-[var(--ink-deep)]"
                                  : "border-[var(--hairline)] text-gold-soft hover:border-gold"
                              }`}
                              aria-label={playing ? `Pause ayah ${timing.verseNumber}` : `Play ayah ${timing.verseNumber}`}
                            >
                              <PreviewPlayIcon playing={playing} />
                            </button>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-[10px] font-semibold uppercase tracking-[0.13em] text-gold-soft/75">Ayah {timing.verseNumber}</span>
                                {partial && (
                                  <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-2 py-0.5 text-xs uppercase tracking-[0.1em] text-amber-100 sm:text-[10px]">
                                    Partial ayah recognised
                                  </span>
                                )}
                                <span className="ml-auto rounded border border-[var(--hairline-soft)] bg-[var(--ink-deep)] px-1.5 py-0.5 text-xs sm:text-[10px] tabular-nums text-[var(--muted-deep)]">{fmt(timing.start)}–{fmt(timing.end)}</span>
                              </div>
                              <p className="font-arabic mt-1 truncate text-right text-lg leading-9 text-parchment sm:text-xl" dir="rtl" lang="ar">
                                {verse ? verseTextAt(timing, verse.text_uthmani, timing.start) : "Quran text loads here for comparison"}
                              </p>
                              {verse?.translation && (
                                <p className="truncate text-xs sm:text-[11px] leading-4 text-[var(--muted)]">{verseTextAt(timing, verse.translation, timing.start)}</p>
                              )}
                              <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                                <div className="h-full bg-gold transition-[width] duration-100 ease-linear motion-reduce:transition-none" style={{ width: `${progress}%` }} />
                              </div>
                            </div>
                            <span role="img" aria-label={detected.review.reviewVerseNumbers.includes(timing.verseNumber) ? "Boundary needs review" : "Boundary ready"} className={`h-2 w-2 rounded-full ${
                              detected.review.reviewVerseNumbers.includes(timing.verseNumber)
                                ? "bg-amber-300"
                                : "bg-emerald-soft/70"
                            }`} title={detected.review.reviewVerseNumbers.includes(timing.verseNumber) ? "Boundary needs review" : "Boundary ready"} />
                          </div>
                        );
                      })}
                    </div>
                    {previewError && (
                      <p role="alert" className="mt-2 text-xs sm:text-[10px] leading-4 text-amber-100/85">{previewError}</p>
                    )}
                  </section>
                )}
                {detected.review.reviewVerseNumbers.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs sm:text-[10px] font-medium uppercase tracking-[0.14em] text-amber-100/70">
                      Listen to these transitions in Studio
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {detected.review.reviewVerseNumbers.map((verseNumber) => (
                        <li key={verseNumber} className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1 text-xs sm:text-[10px] text-amber-100/85">
                          Before ayah {verseNumber}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <details className="mt-3 text-xs sm:text-[11px] text-[var(--muted)]">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center text-gold-soft/80 marker:hidden">
                    What recognition heard
                    <span className="ml-1 text-[var(--muted-deep)]">+</span>
                  </summary>
                  <p className="font-arabic pb-1 text-right text-base leading-[1.9] text-[var(--muted)]" dir="rtl" lang="ar">
                    {detected.transcript || "(no speech recognised)"}
                  </p>
                </details>
              </div>
            )}
          </div>

          <div className="mb-3">
            <p className="text-xs font-medium text-parchment">Correct the range</p>
            <p className="mt-0.5 text-xs sm:text-[10px] leading-4 text-[var(--muted)]">
              Use the suggestion above, or enter the passage yourself when recognition is uncertain.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-xs text-[var(--muted)]">Surah</span>
              <select
                value={surahId}
                onChange={(e) => {
                  setSurahId(Number(e.target.value));
                  setFrom("1");
                  setTo("1");
                  clearRecognitionChoice();
                }}
                className="field w-full px-3 py-2.5 text-sm"
              >
                {surahs.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[var(--surface)]">
                    {s.id}. {s.name_simple}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs text-[var(--muted)]">From</span>
              <input
                type="number"
                min={1}
                max={surah?.verses_count ?? 1}
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  clearRecognitionChoice();
                }}
                className="field w-20 px-2 py-2.5 text-center text-sm"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-[var(--muted)]">To</span>
              <input
                type="number"
                min={1}
                max={surah?.verses_count ?? 1}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  clearRecognitionChoice();
                }}
                className="field w-20 px-2 py-2.5 text-center text-sm"
              />
            </label>
          </div>
          <label className={`mt-4 flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
            rangeConfirmed
              ? "border-gold/45 bg-gold/[0.07]"
              : "border-[var(--hairline-soft)] bg-[var(--ink-deep)] hover:border-[var(--hairline)]"
          }`}>
            <input
              type="checkbox"
              checked={rangeConfirmed}
              onChange={(event) => {
                const confirmed = event.target.checked;
                if (confirmed) detectAbortRef.current?.abort();
                setRangeConfirmed(confirmed);
                if (confirmed) {
                  trackProductEvent("range_confirmed", {
                    durationBucket: buffer ? durationBucket(buffer.duration) : undefined,
                  });
                }
              }}
              disabled={!buffer}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--gold)]"
            />
            <span>
              <span className="block text-xs font-medium text-parchment">I confirm this Quran range for Studio</span>
              <span className="mt-0.5 block text-xs sm:text-[11px] leading-4 text-[var(--muted)]">
                Boundaries remain editable in Studio, and uncertain transitions stay marked for review.
              </span>
            </span>
          </label>
          {buildError && (
            <p role="alert" className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs sm:text-[11px] leading-4 text-red-200">
              {buildError}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-3 border-t border-[var(--hairline-soft)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-md text-xs sm:text-[11px] leading-4 text-[var(--muted)]">
              {rangeConfirmed
                ? "Ready. Individual boundaries remain fully adjustable in the timeline."
                : "Listen to the suggestion, check the range, then confirm to continue."}
            </p>
            <button
              onClick={create}
              disabled={!buffer || building || !rangeConfirmed || !surah}
              className="btn-gold min-h-12 shrink-0 rounded-xl px-6 text-sm disabled:opacity-40"
            >
              {building
                ? "Preparing…"
                : videoUrl && videoMode === "keep-video"
                  ? "Open in Studio"
                  : "Choose a template"}
            </button>
          </div>
        </section>
        </div>
      </div>
      {previewUrl && (
        <audio
          ref={previewAudioRef}
          src={previewUrl}
          preload="metadata"
          onTimeUpdate={updateRecognitionPreview}
          onPause={() => setPreviewPlayingKey(null)}
          onEnded={() => {
            setPreviewPlayingKey(null);
            previewStopAtRef.current = null;
          }}
        />
      )}
    </main>
  );
}

function RecognitionProgressPanel({ progress }: { progress: RecognitionProgress }) {
  const activeIndex = RECOGNITION_STAGES.findIndex((stage) => stage.id === progress.stage);
  const hasDownloadProgress = progress.percent !== undefined;
  const modelProgress = progress.loadedBytes !== undefined && progress.totalBytes !== undefined
    ? `${formatModelBytes(progress.loadedBytes)} of ${formatModelBytes(progress.totalBytes)}`
    : null;

  return (
    <div className="border-t border-[var(--hairline-soft)] px-4 py-4" aria-live="polite">
      <ol className="grid grid-cols-4 gap-2" aria-label="Recognition stages">
        {RECOGNITION_STAGES.map((stage, index) => {
          const complete = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={stage.id} aria-current={active ? "step" : undefined}>
              <span className={`block truncate text-xs font-semibold uppercase tracking-[0.12em] sm:text-[10px] ${
                complete
                  ? "text-emerald-soft"
                  : active
                    ? "text-gold-soft"
                    : "text-[var(--muted-deep)]"
              }`}>
                {index + 1}. {stage.label}
              </span>
              <span className={`mt-2 block h-1 rounded-full ${
                complete
                  ? "bg-emerald-soft"
                  : active
                    ? "bg-gold"
                    : "bg-white/[0.08]"
              }`} />
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-lg border border-[var(--hairline-soft)] bg-[var(--surface)] px-3 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-gold motion-reduce:animate-none" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-xs font-medium text-parchment">{progress.detail}</p>
              {hasDownloadProgress && (
                <span className="text-xs sm:text-[11px] tabular-nums text-gold-soft">{progress.percent}%</span>
              )}
            </div>
            {hasDownloadProgress && (
              <div
                role="progressbar"
                aria-label="Recognition model download"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
              >
                <div
                  className="h-full rounded-full bg-gold transition-[width] duration-200 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.max(0, Math.min(100, progress.percent ?? 0))}%` }}
                />
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-[10px] text-[var(--muted-deep)]">
              <span>Private, on-device processing</span>
              {modelProgress && <span className="tabular-nums">{modelProgress}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatModelBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  return `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)} MB`;
}

function PreviewPlayIcon({ playing }: { playing: boolean }) {
  if (playing) {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
        <rect x="3.25" y="2.5" width="3.25" height="11" rx="0.75" />
        <rect x="9.5" y="2.5" width="3.25" height="11" rx="0.75" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M4.25 2.85a.9.9 0 0 1 1.38-.76l7.15 4.66a1.49 1.49 0 0 1 0 2.5l-7.15 4.66a.9.9 0 0 1-1.38-.76V2.85Z" />
    </svg>
  );
}

function VideoChoice({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`flex min-h-24 cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
        checked
          ? "border-[var(--gold)] bg-[rgba(201,162,75,0.07)]"
          : "border-[var(--hairline-soft)] bg-[var(--ink-deep)] hover:border-[var(--hairline)]"
      }`}
    >
      <input
        type="radio"
        name="video-mode"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--gold)]"
      />
      <span>
        <span className="block text-sm font-medium text-parchment">{title}</span>
        <span className="mt-1 block text-xs sm:text-[11px] leading-4 text-[var(--muted)]">{description}</span>
      </span>
    </label>
  );
}
