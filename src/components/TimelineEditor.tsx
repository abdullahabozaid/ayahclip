"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  decodeAudioFile,
  findSilenceCenters,
  autoSegment,
  resampleTo16kMono,
  verseSegments,
} from "@/lib/audio-import";
import { loadCorpus, getVerseWeights } from "@/lib/verse-match";
import { forceAlignVerses } from "@/lib/forced-align";
import { importedPlayer } from "@/lib/imported-player";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, "0")}`;
}

const MIN_DUR = 0.12;
const MAX_CANVAS_W = 16000;

type DragKind = "start" | "end" | "body" | "split";
interface Drag {
  index: number;
  kind: DragKind;
  grabOffset: number;
  /** Position of the split within timings[index].splits when kind === "split". */
  splitIdx?: number;
}

/**
 * CapCut-style timeline for imported audio. The waveform is redrawn at true pixel
 * resolution for the current zoom (crisp at any level). Verse blocks are draggable
 * (independent start/end, gaps allowed and skipped on play/export); dragging an edge
 * pushes its neighbour and snaps onto nearby pauses. "Redetect" rebuilds boundaries
 * from the recitation's pauses; "Deep align" re-runs speech recognition to align
 * each verse's words to the audio. Playback is the shared importedPlayer.
 */
export function TimelineEditor() {
  const store = useAppStore();
  const imported = store.audioSource.mode === "imported" ? store.audioSource : null;
  const url = imported?.url ?? null;
  const timings = imported?.timings ?? [];

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const pausesRef = useRef<number[]>([]);
  const dragRef = useRef<Drag | null>(null);
  const durationRef = useRef(0);
  const headTimeRef = useRef(0);

  const [duration, setDuration] = useState(0);
  const [decoded, setDecoded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [headTime, setHeadTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [dragInfo, setDragInfo] = useState<{ pct: number; time: number } | null>(null);
  const [redetecting, setRedetecting] = useState(false);
  const [deepMsg, setDeepMsg] = useState<string | null>(null);
  const [deepErr, setDeepErr] = useState<string | null>(null);
  const [looping, setLooping] = useState(false);
  const [viewport, setViewport] = useState({ left: 0, width: 100 });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const scrubWasPlaying = useRef(false);

  durationRef.current = duration;
  headTimeRef.current = headTime;

  // ---- Decode audio → duration, pauses, waveform ----
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setDecoded(false);
    (async () => {
      try {
        const blob = await (await fetch(url)).blob();
        const buffer = await decodeAudioFile(blob);
        if (cancelled) return;
        bufferRef.current = buffer;
        pausesRef.current = findSilenceCenters(buffer).map((p) => p.time);
        setDuration(buffer.duration);
        setDecoded(true);
      } catch {
        if (!cancelled) setDuration(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // ---- Crisp waveform: redraw at the track's real pixel size (per zoom) ----
  const drawWaveform = useCallback(() => {
    const canvas = waveCanvasRef.current;
    const track = trackRef.current;
    const buf = bufferRef.current;
    if (!canvas || !track || !buf) return;
    const cssW = track.clientWidth;
    const cssH = track.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.min(MAX_CANVAS_W, Math.floor(cssW * dpr));
    const H = Math.floor(cssH * dpr);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    // Neutral parchment so the audio reads as "the recitation" and stays distinct
    // from the gold verse cards layered on top.
    ctx.fillStyle = "rgba(228,221,201,0.5)";
    const ch = buf.getChannelData(0);
    const len = ch.length;
    const mid = H / 2;
    const samplesPerCol = len / W;
    for (let x = 0; x < W; x++) {
      const s0 = Math.floor(x * samplesPerCol);
      const s1 = Math.min(len, Math.floor((x + 1) * samplesPerCol));
      let peak = 0;
      for (let i = s0; i < s1; i++) {
        const v = Math.abs(ch[i]);
        if (v > peak) peak = v;
      }
      const barH = Math.max(1, peak * H * 0.92);
      ctx.fillRect(x, mid - barH / 2, 1, barH);
    }
  }, []);

  // Redraw whenever the track resizes (covers zoom width changes + window resize).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => drawWaveform());
    ro.observe(track);
    return () => ro.disconnect();
  }, [drawWaveform]);

  useEffect(() => {
    if (decoded) requestAnimationFrame(() => drawWaveform());
  }, [decoded, drawWaveform]);

  // ---- Minimap: a coarse overview of the whole clip with a viewport box ----
  useEffect(() => {
    const canvas = minimapCanvasRef.current;
    const buf = bufferRef.current;
    if (!canvas || !buf) return;
    const W = (canvas.width = 1000);
    const H = (canvas.height = 48);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(228,221,201,0.4)";
    const ch = buf.getChannelData(0);
    const len = ch.length;
    const mid = H / 2;
    const per = len / W;
    for (let x = 0; x < W; x++) {
      let peak = 0;
      const s0 = Math.floor(x * per);
      const s1 = Math.min(len, Math.floor((x + 1) * per));
      for (let i = s0; i < s1; i += 8) {
        const v = Math.abs(ch[i]);
        if (v > peak) peak = v;
      }
      ctx.fillRect(x, mid - (peak * H * 0.9) / 2, 1, Math.max(1, peak * H * 0.9));
    }
  }, [decoded]);

  // Track the visible window for the minimap viewport box.
  useEffect(() => {
    const cont = scrollRef.current;
    if (!cont) return;
    const update = () => {
      const sw = cont.scrollWidth || 1;
      setViewport({ left: (cont.scrollLeft / sw) * 100, width: (cont.clientWidth / sw) * 100 });
    };
    update();
    cont.addEventListener("scroll", update);
    return () => cont.removeEventListener("scroll", update);
  }, [zoom, decoded]);

  const onMinimapPointer = (e: React.PointerEvent) => {
    const cont = scrollRef.current;
    if (!cont) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    cont.scrollLeft = frac * cont.scrollWidth - cont.clientWidth / 2;
  };

  // Keep zoom centered on the playhead.
  useEffect(() => {
    const cont = scrollRef.current;
    const dur = durationRef.current;
    if (!cont || dur <= 0) return;
    const x = (headTimeRef.current / dur) * cont.scrollWidth;
    cont.scrollLeft = Math.max(0, x - cont.clientWidth / 2);
  }, [zoom]);

  // ---- Shared player subscription: move the playhead + follow on play ----
  useEffect(() => {
    return importedPlayer.subscribe((time, isPlaying) => {
      setPlaying(isPlaying);
      setHeadTime(time);
      const dur = durationRef.current;
      if (playheadRef.current && dur > 0) {
        playheadRef.current.style.left = `${(time / dur) * 100}%`;
      }
      if (isPlaying) {
        const cont = scrollRef.current;
        if (cont && dur > 0) {
          const x = (time / dur) * cont.scrollWidth;
          if (x < cont.scrollLeft || x > cont.scrollLeft + cont.clientWidth - 40) {
            cont.scrollLeft = Math.max(0, x - cont.clientWidth * 0.3);
          }
        }
      }
    });
  }, []);

  const pxToTime = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    const dur = durationRef.current;
    if (!rect || dur <= 0) return 0;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return frac * dur;
  }, []);

  const setHead = useCallback((t: number) => {
    setHeadTime(t);
    const dur = durationRef.current;
    if (playheadRef.current && dur > 0) {
      playheadRef.current.style.left = `${(t / dur) * 100}%`;
    }
    const segs = useAppStore.getState().audioSource;
    if (segs.mode === "imported") {
      const idx = segs.timings.findIndex((tm) => t >= tm.start && t < tm.end);
      if (idx >= 0 && idx !== useAppStore.getState().currentVerseIndex) {
        useAppStore.getState().setCurrentVerseIndex(idx);
      }
    }
  }, []);

  const seek = useCallback(
    (t: number) => {
      if (url) importedPlayer.seek(url, t);
      setHead(t);
    },
    [url, setHead]
  );

  const togglePlay = useCallback(() => {
    if (url) importedPlayer.toggle(url);
  }, [url]);

  // ---- Loop the selected verse (repeat its region to fine-tune in/out by ear) ----
  const toggleLoop = () => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported" || !url) return;
    if (looping) {
      importedPlayer.clearLoop();
      setLooping(false);
      return;
    }
    const seg = cur.timings[useAppStore.getState().currentVerseIndex];
    if (!seg) return;
    importedPlayer.setLoop(seg.start, seg.end);
    setLooping(true);
    importedPlayer.seek(url, seg.start);
    if (!importedPlayer.isPlaying()) importedPlayer.play(url);
  };
  // Keep the loop region on the currently selected verse while looping.
  useEffect(() => {
    if (!looping) return;
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const seg = cur.timings[store.currentVerseIndex];
    if (seg) importedPlayer.setLoop(seg.start, seg.end);
  }, [looping, store.currentVerseIndex]);

  // ---- Keyboard shortcuts (space play/pause, arrows seek) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (document.querySelector(".fixed.inset-0.z-50")) return; // fullscreen has its own keys
      const u = url;
      if (!u) return;
      if (e.code === "Space") {
        e.preventDefault();
        importedPlayer.toggle(u);
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.25;
        const dir = e.code === "ArrowLeft" ? -1 : 1;
        const t = Math.min(durationRef.current, Math.max(0, importedPlayer.currentTime() + dir * step));
        importedPlayer.seek(u, t);
        setHead(t);
      } else if (e.code === "KeyS" && e.shiftKey) {
        // Shift+S: intra-verse split at the playhead — divides the verse's text
        // into segments that change at the marker. Distinct from plain S which
        // moves the boundary between adjacent verses.
        e.preventDefault();
        addSplit();
      } else if (e.code === "KeyS") {
        // Split at the playhead: move the boundary of the verse under the playhead.
        e.preventDefault();
        const cur = useAppStore.getState().audioSource;
        if (cur.mode !== "imported") return;
        const t = importedPlayer.currentTime();
        const next = cur.timings.map((x) => ({ ...x }));
        const i = next.findIndex((s) => t >= s.start && t < s.end);
        if (i >= 0 && i < next.length - 1) {
          const b = Math.max(next[i].start + MIN_DUR, Math.min(next[i + 1].end - MIN_DUR, t));
          next[i].end = b;
          next[i + 1].start = b;
          useAppStore.getState().setVerseTimings(next);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, setHead]);

  // ---- Audio scrubbing: drag on the track to seek + hear the audio ----
  const onScrubMove = useCallback((e: PointerEvent) => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const t = pxToTime(e.clientX);
    importedPlayer.seek(cur.url, t);
    setHead(t);
  }, [pxToTime, setHead]);
  const onScrubEnd = useCallback(() => {
    if (!scrubWasPlaying.current) importedPlayer.pause();
    window.removeEventListener("pointermove", onScrubMove);
    window.removeEventListener("pointerup", onScrubEnd);
  }, [onScrubMove]);
  const startScrub = (clientX: number) => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    scrubWasPlaying.current = importedPlayer.isPlaying();
    const t = pxToTime(clientX);
    importedPlayer.seek(cur.url, t);
    setHead(t);
    if (!scrubWasPlaying.current) importedPlayer.play(cur.url); // hear audio while scrubbing
    window.addEventListener("pointermove", onScrubMove);
    window.addEventListener("pointerup", onScrubEnd);
  };

  // ---- Dragging block edges / bodies (snap to pauses; push neighbours) ----
  const applyDrag = useCallback((clientX: number) => {
    const drag = dragRef.current;
    const dur = durationRef.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!drag || !rect || dur <= 0) return;
    let t = Math.min(dur, Math.max(0, ((clientX - rect.left) / rect.width) * dur));

    // Snap a dragged edge onto a nearby pause (within ~10px) for easy precision.
    if (drag.kind !== "body" && pausesRef.current.length) {
      const tolSec = (10 / rect.width) * dur;
      let bd = tolSec;
      for (const p of pausesRef.current) {
        const d = Math.abs(p - t);
        if (d < bd) {
          bd = d;
          t = p;
        }
      }
    }

    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const next = cur.timings.map((x) => ({ ...x }));
    const i = drag.index;
    const seg = next[i];
    if (!seg) return;

    let edgeTime = t;
    if (drag.kind === "start") {
      const floor = i > 0 ? next[i - 1].start + MIN_DUR : 0;
      const s = Math.min(seg.end - MIN_DUR, Math.max(floor, t));
      if (i > 0 && s < next[i - 1].end) next[i - 1].end = s;
      seg.start = s;
      edgeTime = s;
    } else if (drag.kind === "end") {
      const ceil = i < next.length - 1 ? next[i + 1].end - MIN_DUR : dur;
      const e = Math.max(seg.start + MIN_DUR, Math.min(ceil, t));
      if (i < next.length - 1 && e > next[i + 1].start) next[i + 1].start = e;
      seg.end = e;
      edgeTime = e;
    } else if (drag.kind === "split") {
      const splits = (seg.splits ?? []).slice();
      const si = drag.splitIdx ?? 0;
      if (si < 0 || si >= splits.length) return;
      const prev = si > 0 ? splits[si - 1] : seg.start;
      const after = si < splits.length - 1 ? splits[si + 1] : seg.end;
      const sp = Math.max(prev + MIN_DUR, Math.min(after - MIN_DUR, t));
      splits[si] = sp;
      seg.splits = splits;
      edgeTime = sp;
    } else {
      const len = seg.end - seg.start;
      const prevEnd = i > 0 ? next[i - 1].end : 0;
      const nextStart = i < next.length - 1 ? next[i + 1].start : dur;
      const s = Math.max(prevEnd, Math.min(nextStart - len, t - drag.grabOffset));
      seg.start = s;
      seg.end = s + len;
      edgeTime = s;
    }
    useAppStore.getState().setVerseTimings(next);
    setDragInfo({ pct: (edgeTime / dur) * 100, time: edgeTime });
  }, []);

  const onDragMove = useCallback((e: PointerEvent) => applyDrag(e.clientX), [applyDrag]);
  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    setDragInfo(null);
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
  }, [onDragMove]);

  const startDrag = (index: number, kind: DragKind, splitIdx?: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const seg = timings[index];
    const t = pxToTime(e.clientX);
    dragRef.current = {
      index,
      kind,
      splitIdx,
      grabOffset: kind === "body" ? t - seg.start : 0,
    };
    if (kind === "body") {
      store.setCurrentVerseIndex(index);
      seek(seg.start);
    }
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
  };

  // Drop an intra-verse split at the playhead inside the active verse. The verse's
  // text gets divided proportionally at each split — so a long ayah can change
  // on-screen text mid-recitation without breaking the ayah itself.
  const addSplit = () => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const i = useAppStore.getState().currentVerseIndex;
    const seg = cur.timings[i];
    if (!seg) return;
    const t = headTimeRef.current;
    if (t <= seg.start + MIN_DUR || t >= seg.end - MIN_DUR) return;
    const splits = (seg.splits ?? []).slice();
    for (const sp of splits) if (Math.abs(sp - t) < MIN_DUR) return;
    splits.push(t);
    splits.sort((a, b) => a - b);
    const next = cur.timings.map((x) => ({ ...x }));
    next[i] = { ...next[i], splits };
    useAppStore.getState().setVerseTimings(next);
  };

  const removeSplit = (verseIdx: number, splitIdx: number) => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const next = cur.timings.map((x) => ({ ...x }));
    const target = next[verseIdx];
    if (!target?.splits) return;
    const remaining = target.splits.filter((_, j) => j !== splitIdx);
    next[verseIdx] = { ...target, splits: remaining.length ? remaining : undefined };
    useAppStore.getState().setVerseTimings(next);
  };

  // Snap the selected verse's start/end to the current playhead — play, pause at the
  // exact spot, then click: precise matching without fiddly dragging.
  const setBoundaryToHead = (kind: "start" | "end") => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const i = useAppStore.getState().currentVerseIndex;
    const dur = durationRef.current;
    const t = headTimeRef.current;
    const next = cur.timings.map((x) => ({ ...x }));
    const seg = next[i];
    if (!seg) return;
    if (kind === "start") {
      const floor = i > 0 ? next[i - 1].start + MIN_DUR : 0;
      const s = Math.min(seg.end - MIN_DUR, Math.max(floor, t));
      if (i > 0 && s < next[i - 1].end) next[i - 1].end = s;
      seg.start = s;
    } else {
      const ceil = i < next.length - 1 ? next[i + 1].end - MIN_DUR : dur;
      const e = Math.max(seg.start + MIN_DUR, Math.min(ceil, t));
      if (i < next.length - 1 && e > next[i + 1].start) next[i + 1].start = e;
      seg.end = e;
    }
    useAppStore.getState().setVerseTimings(next);
  };

  // Delete the head (everything before the playhead) or the tail (everything after).
  // Trimmed regions become gaps that are skipped on play and dropped from the export.
  const trimTo = (which: "start" | "end") => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported" || cur.timings.length === 0) return;
    const t = headTimeRef.current;
    const dur = durationRef.current;
    const next = cur.timings.map((x) => ({ ...x }));
    if (which === "start") {
      const seg = next[0];
      seg.start = Math.max(0, Math.min(seg.end - MIN_DUR, t));
    } else {
      const seg = next[next.length - 1];
      seg.end = Math.min(dur, Math.max(seg.start + MIN_DUR, t));
    }
    useAppStore.getState().setVerseTimings(next);
  };

  // Wheel over the timeline: plain wheel scrolls horizontally, Ctrl/⌘+wheel zooms.
  useEffect(() => {
    const cont = scrollRef.current;
    if (!cont) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.min(24, Math.max(1, +(z * (e.deltaY < 0 ? 1.15 : 0.87)).toFixed(2))));
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        cont.scrollLeft += e.deltaY;
      }
    };
    cont.addEventListener("wheel", onWheel, { passive: false });
    return () => cont.removeEventListener("wheel", onWheel);
  }, []);

  // Rebuild boundaries from the recitation's pauses (text length only assigns
  // which pause belongs to which verse).
  const redetect = async () => {
    const buf = bufferRef.current;
    const cur = useAppStore.getState().audioSource;
    const surahId = useAppStore.getState().surah?.id;
    if (!buf || cur.mode !== "imported" || !surahId) return;
    const verseNumbers = cur.timings.map((t) => t.verseNumber);
    if (verseNumbers.length === 0) return;
    setRedetecting(true);
    try {
      await loadCorpus();
      const weights = getVerseWeights(surahId, verseNumbers[0], verseNumbers[verseNumbers.length - 1]);
      useAppStore.getState().setVerseTimings(autoSegment(buf, verseNumbers, weights));
    } finally {
      setRedetecting(false);
    }
  };

  // Re-run speech recognition and map each verse's words onto the audio's word
  // onsets — most accurate for run-on recitation with few pauses.
  const deepAlign = async () => {
    const buf = bufferRef.current;
    const cur = useAppStore.getState().audioSource;
    const surahId = useAppStore.getState().surah?.id;
    if (!buf || cur.mode !== "imported" || !surahId) return;
    const verseNumbers = cur.timings.map((t) => t.verseNumber);
    if (verseNumbers.length === 0) return;
    setDeepErr(null);
    setDeepMsg("Preparing…");
    try {
      await loadCorpus();
      const audio = await resampleTo16kMono(buf);
      const { transcribe } = await import("@/lib/asr");
      const result = await transcribe(audio, (loaded, total) => {
        // First run downloads the ~131 MB recognition model once (then cached);
        // say so explicitly so a slow first load doesn't look frozen.
        setDeepMsg(
          total
            ? `Downloading model (one-time, ~131 MB)… ${Math.round((loaded / total) * 100)}%`
            : "Listening…"
        );
      });
      setDeepMsg("Aligning…");
      const lo = verseNumbers[0];
      const hi = verseNumbers[verseNumbers.length - 1];

      // Forced alignment: align the decoded transcript (with per-char frame times)
      // to the known verse text for true per-verse boundaries. Falls back to
      // pause-based segmentation if alignment isn't usable.
      const aligned = forceAlignVerses({
        hypText: result.text,
        hypCharTimes: result.charTimes,
        surah: surahId,
        verseNumbers,
        audioDuration: buf.duration,
      });
      if (aligned) {
        useAppStore.getState().setVerseTimings(aligned);
      } else {
        // ASR ran but the transcript didn't line up with the known verses —
        // keep a usable result by rebuilding from pauses, and tell the user.
        const weights = getVerseWeights(surahId, lo, hi);
        useAppStore.getState().setVerseTimings(autoSegment(buf, verseNumbers, weights));
        setDeepErr("Couldn't align to the verses — used pause detection instead. Fine-tune by ear.");
      }
    } catch {
      setDeepErr("Deep align failed (model couldn't load). Check your connection and retry, or use ↻ Redetect.");
    } finally {
      setDeepMsg(null);
    }
  };

  if (!imported || timings.length === 0) return null;

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);
  const activeIdx = store.currentVerseIndex;
  const tickStep = duration > 240 ? 30 : duration > 90 ? 10 : 5;
  const tickCount = duration > 0 ? Math.min(200, Math.floor(duration / tickStep) + 1) : 0;
  const busy = redetecting || deepMsg != null;

  return (
    <div className="space-y-4">
      {/* Primary transport — the controls used 80% of the time stay in front.
          Tools (Redetect / Deep align / Trim) live in a collapsible cluster. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={loading || duration === 0}
          className="btn-gold flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
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
        <button
          onClick={toggleLoop}
          disabled={loading || duration === 0}
          className={`flex h-9 items-center rounded-full px-3.5 text-[11px] transition-colors disabled:opacity-40 ${
            looping ? "bg-[var(--gold)] text-[var(--ink-deep)]" : "btn-ghost"
          }`}
          title="Loop the selected verse to fine-tune its start/end by ear"
        >
          🔁 Loop verse
        </button>
        <span className="tabular-nums text-[13px] text-[var(--muted)]">
          {fmt(headTime)} <span className="text-[var(--muted-deep)]">/ {fmt(duration)}</span>
        </span>

        {/* Right cluster: Tools toggle + zoom */}
        <div className="ml-auto flex items-center gap-2.5">
          <button
            onClick={() => setToolsOpen((v) => !v)}
            disabled={loading || duration === 0}
            className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[11px] transition-colors disabled:opacity-40 ${
              toolsOpen ? "border border-gold/40 bg-[var(--gold)]/[0.08] text-parchment" : "btn-ghost"
            }`}
            aria-expanded={toolsOpen}
            title="Open detect / trim tools"
          >
            Tools
            <svg
              viewBox="0 0 24 24"
              className={`h-3 w-3 transition-transform ${toolsOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.max(1, +(z / 1.5).toFixed(2)))}
              disabled={zoom <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment hover:border-gold disabled:opacity-30"
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="w-9 text-center text-[11px] tabular-nums text-[var(--muted-deep)]">
              {zoom.toFixed(1)}×
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(24, +(z * 1.5).toFixed(2)))}
              disabled={zoom >= 24}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment hover:border-gold disabled:opacity-30"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Tools cluster — only when you need it. Quieter chrome than the
          primary row; the actions inside are intentionally less frequent. */}
      {toolsOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--hairline-soft)] bg-[var(--ink-deep)]/60 px-4 py-2.5">
          <button
            onClick={redetect}
            disabled={busy || loading}
            className="btn-gold rounded-full px-3 py-1.5 text-[11px] disabled:opacity-40"
            title="Rebuild every verse boundary from the recitation's pauses"
          >
            {redetecting ? "Redetecting…" : "↻ Redetect"}
          </button>
          <button
            onClick={deepAlign}
            disabled={busy || loading}
            className="btn-ghost rounded-full px-3 py-1.5 text-[11px] disabled:opacity-40"
            title="Re-run speech recognition to align each verse's words to the audio (best for run-on recitation)"
          >
            {deepMsg ? deepMsg : "✨ Deep align"}
          </button>
          <span className="mx-1 h-4 w-px bg-[var(--hairline)]" />
          <button
            onClick={() => trimTo("start")}
            disabled={loading || duration === 0}
            className="btn-ghost rounded-full px-3 py-1.5 text-[11px] disabled:opacity-40"
            title="Delete everything before the playhead"
          >
            ⇤ Trim start
          </button>
          <button
            onClick={() => trimTo("end")}
            disabled={loading || duration === 0}
            className="btn-ghost rounded-full px-3 py-1.5 text-[11px] disabled:opacity-40"
            title="Delete everything after the playhead"
          >
            Trim end ⇥
          </button>
          <span className="ml-auto hidden text-[10px] text-[var(--muted-deep)] sm:inline">
            Rebuild or refine the detection · crop the edges
          </span>
        </div>
      )}

      {deepErr && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90"
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

      {/* Selected-verse inspector — one quiet strip with breathing room.
          Each time is its own button: click to snap that boundary to the
          playhead. No repeated "at playhead" labels. */}
      {timings[activeIdx] && (() => {
        const v = timings[activeIdx];
        const len = Math.max(0, v.end - v.start);
        const splitCount = v.splits?.length ?? 0;
        const segCount = splitCount + 1;
        return (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] px-4 py-2.5">
            <span
              className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md bg-[var(--gold)]/15 px-2 text-[12px] font-medium tabular-nums text-gold-soft ring-1 ring-inset ring-[var(--hairline)]"
              title={`Verse ${v.verseNumber} of this clip`}
            >
              {v.verseNumber}
            </span>

            <div className="flex items-center gap-2 text-[12px] tabular-nums">
              <button
                onClick={() => setBoundaryToHead("start")}
                className="rounded text-parchment underline-offset-4 transition-colors hover:text-gold hover:underline"
                title="Click to set this verse's start at the playhead"
              >
                {fmt(v.start)}
              </button>
              <span className="text-[var(--muted-deep)]">→</span>
              <button
                onClick={() => setBoundaryToHead("end")}
                className="rounded text-parchment underline-offset-4 transition-colors hover:text-gold hover:underline"
                title="Click to set this verse's end at the playhead"
              >
                {fmt(v.end)}
              </button>
              <span className="text-[var(--muted-deep)]">({fmt(len)})</span>
            </div>

            <button
              onClick={addSplit}
              className="btn-ghost flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px]"
              title="Split this verse's text at the playhead (for long verses)"
            >
              ✂ Split
            </button>

            {splitCount > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-soft/10 px-2.5 py-1 text-[10px] text-emerald-soft ring-1 ring-inset ring-emerald-soft/20"
                title={`${segCount} on-screen text segments separated by ${splitCount} split${splitCount === 1 ? "" : "s"}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-soft" />
                {segCount} segments
              </span>
            )}
          </div>
        );
      })()}

      {loading && <p className="text-[11px] text-[var(--muted-deep)]">Loading waveform…</p>}

      {/* Minimap overview (only when zoomed in) */}
      {zoom > 1 && (
        <div
          onPointerDown={onMinimapPointer}
          className="relative h-8 cursor-pointer overflow-hidden rounded-md border border-[var(--hairline-soft)] bg-[var(--ink-deep)]"
          title="Jump anywhere in the clip"
        >
          <canvas ref={minimapCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full opacity-70" />
          <div
            className="pointer-events-none absolute top-0 bottom-0 rounded-sm border border-gold bg-gold/15"
            style={{ left: `${viewport.left}%`, width: `${viewport.width}%` }}
          />
        </div>
      )}

      {/* Scroll viewport (zoom widens the inner track) */}
      <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden">
        <div style={{ width: `${zoom * 100}%` }} className="min-w-full">
          {/* Ruler */}
          <div className="relative mb-1 h-4 select-none text-[10px] text-[var(--muted-deep)]">
            {Array.from({ length: tickCount }, (_, i) => {
              const t = i * tickStep;
              return (
                <span
                  key={i}
                  className="absolute -translate-x-1/2 tabular-nums"
                  style={{ left: `${pct(t)}%` }}
                >
                  {fmt(t)}
                </span>
              );
            })}
          </div>

          {/* Track */}
          <div
            ref={trackRef}
            onPointerDown={(e) => {
              if (e.target === trackRef.current || (e.target as HTMLElement).dataset.wave) {
                startScrub(e.clientX); // drag to scrub (seek + hear audio)
              }
            }}
            className="relative h-24 cursor-text overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--ink-deep)]"
          >
            <canvas
              ref={waveCanvasRef}
              data-wave="1"
              className="pointer-events-none absolute inset-0 h-full w-full"
            />

            {/* Verse cards */}
            {timings.map((t, i) => {
              const left = pct(t.start);
              const width = Math.max(0.4, pct(t.end) - left);
              const active = i === activeIdx;
              return (
                <div
                  key={t.verseNumber}
                  className={`group absolute top-1 bottom-1 rounded-lg border transition-colors ${
                    active
                      ? "z-[15] border-gold bg-[rgba(201,162,75,0.18)] ring-1 ring-gold/70"
                      : `border-[var(--hairline-soft)] hover:bg-[rgba(201,162,75,0.12)] ${
                          i % 2 === 0 ? "bg-[rgba(255,255,255,0.04)]" : "bg-transparent"
                        }`
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  {/* verse-number chip (top-left, like a CapCut clip label) */}
                  <span
                    className={`pointer-events-none absolute left-1 top-1 z-[1] rounded px-1.5 py-px text-[10px] font-semibold tabular-nums ${
                      active
                        ? "bg-gold text-[var(--ink-deep)]"
                        : "bg-[var(--ink)]/85 text-gold-soft ring-1 ring-[var(--hairline)]"
                    }`}
                  >
                    {t.verseNumber}
                  </span>
                  {/* left handle — kept inside the card edge so the first verse's
                      handle is never clipped by the track (trim the head from here) */}
                  <div
                    onPointerDown={startDrag(i, "start")}
                    className="absolute left-0 top-0 bottom-0 z-10 flex w-3.5 cursor-ew-resize items-center justify-start pl-px"
                    title="Drag the verse start"
                  >
                    <span className="h-3/4 w-[3px] rounded bg-gold/70 group-hover:bg-gold" />
                  </div>
                  {/* body — drag to move / click to select */}
                  <div
                    onPointerDown={startDrag(i, "body")}
                    className="h-full w-full cursor-grab active:cursor-grabbing"
                  />
                  {/* right handle — inside the card edge (trim the tail from here) */}
                  <div
                    onPointerDown={startDrag(i, "end")}
                    className="absolute right-0 top-0 bottom-0 z-10 flex w-3.5 cursor-ew-resize items-center justify-end pr-px"
                    title="Drag the verse end"
                  >
                    <span className="h-3/4 w-[3px] rounded bg-gold/70 group-hover:bg-gold" />
                  </div>
                  {/* Segment preview labels: under the active verse, each split
                      region shows the first words of the Arabic that segment will
                      display on-screen — so you can confirm the chunking without
                      playing through. */}
                  {active && t.splits && t.splits.length > 0 && (() => {
                    const verse = store.verses.find((v) => v.verse_number === t.verseNumber);
                    if (!verse) return null;
                    const segs = verseSegments(t, verse.text_uthmani);
                    const span = t.end - t.start;
                    if (span <= 0) return null;
                    const points = [t.start, ...t.splits!, t.end];
                    return segs.map((segText, si) => {
                      const lo = points[si];
                      const hi = points[si + 1];
                      const leftPct = ((lo - t.start) / span) * 100;
                      const widthPct = ((hi - lo) / span) * 100;
                      return (
                        <div
                          key={`label-${si}`}
                          className="pointer-events-none absolute bottom-1 z-[2] flex overflow-hidden px-1"
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          dir="rtl"
                        >
                          <span
                            className="font-arabic truncate rounded bg-[var(--ink-deep)]/85 px-1.5 py-0.5 text-[11px] leading-snug text-emerald-soft ring-1 ring-[var(--hairline)]/50"
                            title={segText}
                          >
                            {segText}
                          </span>
                        </div>
                      );
                    });
                  })()}

                  {/* Intra-verse split markers (long-verse text breaks). Emerald
                      to distinguish from the gold verse boundaries. Drag to move,
                      tap × to remove (× only shows on the active verse). */}
                  {t.splits?.map((sp, si) => {
                    const span = t.end - t.start;
                    if (span <= 0) return null;
                    const localLeft = ((sp - t.start) / span) * 100;
                    return (
                      <div
                        key={si}
                        className="absolute top-0 bottom-0 z-[11]"
                        style={{ left: `${localLeft}%`, transform: "translateX(-50%)" }}
                      >
                        {active && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSplit(i, si);
                            }}
                            className="absolute -top-2 left-1/2 z-10 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--ink-deep)] text-[10px] leading-none text-emerald-soft ring-1 ring-[var(--hairline)] hover:text-red-400"
                            title="Remove split"
                          >
                            ×
                          </button>
                        )}
                        <div
                          onPointerDown={active ? startDrag(i, "split", si) : undefined}
                          className={
                            active
                              ? "flex h-full w-2.5 cursor-ew-resize items-center justify-center"
                              : "pointer-events-none flex h-full w-px items-center justify-center"
                          }
                          title={active ? "Drag to adjust · × to remove" : undefined}
                        >
                          <span
                            className={`h-3/4 w-px ${active ? "bg-emerald-soft" : "bg-emerald-soft/60"}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Trimmed head / tail — dimmed so it's clear they're deleted */}
            {timings[0].start > 0.02 && (
              <div
                className="pointer-events-none absolute top-1 bottom-1 left-0 z-[8] flex items-center justify-center rounded-l-lg bg-[var(--ink-deep)]/75"
                style={{ width: `${pct(timings[0].start)}%` }}
              >
                <span className="text-[9px] uppercase tracking-wider text-[var(--muted-deep)]">trimmed</span>
              </div>
            )}
            {timings[timings.length - 1].end < duration - 0.02 && (
              <div
                className="pointer-events-none absolute top-1 bottom-1 z-[8] flex items-center justify-center rounded-r-lg bg-[var(--ink-deep)]/75"
                style={{
                  left: `${pct(timings[timings.length - 1].end)}%`,
                  width: `${pct(duration - timings[timings.length - 1].end)}%`,
                }}
              >
                <span className="text-[9px] uppercase tracking-wider text-[var(--muted-deep)]">trimmed</span>
              </div>
            )}

            {/* Drag guide + live time label */}
            {dragInfo && (
              <>
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-parchment"
                  style={{ left: `${dragInfo.pct}%` }}
                />
                <div
                  className="pointer-events-none absolute top-0 z-30 -translate-x-1/2 rounded bg-[var(--ink)] px-1.5 py-0.5 text-[10px] tabular-nums text-parchment ring-1 ring-[var(--hairline)]"
                  style={{ left: `${dragInfo.pct}%` }}
                >
                  {fmt(dragInfo.time)}
                </div>
              </>
            )}

            {/* Playhead */}
            <div
              ref={playheadRef}
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-gold shadow-[0_0_6px_rgba(201,162,75,0.8)]"
              style={{ left: 0 }}
            >
              <span className="absolute -top-1 -left-[3px] h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-gold" />
            </div>
          </div>
        </div>
      </div>

      {/* Discoverable shortcuts — replaces the dense help paragraph that used
          to live here. Tucked at the right so the timeline itself can breathe. */}
      <div className="relative flex items-center justify-end">
        <button
          onClick={() => setShortcutsOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-[var(--muted-deep)] transition-colors hover:bg-[var(--ink-deep)] hover:text-parchment"
          aria-expanded={shortcutsOpen}
          title="Show keyboard shortcuts and tips"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path strokeLinecap="round" d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
          </svg>
          Shortcuts
        </button>
        {shortcutsOpen && (
          <div
            role="dialog"
            className="absolute bottom-full right-0 z-40 mb-2 w-[320px] rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.18em] text-gold-soft/80">
                Timeline shortcuts
              </span>
              <button
                onClick={() => setShortcutsOpen(false)}
                aria-label="Close"
                className="text-[var(--muted-deep)] hover:text-parchment"
              >
                ✕
              </button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
              <dt className="font-mono text-gold-soft">Space</dt>
              <dd className="text-[var(--muted)]">Play / pause</dd>
              <dt className="font-mono text-gold-soft">← / →</dt>
              <dd className="text-[var(--muted)]">Seek 0.25s · hold Shift for 1s</dd>
              <dt className="font-mono text-gold-soft">S</dt>
              <dd className="text-[var(--muted)]">Snap nearest verse boundary to playhead</dd>
              <dt className="font-mono text-gold-soft">Shift+S</dt>
              <dd className="text-[var(--muted)]">Split the current verse’s text at playhead</dd>
            </dl>
            <div className="mt-3 border-t border-[var(--hairline-soft)] pt-3 text-[11px] leading-relaxed text-[var(--muted)]">
              Drag a verse’s edges to retime · drag into a neighbour to push it
              · drag the middle to move · drag the waveform to scrub. Trimmed
              regions and gaps are skipped on play and export.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
