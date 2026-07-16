"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  decodeAudioFile,
  autoSegment,
  resampleTo16kMono,
  snapToSentenceBoundary,
  findSilenceCenters,
  type VerseTiming,
} from "@/lib/audio-import";
import { loadCorpus, getVerseWeights } from "@/lib/verse-match";
import { forceAlignVerses } from "@/lib/forced-align";
import { importedPlayer } from "@/lib/imported-player";
import { sanitizeArabic } from "@/lib/canvas-utils";
import { QcfVerse } from "./QcfVerse";
import type { QcfWord } from "@/types";

const MIN_DUR = 0.12;
const HISTORY_MAX = 50;

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, "0")}`;
}

function cloneTimings(timings: readonly VerseTiming[]): VerseTiming[] {
  return timings.map((t) => ({
    ...t,
    splits: t.splits ? [...t.splits] : undefined,
    splitWords: t.splitWords ? [...t.splitWords] : undefined,
  }));
}

/**
 * Verse Card Editor — a vertical stack of verses for uploaded clips. Each verse
 * can be divided into PARTS by word: splitting after word N keeps every word but
 * shows words 1..N as "part 1" and the rest as "part 2" (stacked below), and you
 * can split a part again into part 3, and so on. Parts never remove any words —
 * the whole verse is always present, just shown in sequence. A whole verse card
 * can be deleted from the clip (for a mis-detected or duplicate segment), but
 * splitting never drops words.
 */
export function VerseCardEditor() {
  const store = useAppStore();
  const imported =
    store.audioSource.mode === "imported" ? store.audioSource : null;
  const url = imported?.url ?? null;
  const timings = imported?.timings ?? [];

  // ---- Buffer / duration ----------------------------------------------------
  const bufferRef = useRef<AudioBuffer | null>(null);
  const [duration, setDuration] = useState(0);
  const [bufferLoading, setBufferLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setBufferLoading(true);
    (async () => {
      try {
        const blob = await (await fetch(url)).blob();
        const buf = await decodeAudioFile(blob);
        if (cancelled) return;
        bufferRef.current = buf;
        setDuration(buf.duration);
      } catch {
        if (!cancelled) setDuration(0);
      } finally {
        if (!cancelled) setBufferLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // ---- Playhead tracking ----------------------------------------------------
  const [headTime, setHeadTime] = useState(0);
  const headTimeRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return importedPlayer.subscribe((t, p) => {
      setHeadTime(t);
      headTimeRef.current = t;
      setIsPlaying(p);
    });
  }, []);

  // ---- Undo / redo ----------------------------------------------------------
  const historyRef = useRef<VerseTiming[][]>([]);
  const futureRef = useRef<VerseTiming[][]>([]);
  const [, setHistoryTick] = useState(0);

  const pushHistory = useCallback((snapshot: readonly VerseTiming[]) => {
    historyRef.current.push(cloneTimings(snapshot));
    if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift();
    futureRef.current = [];
    setHistoryTick((n) => (n + 1) & 0xffff);
  }, []);

  const commit = useCallback(
    (next: VerseTiming[], record = true) => {
      if (record) {
        const cur = useAppStore.getState().audioSource;
        if (cur.mode === "imported") pushHistory(cur.timings);
      }
      useAppStore.getState().setVerseTimings(next);
    },
    [pushHistory]
  );

  const undo = useCallback(() => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current.push(cloneTimings(cur.timings));
    if (futureRef.current.length > HISTORY_MAX) futureRef.current.shift();
    useAppStore.getState().setVerseTimings(prev);
    setHistoryTick((n) => (n + 1) & 0xffff);
  }, []);

  const redo = useCallback(() => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(cloneTimings(cur.timings));
    if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift();
    useAppStore.getState().setVerseTimings(next);
    setHistoryTick((n) => (n + 1) & 0xffff);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.code === "Space") {
        const cur = useAppStore.getState().audioSource;
        if (cur.mode !== "imported") return;
        e.preventDefault();
        importedPlayer.toggle(cur.url);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---- Mutations ------------------------------------------------------------
  // Split a verse into parts AFTER an absolute word index. Keeps every word;
  // adds a time boundary so words 1..N show first, then the rest.
  const addWordSplit = useCallback(
    (verseIdx: number, absBoundary: number) => {
      const cur = useAppStore.getState().audioSource;
      if (cur.mode !== "imported") return;
      const state = useAppStore.getState();
      const seg = cur.timings[verseIdx];
      if (!seg) return;
      const verse = state.verses.find((v) => v.verse_number === seg.verseNumber);
      if (!verse) return;
      const total = sanitizeArabic(verse.text_uthmani).split(/\s+/).filter(Boolean).length;
      const dur = seg.end - seg.start;
      if (dur <= 0 || total < 2) return;
      if (absBoundary <= 0 || absBoundary >= total) return;
      const time = seg.start + (absBoundary / total) * dur;
      const existing = seg.splits ?? [];
      const existingWords = seg.splitWords ?? existing.map((s) =>
        Math.round(((s - seg.start) / dur) * total)
      );
      const tol = (dur / total) / 2;
      if (existing.some((s) => Math.abs(s - time) < tol)) return;
      const combined = existing.map((s, j) => ({ t: s, w: existingWords[j] }));
      combined.push({ t: time, w: absBoundary });
      combined.sort((a, b) => a.t - b.t);
      const next = cur.timings.map((x) => ({ ...x }));
      next[verseIdx] = {
        ...next[verseIdx],
        splits: combined.map((c) => c.t),
        splitWords: combined.map((c) => c.w),
        splitWordTotal: total,
      };
      commit(next);
    },
    [commit]
  );

  const removeSplit = useCallback(
    (verseIdx: number, splitIdx: number) => {
      const cur = useAppStore.getState().audioSource;
      if (cur.mode !== "imported") return;
      const next = cur.timings.map((x) => ({ ...x }));
      const target = next[verseIdx];
      if (!target?.splits) return;
      const remaining = target.splits.filter((_, j) => j !== splitIdx);
      const remainingWords = target.splitWords?.filter((_, j) => j !== splitIdx);
      next[verseIdx] = {
        ...target,
        splits: remaining.length ? remaining : undefined,
        splitWords: remainingWords?.length ? remainingWords : undefined,
        splitWordTotal: remaining.length ? target.splitWordTotal : undefined,
      };
      commit(next);
    },
    [commit]
  );

  const duplicateVerse = useCallback(
    (verseIdx: number) => {
      const cur = useAppStore.getState().audioSource;
      if (cur.mode !== "imported") return;
      const dur = duration;
      const source = cur.timings[verseIdx];
      if (!source) return;
      const sourceLen = source.end - source.start;
      if (sourceLen < MIN_DUR * 2) return;
      const nextStart =
        verseIdx + 1 < cur.timings.length ? cur.timings[verseIdx + 1].start : dur;
      const freeAfter = nextStart - source.end;
      let newSource: VerseTiming;
      let copy: VerseTiming;
      if (freeAfter >= MIN_DUR * 2) {
        newSource = source;
        copy = {
          verseNumber: source.verseNumber,
          start: source.end,
          end: Math.min(dur, source.end + Math.min(sourceLen, freeAfter)),
        };
      } else {
        const mid = source.start + sourceLen / 2;
        newSource = { ...source, end: mid, splits: undefined, splitWords: undefined, splitWordTotal: undefined };
        copy = { verseNumber: source.verseNumber, start: mid, end: source.end };
      }
      const next = [
        ...cur.timings.slice(0, verseIdx),
        newSource,
        copy,
        ...cur.timings.slice(verseIdx + 1),
      ];
      commit(next);
      useAppStore.getState().setCurrentVerseIndex(verseIdx + 1);
    },
    [commit, duration]
  );

  // Delete a whole verse card from the clip. This is a structural change that
  // also touches selectedVerseNumbers (in the store action), so we clear the
  // timings-only undo history — a later ⌘Z restoring an old timings snapshot
  // would otherwise reintroduce the verse and desync it from the selection.
  const deleteVerse = useCallback((verseIdx: number) => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported" || cur.timings.length <= 1) return;
    historyRef.current = [];
    futureRef.current = [];
    useAppStore.getState().deleteImportedVerse(verseIdx);
    setHistoryTick((n) => (n + 1) & 0xffff);
  }, []);

  const setBoundary = useCallback(
    (verseIdx: number, kind: "start" | "end") => {
      const cur = useAppStore.getState().audioSource;
      if (cur.mode !== "imported") return;
      const t = headTimeRef.current;
      const next = cur.timings.map((x) => ({ ...x }));
      const seg = next[verseIdx];
      if (!seg) return;
      if (kind === "start") {
        const floor = verseIdx > 0 ? next[verseIdx - 1].start + MIN_DUR : 0;
        const s = Math.min(seg.end - MIN_DUR, Math.max(floor, t));
        if (verseIdx > 0 && s < next[verseIdx - 1].end) next[verseIdx - 1].end = s;
        seg.start = s;
      } else {
        const ceil =
          verseIdx < next.length - 1 ? next[verseIdx + 1].end - MIN_DUR : duration;
        const e = Math.max(seg.start + MIN_DUR, Math.min(ceil, t));
        if (verseIdx < next.length - 1 && e > next[verseIdx + 1].start) next[verseIdx + 1].start = e;
        seg.end = e;
      }
      commit(next);
    },
    [commit, duration]
  );

  const activateVerse = useCallback((verseIdx: number) => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const seg = cur.timings[verseIdx];
    if (!seg) return;
    useAppStore.getState().setCurrentVerseIndex(verseIdx);
    importedPlayer.seek(cur.url, seg.start);
  }, []);

  // Play (loop) a specific time region — used for "play this part".
  const playRegion = useCallback((verseIdx: number, from: number, to: number) => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    useAppStore.getState().setCurrentVerseIndex(verseIdx);
    importedPlayer.setLoop(from, to);
    importedPlayer.seek(cur.url, from);
    importedPlayer.play(cur.url);
  }, []);

  const stopLoop = useCallback(() => {
    importedPlayer.clearLoop();
    importedPlayer.pause();
  }, []);

  const seekTo = useCallback((t: number, verseIdx: number) => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    useAppStore.getState().setCurrentVerseIndex(verseIdx);
    importedPlayer.seek(cur.url, t);
  }, []);

  // ---- Redetect / Deep align ------------------------------------------------
  const [redetecting, setRedetecting] = useState(false);
  const [deepMsg, setDeepMsg] = useState<string | null>(null);
  const [deepErr, setDeepErr] = useState<string | null>(null);

  const redetect = useCallback(async () => {
    const buf = bufferRef.current;
    const cur = useAppStore.getState().audioSource;
    const surahId = useAppStore.getState().surah?.id;
    if (!buf || cur.mode !== "imported" || !surahId) return;
    const verseNumbers = cur.timings.map((t) => t.verseNumber);
    if (verseNumbers.length === 0) return;
    setRedetecting(true);
    try {
      await loadCorpus();
      const weights = getVerseWeights(
        surahId,
        verseNumbers[0],
        verseNumbers[verseNumbers.length - 1]
      );
      commit(autoSegment(buf, verseNumbers, weights));
    } finally {
      setRedetecting(false);
    }
  }, [commit]);

  const deepAlign = useCallback(async () => {
    const buf = bufferRef.current;
    const state = useAppStore.getState();
    const cur = state.audioSource;
    const surahId = state.surah?.id;
    if (!buf || cur.mode !== "imported" || !surahId) return;
    // Forced alignment wants the unique, sorted verse list (one timing per verse).
    const verseNumbers = [...new Set(cur.timings.map((t) => t.verseNumber))].sort(
      (a, b) => a - b
    );
    if (verseNumbers.length === 0) return;
    setDeepErr(null);
    setDeepMsg("Preparing…");
    try {
      await loadCorpus();
      const audio = await resampleTo16kMono(buf);
      const { computeEmissions } = await import("@/lib/asr");
      const emissions = await computeEmissions(audio, (loaded, total) => {
        setDeepMsg(
          total
            ? `Downloading model (one-time, ~131 MB)… ${Math.round((loaded / total) * 100)}%`
            : "Listening…"
        );
      });
      setDeepMsg("Aligning…");
      const lo = verseNumbers[0];
      const hi = verseNumbers[verseNumbers.length - 1];
      const silences = findSilenceCenters(buf);
      const aligned = forceAlignVerses({
        emissions,
        surah: surahId,
        verseNumbers,
        audioDuration: buf.duration,
        silences,
      });
      if (aligned) {
        commit(aligned);
      } else {
        const weights = getVerseWeights(surahId, lo, hi);
        commit(autoSegment(buf, verseNumbers, weights));
        setDeepErr(
          "Couldn't align to the verses — used pause detection instead. Fine-tune by ear."
        );
      }
    } catch {
      setDeepErr(
        "Deep align failed (model couldn't load). Check your connection and retry."
      );
    } finally {
      setDeepMsg(null);
    }
  }, [commit]);

  if (!imported || timings.length === 0) return null;

  const activeIdx = store.currentVerseIndex;
  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Top toolbar: global play, time, undo / redo / detect tools */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => importedPlayer.toggle(url!)}
            className="btn-gold flex h-10 w-10 items-center justify-center rounded-full"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-px" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <span className="font-display text-[13px] tabular-nums text-parchment">
            {fmt(headTime)}{" "}
            <span className="text-[var(--muted-deep)]">of {fmt(duration)}</span>
          </span>
          {bufferLoading && (
            <span className="text-[11px] text-[var(--muted-deep)]">Loading audio…</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--hairline-soft)] text-[14px] text-parchment transition-colors hover:border-gold disabled:opacity-30 disabled:hover:border-[var(--hairline-soft)]"
            title="Undo (⌘Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--hairline-soft)] text-[14px] text-parchment transition-colors hover:border-gold disabled:opacity-30 disabled:hover:border-[var(--hairline-soft)]"
            title="Redo (⌘⇧Z)"
            aria-label="Redo"
          >
            ↷
          </button>
          <span className="h-4 w-px bg-[var(--hairline-soft)]" />
          <button
            onClick={redetect}
            disabled={redetecting || deepMsg != null}
            className="rounded-full border border-[var(--hairline-soft)] px-3 py-1.5 text-[11px] text-parchment transition-colors hover:border-gold disabled:opacity-40"
            title="Rebuild every verse boundary from the recitation's pauses"
          >
            {redetecting ? "Redetecting…" : "↻ Redetect"}
          </button>
          <button
            onClick={deepAlign}
            disabled={redetecting || deepMsg != null}
            className="rounded-full border border-[var(--hairline-soft)] px-3 py-1.5 text-[11px] text-parchment transition-colors hover:border-gold disabled:opacity-40"
            title="Re-run speech recognition to align each verse to its audio"
          >
            {deepMsg ?? "✨ Deep align"}
          </button>
        </div>
      </div>

      {deepErr && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200/90"
        >
          <span className="leading-relaxed">{deepErr}</span>
          <button
            onClick={() => setDeepErr(null)}
            aria-label="Dismiss"
            className="ml-auto shrink-0 text-amber-200/60 hover:text-amber-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Verse cards */}
      <div className="flex flex-col gap-3">
        {timings.map((t, i) => (
          <VerseCard
            key={`v-${i}`}
            timing={t}
            active={i === activeIdx}
            headTime={headTime}
            isPlaying={isPlaying && i === activeIdx}
            duration={duration}
            onActivate={() => activateVerse(i)}
            onPlayPart={(from, to) => playRegion(i, from, to)}
            onStop={stopLoop}
            onSetStart={() => setBoundary(i, "start")}
            onSetEnd={() => setBoundary(i, "end")}
            onSplitWord={(absBoundary) => addWordSplit(i, absBoundary)}
            onRemoveSplit={(si) => removeSplit(i, si)}
            onDuplicate={() => duplicateVerse(i)}
            onDelete={() => deleteVerse(i)}
            canDelete={timings.length > 1}
            onSeek={(time) => seekTo(time, i)}
          />
        ))}
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-[var(--muted-deep)]">
        Splitting a verse keeps every word — it just shows the verse in parts
        (part 1, part 2…), one after another. To remove a wrongly detected or
        duplicate segment, use the 🗑 button on its card.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// One verse, shown as its sequential parts. Splitting after a word adds a part.
// ────────────────────────────────────────────────────────────────────────────

interface VerseCardProps {
  timing: VerseTiming;
  active: boolean;
  headTime: number;
  isPlaying: boolean;
  duration: number;
  onActivate: () => void;
  onPlayPart: (from: number, to: number) => void;
  onStop: () => void;
  onSetStart: () => void;
  onSetEnd: () => void;
  onSplitWord: (absBoundary: number) => void;
  onRemoveSplit: (splitIdx: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  onSeek: (time: number) => void;
}

function VerseCard({
  timing,
  active,
  headTime,
  isPlaying,
  onActivate,
  onPlayPart,
  onStop,
  onSetStart,
  onSetEnd,
  onSplitWord,
  onRemoveSplit,
  onDuplicate,
  onDelete,
  canDelete,
  onSeek,
}: VerseCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const verse = useAppStore((s) =>
    s.verses.find((v) => v.verse_number === timing.verseNumber)
  );
  const allWords = sanitizeArabic(verse?.text_uthmani ?? "").split(/\s+/).filter(Boolean);
  const totalWords = allWords.length;
  // Translation words — split alongside the Arabic, proportionally by time so the
  // translation chunk for each part matches its Arabic chunk.
  const transWords = (verse?.translation ?? "").split(/\s+/).filter(Boolean);
  const transTotal = transWords.length;
  const len = Math.max(0, timing.end - timing.start);
  const splits = timing.splits ?? [];
  const dur = Math.max(1e-6, timing.end - timing.start);

  // Which part is currently under the playhead (for highlight).
  const playheadInside = headTime >= timing.start && headTime <= timing.end;

  // Build parts: each is [wordLo, wordHi) + matching translation slice +
  // [timeFrom, timeTo] + the split index that opens it (null for the first part).
  const points = [timing.start, ...splits, timing.end];
  const sw = timing.splitWords;
  const swTotal = timing.splitWordTotal ?? totalWords;
  const hasFixed = !!(sw && sw.length === splits.length);
  const wordBounds = hasFixed ? [0, ...sw, totalWords] : null;
  const transBounds = hasFixed && swTotal > 0
    ? [0, ...sw.map((w) => snapToSentenceBoundary(transWords, Math.round((w / swTotal) * transTotal))), transTotal]
    : null;
  const parts = points.slice(0, -1).map((from, i) => {
    const to = points[i + 1];
    let wLo: number, wHi: number, tLo: number, tHi: number;
    if (wordBounds && transBounds) {
      wLo = wordBounds[i];
      wHi = wordBounds[i + 1];
      tLo = transBounds[i];
      tHi = transBounds[i + 1];
    } else {
      const fLo = (from - timing.start) / dur;
      const fHi = (to - timing.start) / dur;
      wLo = Math.max(0, Math.floor(fLo * totalWords));
      wHi = Math.min(totalWords, Math.max(wLo + 1, Math.floor(fHi * totalWords)));
      tLo = Math.max(0, Math.floor(fLo * transTotal));
      tHi = Math.min(transTotal, Math.max(tLo, Math.floor(fHi * transTotal)));
    }
    const translation = transTotal > 0 ? transWords.slice(tLo, tHi).join(" ") : "";
    return { from, to, wLo, wHi, translation, openingSplit: i === 0 ? null : i - 1 };
  });
  const multiPart = parts.length > 1;
  const activePartIdx = playheadInside
    ? parts.findIndex((p) => headTime >= p.from && headTime < p.to)
    : -1;

  return (
    <section
      onClick={onActivate}
      className={`group relative cursor-pointer rounded-2xl border p-4 transition-all sm:p-5 ${
        active
          ? "border-[var(--gold)]/60 bg-[rgba(201,162,75,0.05)] shadow-[0_0_0_1px_rgba(201,162,75,0.18)]"
          : "border-[var(--hairline-soft)] bg-[var(--ink-deep)] hover:border-[var(--hairline)]"
      }`}
    >
      {/* Header: number · whole-verse times · play whole · duplicate */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md px-2 text-[12px] font-semibold tabular-nums ring-1 ring-inset ${
              active
                ? "bg-gold text-[var(--ink-deep)] ring-transparent"
                : "bg-[var(--ink)]/80 text-gold-soft ring-[var(--hairline)]"
            }`}
          >
            {timing.verseNumber}
          </span>
          <div className="flex items-center gap-1.5 text-[12px] tabular-nums">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetStart();
              }}
              className="rounded text-parchment underline-offset-4 transition-colors hover:text-gold hover:underline"
              title="Set this verse's start at the playhead"
            >
              {fmt(timing.start)}
            </button>
            <span className="text-[var(--muted-deep)]">→</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetEnd();
              }}
              className="rounded text-parchment underline-offset-4 transition-colors hover:text-gold hover:underline"
              title="Set this verse's end at the playhead"
            >
              {fmt(timing.end)}
            </button>
            <span className="text-[var(--muted-deep)]">({fmt(len)})</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {multiPart && (
            <span className="rounded-full bg-emerald-soft/10 px-2.5 py-1 text-[10px] text-emerald-soft ring-1 ring-inset ring-emerald-soft/20">
              {parts.length} parts
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="rounded-full border border-[var(--hairline)] px-3 py-1.5 text-[11px] text-parchment transition-colors hover:border-gold hover:text-gold"
            title="Duplicate this verse"
          >
            ⧉ Duplicate
          </button>
          {canDelete &&
            (confirmingDelete ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] text-red-300/90">Delete verse?</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingDelete(false);
                  }}
                  className="rounded-full border border-[var(--hairline)] px-2.5 py-1 text-[11px] text-parchment transition-colors hover:border-gold"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingDelete(false);
                    onDelete();
                  }}
                  className="rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] text-red-300 ring-1 ring-inset ring-red-400/30 transition-colors hover:bg-red-500/25"
                >
                  Delete
                </button>
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingDelete(true);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--hairline)] text-[var(--muted)] transition-colors hover:border-red-400/40 hover:text-red-300"
                title="Delete this whole verse from the clip"
                aria-label="Delete verse"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            ))}
        </div>
      </div>

      {/* Mini audio strip — click to seek inside the verse. Part boundaries are
          marked so it's clear where each part starts in time. */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const rel = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          onSeek(timing.start + rel * dur);
        }}
        className="relative mb-4 h-2.5 cursor-pointer overflow-hidden rounded-full bg-[var(--ink)] ring-1 ring-[var(--hairline-soft)]"
        title="Click to seek inside this verse"
      >
        {splits.map((sp, si) => (
          <span
            key={si}
            className="absolute top-0 bottom-0 w-px bg-emerald-soft"
            style={{ left: `${((sp - timing.start) / dur) * 100}%` }}
          />
        ))}
        {playheadInside && (
          <span
            className="absolute top-0 bottom-0 w-px bg-gold shadow-[0_0_4px_rgba(201,162,75,0.7)]"
            style={{ left: `${((headTime - timing.start) / dur) * 100}%` }}
          />
        )}
      </div>

      {/* Parts — each its own labeled block, stacked in order. */}
      <div className="flex flex-col gap-2.5">
        {parts.map((p, pi) => {
          const qcfJustWords = verse?.qcfWords?.filter((w) => w.char_type_name === "word");
          const partQcf = qcfJustWords?.slice(p.wLo, p.wHi);
          return (
          <PartBlock
            key={pi}
            verseNumber={timing.verseNumber}
            partIndex={pi}
            multiPart={multiPart}
            words={allWords.slice(p.wLo, p.wHi)}
            translation={p.translation}
            wordOffset={p.wLo}
            totalWords={totalWords}
            isActivePart={pi === activePartIdx}
            isPlaying={isPlaying && pi === activePartIdx}
            onPlay={() => (isPlaying && pi === activePartIdx ? onStop() : onPlayPart(p.from, p.to))}
            onSplitWord={onSplitWord}
            canRemove={p.openingSplit != null}
            onRemove={() => p.openingSplit != null && onRemoveSplit(p.openingSplit)}
            qcfWords={partQcf}
          />
          );
        })}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// A single part of a verse: its label, its words, play, and the word-split tool.
