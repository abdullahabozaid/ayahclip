"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSurahs, fetchVerses } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { getTranslationLanguage } from "@/lib/translations";
import {
  decodeAudioFile,
  resampleTo16kMono,
  autoSegment,
  findSilenceCenters,
  findSpeechSpan,
  type VerseTiming,
} from "@/lib/audio-import";
import {
  assessVerseMatch,
  getVerseWeights,
  loadCorpus,
  selectRecognitionCandidates,
  recoverLeadingVerse,
  type VerseMatch,
} from "@/lib/verse-match";
import { forceAlignVersesDetailed } from "@/lib/forced-align";
import { attachAlignmentDiagnostics } from "@/lib/deep-align";
import {
  alignmentFailureMessage,
  buildAlignmentReview,
  type AlignmentReview,
} from "@/lib/alignment-feedback";
import { Surah } from "@/types";
import {
  leadingRecognitionRetryOffset,
  offsetEmissions,
} from "@/lib/recognition-retry";
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

interface RecognitionResult {
  transcript: string;
  ref: string;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  timings: VerseTiming[];
  method: "transcript" | "ctc" | "hybrid" | "pause";
  confidence: "high" | "medium" | "selected";
  review: AlignmentReview;
}

interface RecognitionCandidate extends Omit<RecognitionResult, "confidence"> {
  key: string;
}

