"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSurahs, fetchVerses } from "@/lib/api";
import { applyTemplate } from "@/lib/apply-template";
import {
  BULK_CLIP_COUNTS,
  buildVerseCompleteCandidates,
  type BulkClipCandidate,
  type BulkClipCount,
} from "@/lib/bulk-clips";
import { BULK_AYAH_REFERENCES, BULK_HADITHS } from "@/lib/bulk-inspiration";
import {
  recognizeQuranInWindows,
  type BulkRecognitionProgress,
} from "@/lib/bulk-recognition";
import { decodeAudioFile } from "@/lib/audio-import";
import { importSizeError } from "@/lib/import-limits";
import { isSupportedVideoFile } from "@/lib/media-file";
import { useAppStore } from "@/lib/store";
import { TEMPLATES } from "@/lib/templates";
import type { Surah, Verse } from "@/types";
import {
  bulkYoutubeRangeError,
  parseTimecode,
  sourcePlatform,
} from "@/lib/source-link";

type WorkspaceStage = "source" | "analysing" | "results";
type VerseLookup = Record<string, Verse>;

const FEATURED_TEMPLATES = TEMPLATES.filter((template) => template.featured).slice(0, 5);
const STAGE_ORDER = { prepare: 0.1, listen: 0.35, match: 0.72, align: 0.9 } as const;
const fmt = (seconds: number) => {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
};