// ────────────────────────────────────────────────────────────────────────────

export interface PartBlockProps {
  verseNumber: number;
  partIndex: number;
  multiPart: boolean;
  words: string[];
  translation: string;
  wordOffset: number; // absolute index of this part's first word
  totalWords: number;
  isActivePart: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onSplitWord: (absBoundary: number) => void;
  canRemove: boolean;
  onRemove: () => void;
  onActivate?: () => void;
  qcfWords?: QcfWord[];
}

export function PartBlock({
  verseNumber,
  partIndex,
  multiPart,
  words,
  translation,
  wordOffset,
  isActivePart,
  isPlaying,
  onPlay,
  onSplitWord,
  canRemove,
  onRemove,
  onActivate,
  qcfWords,
}: PartBlockProps) {
  const [splitOpen, setSplitOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const canSplit = words.length >= 2;

  const splitAt = selectedIdx ?? hoverIdx;

  return (
    <div
      onClick={onActivate}
      className={`rounded-xl border p-3 transition-colors ${
        isActivePart
          ? "border-gold/50 bg-[rgba(201,162,75,0.04)]"
          : "border-[var(--hairline-soft)] bg-[var(--ink)]/40 cursor-pointer"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="font-display text-[11px] uppercase tracking-[0.15em] text-gold-soft/80">
          {multiPart ? `${verseNumber} · ${partIndex + 1}` : verseNumber}
        </span>
        {multiPart && (
          <span className="text-[10px] tabular-nums text-[var(--muted-deep)]">
            {words.length} words
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment transition-colors hover:border-gold"
            aria-label={isPlaying ? "Pause" : "Play this part"}
            title="Play just this part"
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-3 w-3 translate-x-px" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          {canSplit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSplitOpen((o) => {
                  if (!o) { setSelectedIdx(null); setHoverIdx(null); }
                  return !o;
                });
              }}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                splitOpen
                  ? "border-emerald-soft/60 text-emerald-soft"
                  : "border-[var(--hairline)] text-parchment hover:border-emerald-soft hover:text-emerald-soft"
              }`}
              title="Split this part into two parts at a word"
            >
              ✂ Split
            </button>
          )}
          {canRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--hairline-soft)] text-[var(--muted)] transition-colors hover:border-red-400/40 hover:text-red-300"
              title="Merge this part back into the previous one"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {splitOpen && canSplit ? (
        <div onClick={(e) => e.stopPropagation()}>
          <p className="mb-2 text-[11px] text-[var(--muted)]">
            Tap between words to place the split
          </p>
          <div dir="rtl" className="font-arabic text-[22px] leading-loose">
            {words.map((w, i) => {
              const inPart1 = splitAt == null || i < splitAt;
              const showDivider = splitAt != null && i === splitAt;
              return (
                <span key={i} className="inline">
                  {showDivider && (
                    <span className="relative mx-1 inline-block h-[1.3em] w-0 translate-y-[0.2em] border-r-2 border-emerald-soft align-middle" />
                  )}
                  <span
                    onClick={() => {
                      if (i < 1 || i >= words.length) return;
                      setSelectedIdx(i);
                    }}
                    onMouseEnter={() => {
                      if (selectedIdx == null && i >= 1 && i < words.length) setHoverIdx(i);
                    }}
                    className={`cursor-pointer rounded px-0.5 transition-colors ${
                      inPart1
                        ? "text-parchment"
                        : "text-emerald-soft"
                    } ${i >= 1 && i < words.length ? "hover:bg-white/5" : ""}`}
                  >
                    {w}
                  </span>
                  {i < words.length - 1 && !showDivider && !(splitAt != null && i + 1 === splitAt) ? " " : ""}
                </span>
              );
            })}
          </div>
          {translation && splitAt != null && (() => {
            const tWords = translation.split(/\s+/).filter(Boolean);
            const tSplit = snapToSentenceBoundary(tWords, Math.round((splitAt / words.length) * tWords.length));
            const t1 = tWords.slice(0, tSplit).join(" ");
            const t2 = tWords.slice(tSplit).join(" ");
            return (
              <div className="mt-1.5 text-[12px] leading-relaxed">
                {t1 && <span className="text-[var(--muted)]">{t1}</span>}
                {t1 && t2 && <span className="mx-1.5 inline-block h-3 w-0 translate-y-[2px] border-r border-emerald-soft/60 align-middle" />}
                {t2 && <span className="text-emerald-soft/70">{t2}</span>}
              </div>
            );
          })()}
          {translation && splitAt == null && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
              {translation}
            </p>
          )}
          {selectedIdx != null && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--muted)]">
                Part 1: {selectedIdx} words · Part 2: {words.length - selectedIdx} words
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setSelectedIdx(null); setHoverIdx(null); }}
                  className="rounded-full border border-[var(--hairline)] px-3 py-1.5 text-[11px] text-parchment transition-colors hover:border-gold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onSplitWord(wordOffset + selectedIdx);
                    setSplitOpen(false);
                    setSelectedIdx(null);
                    setHoverIdx(null);
                  }}
                  className="rounded-full bg-emerald-soft/15 px-3 py-1.5 text-[11px] text-emerald-soft ring-1 ring-inset ring-emerald-soft/30 transition-colors hover:bg-emerald-soft/25"
                >
                  Split here
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <QcfVerse qcfWords={qcfWords} fallback={words.join(" ")} className="text-parchment" />
          {translation && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
              {translation}
            </p>
          )}
        </>
      )}
    </div>
  );
}