export default function ImportPage() {
  const router = useRouter();
  const store = useAppStore();

  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [sourceAudio, setSourceAudio] = useState<Blob | null>(null); // audio used for the clip (extracted for video)
  const [videoUrl, setVideoUrl] = useState<string | null>(null); // original video, to optionally use as background
  const [videoMode, setVideoMode] = useState<"replace-visuals" | "keep-video">("replace-visuals");
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [decodeMsg, setDecodeMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);

  const [surahId, setSurahId] = useState(1);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("1");
  const [building, setBuilding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const decodeOperationRef = useRef(0);
  const detectAbortRef = useRef<AbortController | null>(null);

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

  const autoDetect = async () => {
    if (!buffer) return;
    const durationError = recognitionDurationError(buffer.duration, browserDeviceMemoryGb());
    if (durationError) {
      setDetectError(durationError);
      return;
    }
    detectAbortRef.current?.abort();
    const controller = new AbortController();
    detectAbortRef.current = controller;
    setDetecting(true);
    setDetectError(null);
    try {
      setDetectProgress({ stage: "prepare", detail: "Loading the Quran verse index" });
      await loadCorpus();
      setDetectProgress({ stage: "prepare", detail: "Preparing audio for local recognition" });
      const audio = await resampleTo16kMono(buffer);
      setDetectProgress({ stage: "listen", detail: "Loading the local recognition model" });
      const { computeEmissions } = await import("@/lib/asr");
      let emissions = await computeEmissions(audio, (loaded, total) => {
        if (total) {
          setDetectProgress({
            stage: "listen",
            detail: "Downloading the local recognition model",
            percent: Math.round((loaded / total) * 100),
            loadedBytes: loaded,
            totalBytes: total,
          });
        } else {
          setDetectProgress({ stage: "listen", detail: "Listening to the recitation locally" });
        }
      }, controller.signal);
      if (controller.signal.aborted) {
        const abortError = new Error("Recognition cancelled");
        abortError.name = "AbortError";
        throw abortError;
      }
      let transcript = emissions.transcription.text;
      setDetectProgress({ stage: "match", detail: "Matching the transcript to the Quran" });
      let assessment = assessVerseMatch(transcript);
      const retryOffset = assessment.confidence === "low"
        ? leadingRecognitionRetryOffset(emissions.transcription, audio.length / 16_000)
        : null;
      if (retryOffset !== null) {
        setDetectProgress({
          stage: "listen",
          detail: "Retrying after a non-recitation introduction",
        });
        const retrySamples = Math.round(retryOffset * 16_000);
        const retryEmissions = offsetEmissions(
          await computeEmissions(audio.subarray(retrySamples), undefined, controller.signal),
          retryOffset,
        );
        setDetectProgress({
          stage: "match",
          detail: "Matching the retried transcript to the Quran",
        });
        const retryAssessment = assessVerseMatch(retryEmissions.transcription.text);
        const currentScore = assessment.match?.score ?? 0;
        const retryScore = retryAssessment.match?.score ?? 0;
        const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
        if (
          confidenceRank[retryAssessment.confidence] > confidenceRank[assessment.confidence] ||
          (retryAssessment.confidence === assessment.confidence && retryScore > currentScore)
        ) {
          emissions = retryEmissions;
          transcript = retryEmissions.transcription.text;
          assessment = retryAssessment;
        }
      }
      const initialMatch = assessment.match;
      const speechSpan = findSpeechSpan(buffer);
      const recovery = initialMatch
        ? recoverLeadingVerse(
          initialMatch,
          emissions.transcription.charTimes[0],
          speechSpan.start
        )
        : null;
      const m = recovery?.match ?? null;
      // Recovery is an inference, so a high match is downgraded to medium. It
      // must never promote an already ambiguous low-confidence transcript.
      const effectiveConfidence = recovery?.recovered && assessment.confidence === "high"
        ? "medium"
        : assessment.confidence;
      const buildRecognitionResult = (
        match: VerseMatch,
      ): Omit<RecognitionResult, "confidence"> => {
        const matchedSurah = surahs.find((item) => item.id === match.surah);
        const verseNumbers = Array.from(
          { length: match.ayahEnd - match.ayahStart + 1 },
          (_, index) => match.ayahStart + index,
        );
        const alignment = forceAlignVersesDetailed({
          emissions,
          surah: match.surah,
          verseNumbers,
          audioDuration: buffer.duration,
          audioStart: speechSpan.start,
          silences: findSilenceCenters(buffer),
        });
        const rawTimings = alignment?.timings ?? autoSegment(
          buffer,
          verseNumbers,
          getVerseWeights(match.surah, match.ayahStart, match.ayahEnd),
        );
        const method = alignment?.method ?? "pause";
        const boundaryDiagnostics = alignment?.boundaryDiagnostics ?? verseNumbers.map(
          (verseNumber) => ({
            verseNumber,
            agreementSeconds: null,
            confidence: "low" as const,
          }),
        );
        return {
          transcript,
          ref: `${matchedSurah?.name_simple ?? `Surah ${match.surah}`} · ${match.ayahStart}${match.ayahEnd !== match.ayahStart ? `–${match.ayahEnd}` : ""}`,
          surah: match.surah,
          ayahStart: match.ayahStart,
          ayahEnd: match.ayahEnd,
          timings: attachAlignmentDiagnostics(rawTimings, method, boundaryDiagnostics),
          method,
          review: buildAlignmentReview(method, boundaryDiagnostics),
        };
      };
      if (m && effectiveConfidence !== "low") {
        setDetectProgress({ stage: "align", detail: "Aligning each ayah boundary" });
        const result = buildRecognitionResult(m);
        setSurahId(m.surah);
        setFrom(String(m.ayahStart));
        setTo(String(m.ayahEnd));
        setRecognitionCandidates([]);
        setRangeConfirmed(false);
        setDetected({
          ...result,
          confidence: effectiveConfidence,
        });
      } else if (m) {
        const uniqueMatches = selectRecognitionCandidates(m, assessment.alternatives);
        setDetectProgress({ stage: "align", detail: "Preparing likely Quran ranges" });
        setRecognitionCandidates(uniqueMatches.map((match) => ({
          ...buildRecognitionResult(match),
          key: `${match.surah}:${match.ayahStart}-${match.ayahEnd}`,
        })));
        setDetected(null);
        setRangeConfirmed(false);
        setDetectError(
          "This recitation matches several similar Quran passages. Choose the range that sounds right, or enter it manually."
        );
      } else {
        setDetectError(detected
          ? "Couldn't confidently match this run. Your previous Quran range is still available below."
          : "Couldn't confidently match this clip. Pick the verses manually below.");
      }
    } catch (error) {
      setDetectError(`${alignmentFailureMessage(error)} ${detected
        ? "Your previous Quran range is still available below."
        : "You can still pick the verses manually below."}`);
    } finally {
      if (detectAbortRef.current === controller) {
        detectAbortRef.current = null;
        setDetecting(false);
        setDetectProgress(null);
      }
    }
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
    fetchSurahs().then(setSurahs);
  }, []);

  useEffect(() => () => detectAbortRef.current?.abort(), []);

  const surah = surahs.find((s) => s.id === surahId);

  const handleFile = async (f: File | undefined) => {
    if (!f) return;
    detectAbortRef.current?.abort();
    const sizeError = importSizeError(f.size);
    if (sizeError) {
      setError(sizeError);
      return;
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
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const isVideo = f.type.startsWith("video/");
    setVideoUrl(isVideo ? URL.createObjectURL(f) : null);
    setVideoMode("replace-visuals");
    setDecoding(true);
    try {
      let audioBlob: Blob = f;
      // Video → extract the audio track with ffmpeg.wasm so any container works.
      if (isVideo) {
        setDecodeMsg("Extracting audio from video (first time loads ffmpeg)…");
        const { extractAudioFromVideo } = await import("@/lib/video-audio");
        audioBlob = await extractAudioFromVideo(f);
        if (decodeOperationRef.current !== operation) return;
      }
      setDecodeMsg("Reading audio…");
      const buf = await decodeAudioFile(audioBlob);
      if (decodeOperationRef.current !== operation) return;
      setSourceAudio(audioBlob);
      setBuffer(buf);
    } catch {
      if (decodeOperationRef.current !== operation) return;
      setError(
        "Couldn't read the audio from this file. Try an MP3/M4A/WAV, or a different video."
      );
    } finally {
      if (decodeOperationRef.current === operation) {
        setDecoding(false);
        setDecodeMsg(null);
      }
    }
  };

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
    const lang = getTranslationLanguage(store.translationLanguage);
    const verses = await fetchVerses(surah.id, lang.resourceId);

    // Cut the clip into per-verse blocks on the recitation's real pauses (text
    // length only decides which pause belongs to which verse). The studio's
    // Studio's "Align by recitation" can later refine this with word onsets for run-on clips.
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
    const url = URL.createObjectURL(sourceAudio);

    store.beginNewProject();
    store.setSurah(surah);
    store.setVerses(verses);
    store.setSelectedVerseNumbers(verseNumbers);
    store.setCurrentVerseIndex(0);
    store.setImportedAudio(url, file?.name ?? "Imported audio", timings);
    // Use the uploaded video itself as the clip background, if requested — shown
    // whole (contain) so it isn't cropped/zoomed to fill the 9:16 frame.
    if (videoUrl && videoMode === "keep-video") {
      store.setBackground({ type: "video", value: videoUrl, label: file?.name ?? "Uploaded video" });
      store.setBackgroundFit("contain");
      store.setBackgroundVideoSync(true); // lip-sync the video to the recitation
    }
    if (videoUrl && videoMode === "replace-visuals") {
      URL.revokeObjectURL(videoUrl);
    }
    router.push(videoUrl && videoMode === "keep-video" ? "/studio" : "/styles?from=import");
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, "0")}`;
  const recognitionBlock = buffer
    ? recognitionDurationError(buffer.duration, browserDeviceMemoryGb())
    : null;
  const recognitionWarning = buffer && !recognitionBlock
    ? recognitionDurationWarning(buffer.duration)
    : null;

  return (
    <main className="bg-mihrab min-h-[calc(100dvh-65px)]">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <p className="mb-2 text-sm uppercase tracking-[0.25em] text-gold-soft/70">
          Import recitation
        </p>
        <h1 className="font-display text-4xl tracking-wide text-parchment sm:text-5xl">
          Turn a recitation into a vertical clip
        </h1>
        <p className="mt-3 max-w-xl leading-relaxed text-[var(--muted)]">
          Upload audio or a video you have permission to use. AyahClip detects the verses,
          builds an editable timeline, and keeps the media on your device.
        </p>
        <ol className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[var(--hairline-soft)] bg-[var(--hairline-soft)] text-[11px] text-[var(--muted)]">
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

        {/* Step 1 — upload */}
        <div className="panel mt-8 p-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-gold-soft/80">
            1 · Upload audio or video
          </p>
          {/* Defensive uploader: explicit ref + button.click() — iOS WebKit
              has historically refused to open the picker for label-wrapped
              hidden file inputs. The button is the user-gesture target;
              programmatic input.click() is guaranteed to work inside it. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*,.mov,.m4v"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={openFilePicker}
            className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--hairline)] p-8 text-center transition-colors hover:border-gold focus-visible:border-gold"
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
          <div className="mt-3 flex items-start justify-between gap-4 text-[11px] leading-4 text-[var(--muted-deep)]">
            <p>
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
            <p className={`mt-3 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
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
              <p className="mt-3 text-[11px] leading-4 text-[var(--muted-deep)]">
                Using your own YouTube upload? Download it from{" "}
                <a href="https://support.google.com/youtube/answer/56100" target="_blank" rel="noopener noreferrer" className="text-gold-soft underline-offset-2 hover:underline">
                  YouTube Studio or Google Takeout
                </a>
                , then upload the permitted file here. AyahClip does not download other people&apos;s videos.
              </p>
            </fieldset>
          )}
        </div>

        {/* Step 2 — verses */}
        <div className={`panel mt-4 p-6 transition-opacity ${buffer ? "" : "pointer-events-none opacity-40"}`}>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-gold-soft/80">
            2 · Which verses are recited?
          </p>

          <div className="mb-5 overflow-hidden rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)]">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-parchment">Recognise and align locally</p>
                <p className="mt-0.5 text-[11px] leading-4 text-[var(--muted)]">
                  Finds the Quran range, then places editable ayah boundaries. Audio never leaves this browser.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={autoDetect}
                  disabled={detecting || !buffer || !!recognitionBlock}
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
                    className="min-h-11 rounded-full border border-[var(--hairline)] px-3 text-[11px] text-[var(--muted)] hover:border-gold hover:text-parchment"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {detectProgress && <RecognitionProgressPanel progress={detectProgress} />}

            {detectError && (
              <div role="alert" className="border-t border-amber-400/20 bg-amber-400/[0.08] px-4 py-3 text-[11px] leading-relaxed text-amber-100/90">
                <span className="font-medium text-amber-100">Recognition needs your help.</span>{" "}
                {detectError}
              </div>
            )}

            {recognitionCandidates.length > 0 && (
              <div className="border-t border-[var(--hairline-soft)] px-4 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100/70">
                  Possible Quran ranges
                </p>
                <p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">
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
                        <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Suggested Quran range
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <p className="font-display text-xl text-parchment">{detected.ref}</p>
                  <span aria-label="Quran range confidence" className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                    Range: {detected.confidence === "selected" ? "creator selected" : `${detected.confidence} confidence`}
                  </span>
                  <span aria-label="Ayah cut method" className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                    Cuts: {detected.review.methodLabel}
                  </span>
                </div>
                <p className={`mt-3 rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed ${
                  detected.review.reviewVerseNumbers.length
                    ? "border-amber-400/25 bg-amber-400/10 text-amber-100/85"
                    : "border-emerald-soft/20 bg-emerald-soft/10 text-emerald-soft"
                }`}>
                  {detected.review.message} Confirm the Quran range below before continuing.
                </p>
                {detected.review.reviewVerseNumbers.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-100/70">
                      Listen to these transitions in Studio
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {detected.review.reviewVerseNumbers.map((verseNumber) => (
                        <li key={verseNumber} className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1 text-[10px] text-amber-100/85">
                          Before ayah {verseNumber}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <details className="mt-3 text-[11px] text-[var(--muted)]">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center text-gold-soft/80 marker:hidden">
                    What recognition heard
                    <span className="ml-1 text-[var(--muted-deep)]">+</span>
                  </summary>
                  <p className="font-arabic pb-1 text-right text-base leading-[1.9] text-[var(--muted)]" dir="rtl">
                    {detected.transcript || "(no speech recognised)"}
                  </p>
                </details>
              </div>
            )}
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
              onChange={(event) => setRangeConfirmed(event.target.checked)}
              disabled={!buffer}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--gold)]"
            />
            <span>
              <span className="block text-xs font-medium text-parchment">I confirm this Quran range</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-[var(--muted)]">
                Boundaries remain editable in Studio, and uncertain transitions stay marked for review.
              </span>
            </span>
          </label>
        </div>

        <button
          onClick={create}
          disabled={!buffer || building || !rangeConfirmed}
          className="btn-gold mt-6 w-full rounded-xl py-3.5 text-sm disabled:opacity-40"
        >
          {building
            ? "Preparing…"
            : videoUrl && videoMode === "keep-video"
              ? "Open in Studio"
              : "Choose a template"}
        </button>
      </div>
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
              <span className={`block truncate text-[9px] font-semibold uppercase tracking-[0.12em] sm:text-[10px] ${
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
                <span className="text-[11px] tabular-nums text-gold-soft">{progress.percent}%</span>
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
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--muted-deep)]">
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
        <span className="mt-1 block text-[11px] leading-4 text-[var(--muted)]">{description}</span>
      </span>
    </label>
  );
}
