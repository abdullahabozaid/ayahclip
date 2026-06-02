"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSurahs, fetchVerses } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { getTranslationLanguage } from "@/lib/translations";
import {
  decodeAudioFile,
  resampleTo16kMono,
  autoSegment,
} from "@/lib/audio-import";
import { loadCorpus, matchVerses, getVerseWeights } from "@/lib/verse-match";
import { Surah } from "@/types";

export default function ImportPage() {
  const router = useRouter();
  const store = useAppStore();

  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [sourceAudio, setSourceAudio] = useState<Blob | null>(null); // audio used for the clip (extracted for video)
  const [videoUrl, setVideoUrl] = useState<string | null>(null); // original video, to optionally use as background
  const [useVideoBg, setUseVideoBg] = useState(true);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [decodeMsg, setDecodeMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [surahId, setSurahId] = useState(1);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("1");
  const [building, setBuilding] = useState(false);

  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [detected, setDetected] = useState<{ transcript: string; ref: string } | null>(null);
  const [wordStarts, setWordStarts] = useState<number[] | null>(null);

  const autoDetect = async () => {
    if (!buffer) return;
    setDetecting(true);
    setDetected(null);
    setError(null);
    try {
      setDetectMsg("Loading verse index…");
      await loadCorpus();
      setDetectMsg("Preparing audio…");
      const audio = await resampleTo16kMono(buffer);
      setDetectMsg("Loading recognition model (first time ~131 MB)…");
      const { transcribe } = await import("@/lib/asr");
      const result = await transcribe(audio, (loaded, total) => {
        if (total) setDetectMsg(`Downloading model… ${Math.round((loaded / total) * 100)}%`);
        else setDetectMsg("Recognising…");
      });
      const transcript = result.text;
      setWordStarts(result.wordStarts.length ? result.wordStarts : null);
      setDetectMsg("Matching to the Quran…");
      const m = matchVerses(transcript);
      if (m) {
        const s = surahs.find((x) => x.id === m.surah);
        setSurahId(m.surah);
        setFrom(String(m.ayahStart));
        setTo(String(m.ayahEnd));
        setDetected({
          transcript,
          ref: `${s?.name_simple ?? `Surah ${m.surah}`} · ${m.ayahStart}${m.ayahEnd !== m.ayahStart ? `–${m.ayahEnd}` : ""}`,
        });
      } else {
        setError("Couldn't confidently match this clip. Pick the verses manually below.");
      }
    } catch {
      setError("Auto-detect failed. You can still pick the verses manually below.");
    } finally {
      setDetecting(false);
      setDetectMsg(null);
    }
  };

  useEffect(() => {
    fetchSurahs().then(setSurahs);
  }, []);

  const surah = surahs.find((s) => s.id === surahId);

  const handleFile = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setBuffer(null);
    setSourceAudio(null);
    setError(null);
    setDetected(null);
    setWordStarts(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const isVideo = f.type.startsWith("video/");
    setVideoUrl(isVideo ? URL.createObjectURL(f) : null);
    setUseVideoBg(true);
    setDecoding(true);
    try {
      let audioBlob: Blob = f;
      // Video → extract the audio track with ffmpeg.wasm so any container works.
      if (isVideo) {
        setDecodeMsg("Extracting audio from video (first time loads ffmpeg)…");
        const { extractAudioFromVideo } = await import("@/lib/video-audio");
        audioBlob = await extractAudioFromVideo(f);
      }
      setDecodeMsg("Reading audio…");
      const buf = await decodeAudioFile(audioBlob);
      setSourceAudio(audioBlob);
      setBuffer(buf);
    } catch {
      setError(
        "Couldn't read the audio from this file. Try an MP3/M4A/WAV, or a different video."
      );
    } finally {
      setDecoding(false);
      setDecodeMsg(null);
    }
  };

  const create = async () => {
    if (!buffer || !sourceAudio || !surah) return;
    const lo = Math.max(1, Math.min(surah.verses_count, parseInt(from) || 1));
    const hi = Math.max(lo, Math.min(surah.verses_count, parseInt(to) || lo));
    const verseNumbers = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

    setBuilding(true);
    const lang = getTranslationLanguage(store.translationLanguage);
    const verses = await fetchVerses(surah.id, lang.resourceId);

    // Cut the clip into per-verse blocks on the recitation's real pauses (text
    // length only decides which pause belongs to which verse). The studio's
    // "Deep align" can later refine this with ASR word onsets for run-on clips.
    await loadCorpus();
    const weights = getVerseWeights(surah.id, lo, hi);
    const timings = autoSegment(buffer, verseNumbers, weights);
    const url = URL.createObjectURL(sourceAudio);

    store.setSurah(surah);
    store.setVerses(verses);
    store.setSelectedVerseNumbers(verseNumbers);
    store.setCurrentVerseIndex(0);
    store.setImportedAudio(url, file?.name ?? "Imported audio", timings);
    // Use the uploaded video itself as the clip background, if requested — shown
    // whole (contain) so it isn't cropped/zoomed to fill the 9:16 frame.
    if (videoUrl && useVideoBg) {
      store.setBackground({ type: "video", value: videoUrl, label: file?.name ?? "Uploaded video" });
      store.setBackgroundFit("contain");
      store.setBackgroundVideoSync(true); // lip-sync the video to the recitation
    }
    router.push("/studio");
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, "0")}`;

  return (
    <main className="bg-mihrab min-h-[calc(100dvh-65px)]">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <p className="mb-2 text-sm uppercase tracking-[0.25em] text-gold-soft/70">
          Import recitation
        </p>
        <h1 className="font-display text-4xl tracking-wide text-parchment">
          Use your own audio
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Clip a recitation from YouTube (or anywhere), upload the file, tell us which
          verses it covers, and we&apos;ll line it up — then style and export it like any clip.
        </p>

        {/* Step 1 — upload */}
        <div className="panel mt-8 p-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-gold-soft/80">
            1 · Upload audio or video
          </p>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--hairline)] p-8 text-center transition-colors hover:border-gold">
            <span className="text-2xl text-gold-soft/70">↑</span>
            <span className="text-sm text-parchment">
              {file ? file.name : "Click to choose an MP3, M4A, WAV or MP4"}
            </span>
            <span className="text-xs text-[var(--muted-deep)]">
              {decoding
                ? decodeMsg ?? "Reading audio…"
                : buffer
                  ? `Loaded · ${fmt(buffer.duration)}`
                  : "Audio/video is processed on your device — nothing is uploaded to a server"}
            </span>
            <input
              type="file"
              accept="audio/*,video/mp4,video/webm"
              onChange={(e) => handleFile(e.target.files?.[0])}
              // `sr-only` (not `hidden`) so iOS Safari/Chrome still opens the
              // picker when the wrapping label is tapped — display:none inputs
              // are detached from the layout on WebKit and silently refuse.
              className="sr-only"
            />
          </label>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

          {/* Use the uploaded video as the clip background */}
          {videoUrl && (
            <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-parchment">
                <span className="text-gold-soft">🎬</span>
                Use this video as the background
              </span>
              <input
                type="checkbox"
                checked={useVideoBg}
                onChange={(e) => setUseVideoBg(e.target.checked)}
                className="h-4 w-4 accent-[var(--gold)]"
              />
            </label>
          )}
        </div>

        {/* Step 2 — verses */}
        <div className={`panel mt-4 p-6 transition-opacity ${buffer ? "" : "pointer-events-none opacity-40"}`}>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-gold-soft/80">
            2 · Which verses are recited?
          </p>

          <div className="mb-4 rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-parchment">Let the app detect it</p>
              <button
                onClick={autoDetect}
                disabled={detecting || !buffer}
                className="btn-gold rounded-full px-4 py-2 text-xs disabled:opacity-50"
              >
                {detecting ? "Detecting…" : "✨ Auto-detect verses"}
              </button>
            </div>
            {detectMsg && <p className="mt-2 text-xs text-[var(--muted)]">{detectMsg}</p>}
            {detected && (
              <div className="mt-2">
                <p className="text-sm text-gold-soft">Detected: {detected.ref}</p>
                <p className="mt-1 font-arabic text-right text-base text-[var(--muted)]" dir="rtl">
                  {detected.transcript || "(no speech recognised)"}
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted-deep)]">
                  Check it below and adjust if needed — recognition isn&apos;t perfect.
                </p>
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
                onChange={(e) => setFrom(e.target.value)}
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
                onChange={(e) => setTo(e.target.value)}
                className="field w-20 px-2 py-2.5 text-center text-sm"
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-[var(--muted-deep)]">
            We&apos;ll split the audio into one segment per verse by detecting the pauses. You
            can fine-tune the boundaries in the studio.
          </p>
        </div>

        <button
          onClick={create}
          disabled={!buffer || building}
          className="btn-gold mt-6 w-full rounded-xl py-3.5 text-sm disabled:opacity-40"
        >
          {building ? "Preparing…" : "Open in studio"}
        </button>
      </div>
    </main>
  );
}