export function BulkCreateWorkspace() {
  const router = useRouter();
  const store = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewEndRef = useRef<number | null>(null);

  const [stage, setStage] = useState<WorkspaceStage>("source");
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
  const [error, setError] = useState<string | null>(null);
  const [requestedCount, setRequestedCount] = useState<BulkClipCount>(20);
  const [templateId, setTemplateId] = useState(FEATURED_TEMPLATES[0]?.id ?? "clean-ink");
  const [progress, setProgress] = useState<BulkRecognitionProgress | null>(null);
  const [candidates, setCandidates] = useState<BulkClipCandidate[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [verseLookup, setVerseLookup] = useState<VerseLookup>({});
  const [inspirationIndex, setInspirationIndex] = useState(0);
  const [inspirationVerses, setInspirationVerses] = useState<VerseLookup>({});
  const [activePreview, setActivePreview] = useState<string | null>(null);

  useEffect(() => {
    void fetchSurahs().then(setSurahs).catch(() => setError("The Quran index could not be loaded. Check your connection and reload."));
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

  useEffect(() => {
    if (stage !== "analysing" || inspiration.length < 2) return;
    const timer = window.setInterval(() => {
      setInspirationIndex((value) => (value + 1) % inspiration.length);
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [inspiration.length, stage]);

  const handleFile = async (file: File) => {
    const sizeProblem = importSizeError(file.size);
    if (sizeProblem) return setError(sizeProblem);
    setDecoding(true);
    setError(null);
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
      if (decoded.duration > 30 * 60 + 1) {
        throw new RangeError("Bulk Create currently supports up to 30 minutes. Trim or select a 30-minute section first.");
      }
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      setSourceFile(file);
      setAudioBlob(resolvedAudio);
      setBuffer(decoded);
      setSourceUrl(URL.createObjectURL(file));
    } catch (reason) {
      setSourceFile(null);
      setAudioBlob(null);
      setBuffer(null);
      setError(reason instanceof Error ? reason.message : "This media could not be read.");
    } finally {
      setDecoding(false);
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
    try {
      const response = await fetch("/api/social-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: link,
          startSeconds,
          endSeconds,
          attestedRights: true,
          bulk: true,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "The source could not be imported.");
      }
      const blob = await response.blob();
      await handleFile(new File([blob], `bulk-source-${Date.now()}.mp4`, { type: "video/mp4" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The source could not be imported.");
    } finally {
      setLinkLoading(false);
    }
  };

  const analyse = async () => {
    if (!buffer || !audioBlob || !sourceFile || surahs.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStage("analysing");
    setError(null);
    setProgress(null);
    try {
      const result = await recognizeQuranInWindows({
        buffer,
        surahs,
        signal: controller.signal,
        onProgress: setProgress,
      });
      const generated = buildVerseCompleteCandidates({
        ayahs: result.ayahs,
        requestedCount,
        templateId,
      });
      const surahIds = [...new Set(generated.map((candidate) => candidate.surah))];
      const groups = await Promise.all(surahIds.map((surah) => fetchVerses(surah)));
      setVerseLookup(Object.fromEntries(groups.flat().map((verse) => [verse.verse_key, verse])));
      setCandidates(generated);
      setUnresolvedCount(result.unresolvedWindows.length);
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

  const applyTemplateToAll = (nextTemplateId: string) => {
    setTemplateId(nextTemplateId);
    setCandidates((items) => items.map((candidate) => ({ ...candidate, templateId: nextTemplateId })));
  };

  const openCandidate = async (candidate: BulkClipCandidate) => {
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
    if (isSupportedVideoFile(sourceFile) && sourceUrl) {
      store.setBackground({ type: "video", value: sourceUrl, label: sourceFile.name });
      store.setBackgroundFit("cover");
      store.setBackgroundVideoSync(true);
    }
    const template = TEMPLATES.find((item) => item.id === candidate.templateId);
    if (template) applyTemplate(template);
    router.push("/studio");
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

        {stage === "source" && (
          <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="panel p-5 sm:p-7" aria-labelledby="bulk-source-heading">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold-soft/70">1 · Source</p>
                  <h2 id="bulk-source-heading" className="mt-2 text-xl font-medium text-parchment">Add up to 30 minutes</h2>
                </div>
                {buffer && <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">{fmt(buffer.duration)} ready</span>}
              </div>

              <input ref={fileInputRef} type="file" accept="audio/*,video/*,.mov,.m4a" aria-label="Bulk source file" className="sr-only" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
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
                <button type="button" onClick={() => void importLink()} disabled={linkLoading} className="btn-ghost min-h-11 rounded-xl px-4 text-sm disabled:opacity-50">{linkLoading ? "Importing…" : "Import"}</button>
              </div>
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
              <label className="mt-6 block text-sm font-medium text-parchment" htmlFor="bulk-template">Text and layout preset</label>
              <select id="bulk-template" value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="field mt-3 min-h-11 w-full px-3 text-sm">
                {FEATURED_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <button type="button" onClick={() => void analyse()} disabled={!buffer || decoding || linkLoading || surahs.length === 0} className="btn-gold mt-7 min-h-12 w-full rounded-xl px-5 text-sm disabled:cursor-not-allowed disabled:opacity-45">Create verse-complete drafts</button>
              <p className="mt-3 text-center text-xs text-[var(--muted)]">A 30-minute source may take 5–8 minutes. Keep this tab open during beta.</p>
            </aside>
          </div>
        )}

        {stage === "analysing" && (
          <AnalysisView progress={progress} overallProgress={overallProgress} inspiration={inspiration[inspirationIndex]} onCancel={() => abortRef.current?.abort()} />
        )}

        {stage === "results" && (
          <section className="mt-9">
            <div className="flex flex-col gap-5 border-b border-[var(--hairline-soft)] pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold-soft/70">Review</p>
                <h2 className="mt-2 text-2xl font-medium text-parchment">{candidates.length} verse-complete drafts</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">{unresolvedCount ? `${unresolvedCount} source window${unresolvedCount === 1 ? "" : "s"} need manual review and were not turned into clips.` : "The analysed source is fully covered by confident windows."}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={templateId} onChange={(event) => applyTemplateToAll(event.target.value)} className="field min-h-11 px-3 text-sm" aria-label="Apply preset to all clips">
                  {FEATURED_TEMPLATES.map((template) => <option key={template.id} value={template.id}>All · {template.name}</option>)}
                </select>
                <button type="button" onClick={() => setStage("source")} className="btn-ghost min-h-11 rounded-xl px-4 text-sm">New batch</button>
              </div>
            </div>

            {sourceUrl && <video ref={previewRef} src={sourceUrl} className="sr-only" playsInline onTimeUpdate={(event) => {
              if (previewEndRef.current !== null && event.currentTarget.currentTime >= previewEndRef.current) {
                event.currentTarget.pause();
                setActivePreview(null);
              }
            }} />}

            {candidates.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
                <h3 className="text-lg font-medium text-parchment">No trustworthy clip ranges yet</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">The source may include speech, noise, or recitation spanning ambiguous windows. No Quran range was guessed.</p>
                <button type="button" onClick={() => setStage("source")} className="btn-gold mt-5 min-h-11 rounded-xl px-5 text-sm">Try another section</button>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {candidates.map((candidate) => {
                  const firstVerse = verseLookup[`${candidate.surah}:${candidate.ayahStart}`];
                  const surah = surahs.find((item) => item.id === candidate.surah);
                  const template = TEMPLATES.find((item) => item.id === candidate.templateId);
                  return (
                    <article key={candidate.id} className="panel overflow-hidden">
                      <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline-soft)] px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-parchment">{surah?.name_simple ?? `Surah ${candidate.surah}`} · {candidate.ayahStart}{candidate.ayahEnd === candidate.ayahStart ? "" : `–${candidate.ayahEnd}`}</p>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">{fmt(candidate.start)}–{fmt(candidate.end)} · {fmt(candidate.duration)}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${candidate.confidence === "high" ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-100"}`}>{candidate.confidence}</span>
                      </div>
                      <div className="px-4 py-4">
                        <p dir="rtl" lang="ar" className="font-arabic line-clamp-2 text-right text-xl font-normal leading-9 text-parchment">{firstVerse?.text_uthmani ?? "Quran text loading"}</p>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{firstVerse?.translation ?? "Translation loading"}</p>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-7 w-7 shrink-0 rounded-lg border border-white/10" style={{ background: template?.swatch }} />
                            <span className="truncate text-xs text-[var(--muted)]">{template?.name}</span>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => void togglePreview(candidate)} className="btn-ghost min-h-10 rounded-xl px-3 text-xs">{activePreview === candidate.id ? "Pause" : "Listen"}</button>
                            <button type="button" onClick={() => void openCandidate(candidate)} className="btn-gold min-h-10 rounded-xl px-4 text-xs">Open in Studio</button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function AnalysisView({ progress, overallProgress, inspiration, onCancel }: {
  progress: BulkRecognitionProgress | null;
  overallProgress: number;
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
      <p className="mt-7 text-xs font-medium uppercase tracking-[0.2em] text-gold-soft/70">Analysing window {progress?.window ?? 1} of {progress?.windowCount ?? "…"}</p>
      <h2 className="mt-3 text-2xl font-medium text-parchment">{progress?.recognition.detail ?? "Preparing the Quran recognition model"}</h2>
      <div className="mx-auto mt-6 h-1.5 max-w-xl overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${Math.max(2, overallProgress)}%` }} />
      </div>
      <p className="mt-2 text-xs tabular-nums text-[var(--muted)]">{overallProgress}% · cuts are placed only after complete ayahs</p>

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
