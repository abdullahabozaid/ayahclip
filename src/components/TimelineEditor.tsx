"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  decodeAudioFile,
  findSilenceCenters,
  autoSegment,
  verseSegments,
  type VerseTiming,
} from "@/lib/audio-import";
import { loadCorpus, getVerseWeights } from "@/lib/verse-match";
import { alignImportedAudio, attachAlignmentDiagnostics } from "@/lib/deep-align";
import {
  alignmentFailureMessage,
  alignmentReviewProgress,
  buildAlignmentReview,
  buildPersistedAlignmentReview,
  type AlignmentReview,
} from "@/lib/alignment-feedback";
import {
  applyAlignedTimingsToRows,
  markAlignmentBoundaryReviewed,
  verseNumbersForAlignment,
} from "@/lib/timing-ops";
import { importedPlayer } from "@/lib/imported-player";
import { browserDeviceMemoryGb } from "@/lib/import-limits";
import { pinchZoom, timelinePointerTime } from "@/lib/timeline-gestures";
import {
  appendTimelineSnapshot,
  cloneVerseTimings,
  type TimelineSnapshot,
} from "@/lib/timeline-history";
import {
  AlignmentProgress,
  type LocalAlignmentProgress,
} from "@/components/AlignmentProgress";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, "0")}`;
}

const MIN_DUR = 0.12;
const MAX_CANVAS_W = 16000;


/** Precompute one peak amplitude per bucket so the waveform redraws (on every
 *  zoom/scroll) never re-scan the raw samples. Mono (channel 0). */
function buildPeaks(buf: AudioBuffer, buckets: number): Float32Array {
  const ch = buf.getChannelData(0);
  const len = ch.length;
  const per = len / buckets;
  const peaks = new Float32Array(buckets);
  for (let b = 0; b < buckets; b++) {
    const s0 = Math.floor(b * per);
    const s1 = Math.min(len, Math.floor((b + 1) * per));
    let peak = 0;
    for (let i = s0; i < s1; i++) {
      const v = Math.abs(ch[i]);
      if (v > peak) peak = v;
    }
    peaks[b] = peak;
  }
  return peaks;
}

// Inline SVG icon set for the timeline toolbar — replaces the emoji that read
// as utilitarian next to the hand-drawn SVGs used elsewhere. One stroke style,
// matching the app's existing 24-box / strokeWidth-2 language.
const TL_ICON = {
  loop: ["M17 2l4 4-4 4", "M3 11V9a4 4 0 0 1 4-4h14", "M7 22l-4-4 4-4", "M21 13v2a4 4 0 0 1-4 4H3"],
  scissors: ["M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M20 4 8.5 15.5", "M14.5 14.5 20 20", "M8.5 8.5 12 12"],
  copy: ["M9 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
  refresh: ["M21 2v6h-6", "M3 12a9 9 0 0 1 15-6.7L21 8", "M3 22v-6h6", "M21 12a9 9 0 0 1-15 6.7L3 16"],
  trimStart: ["M8 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3", "M14 8l-4 4 4 4"],
  trimEnd: ["M16 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3", "M10 8l4 4-4 4"],
  type: ["M4 7V5h16v2", "M12 5v14", "M9 19h6"],
  x: ["M6 6l12 12", "M18 6 6 18"],
  trash: ["M3 6h18", "M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2", "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6", "M10 11v6", "M14 11v6"],
  focus: ["M4 8V5a1 1 0 0 1 1-1h3", "M16 4h3a1 1 0 0 1 1 1v3", "M20 16v3a1 1 0 0 1-1 1h-3", "M8 20H5a1 1 0 0 1-1-1v-3", "M9 12h6"],
} as const;

function TlIcon({ d, className = "h-3.5 w-3.5" }: { d: readonly string[]; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

type DragKind = "start" | "end" | "body" | "split";
interface Drag {
  index: number;
  kind: DragKind;
  grabOffset: number;
  pointerStartX: number;
  initialTargetTime: number;
  /** Position of the split within timings[index].splits when kind === "split". */
  splitIdx?: number;
}

/**
 * CapCut-style timeline for imported audio. The waveform is redrawn at true pixel
 * resolution for the current zoom (crisp at any level). Verse blocks are draggable
 * (independent start/end, gaps allowed and skipped on play/export); dragging an edge
 * pushes its neighbour and snaps onto nearby pauses. "Rebuild from pauses" rebuilds
 * boundaries from the recitation's pauses; "Align by recitation" re-runs local recognition to align
 * each verse's words to the audio. Playback is the shared importedPlayer.
 */
interface TimelineEditorProps {
  /** When true, the track + cards grow to use the available vertical space —
   *  intended for the FullscreenTimeline overlay (`Expand` from the dock). */
  fullscreen?: boolean;
}

export function TimelineEditor({ fullscreen = false }: TimelineEditorProps = {}) {
  const store = useAppStore();
  const imported = store.audioSource.mode === "imported" ? store.audioSource : null;
  const url = imported?.url ?? null;
  const timings = imported?.timings ?? [];

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const progressCanvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  // Cached min/max peaks (one amplitude per bucket), computed once at decode so
  // zoom/scroll redraws never re-scan the raw samples (millions of them).
  const peaksRef = useRef<Float32Array | null>(null);
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
  const [precisionMode, setPrecisionMode] = useState(false);
  const [dragInfo, setDragInfo] = useState<{ pct: number; time: number; snapped: boolean } | null>(null);
  const lastSnapRef = useRef<number | null>(null);
  const [redetecting, setRedetecting] = useState(false);
  const [deepProgress, setDeepProgress] = useState<LocalAlignmentProgress | null>(null);
  const deepAbortRef = useRef<AbortController | null>(null);
  const [deepErr, setDeepErr] = useState<string | null>(null);
  const [alignmentReview, setAlignmentReview] = useState<AlignmentReview | null>(null);
  const [alignmentReviewDismissed, setAlignmentReviewDismissed] = useState(false);
  const [reviewCursorVerse, setReviewCursorVerse] = useState<number | null>(null);
  const [looping, setLooping] = useState(false);
  const [viewportW, setViewportW] = useState(0);
  // True while WE set scrollLeft (playback follow / zoom recenter), so the scroll
  // handler doesn't treat our own scroll as the user scrubbing.
  const programmaticScrollRef = useRef(false);
  const trackWRef = useRef(0);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [wordTrimOpen, setWordTrimOpen] = useState(false);

  // ---- Undo / redo history for verse-timing edits ------------------------
  // Bounded stack; each entry is a deep copy of timings (splits is the only
  // nested array). Drag operations push ONCE on release (the start snapshot),
  // not on every pointermove — otherwise undo would step pixel-by-pixel.
  const historyRef = useRef<TimelineSnapshot[]>([]);
  const futureRef = useRef<TimelineSnapshot[]>([]);
  const dragSnapshotRef = useRef<TimelineSnapshot | null>(null);
  // Tick state so the Undo/Redo buttons re-render when history changes
  // (refs alone wouldn't trigger React updates).
  const [, setHistoryTick] = useState(0);
  const bumpHistory = () => setHistoryTick((n) => n + 1);

  const currentSnapshot = (): TimelineSnapshot => {
    const state = useAppStore.getState();
    return {
      timings: state.audioSource.mode === "imported" ? cloneVerseTimings(state.audioSource.timings) : [],
      selectedVerseNumbers: [...state.selectedVerseNumbers],
      currentVerseIndex: state.currentVerseIndex,
    };
  };

  const restoreSnapshot = (snapshot: TimelineSnapshot) => {
    const state = useAppStore.getState();
    state.setVerseTimings(cloneVerseTimings(snapshot.timings));
    state.setSelectedVerseNumbers(snapshot.selectedVerseNumbers);
    state.setCurrentVerseIndex(snapshot.currentVerseIndex);
  };

  const pushHistory = (snapshot: TimelineSnapshot) => {
    historyRef.current = appendTimelineSnapshot(historyRef.current, snapshot);
    futureRef.current = []; // a new action breaks the redo chain
    bumpHistory();
  };

  /** Apply new timings + (optionally) record the previous state for undo. */
  const commit = (next: VerseTiming[], record = true) => {
    if (record) {
      const cur = useAppStore.getState().audioSource;
      if (cur.mode === "imported") pushHistory(currentSnapshot());
    }
    useAppStore.getState().setVerseTimings(next);
  };

  const undo = () => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current = appendTimelineSnapshot(futureRef.current, currentSnapshot());
    restoreSnapshot(prev);
    bumpHistory();
  };

  const redo = () => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current = appendTimelineSnapshot(historyRef.current, currentSnapshot());
    restoreSnapshot(next);
    bumpHistory();
  };

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
        peaksRef.current = buildPeaks(buffer, 3000);
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

  // Fixed-centre model: the playhead line never moves — instead we scroll the
  // track so the current time sits under it, and reveal the gold "played"
  // waveform up to that point. Both are cheap enough to run every frame.
  const setPlayheadVisual = useCallback((pct: number) => {
    if (progressCanvasRef.current) {
      progressCanvasRef.current.style.clipPath = `inset(0 ${Math.max(0, 100 - pct)}% 0 0)`;
    }
    const cont = scrollRef.current;
    if (cont && trackWRef.current > 0) {
      programmaticScrollRef.current = true;
      cont.scrollLeft = (pct / 100) * trackWRef.current;
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    }
  }, []);

  // Draw the cached peaks into a canvas as centered mirror bars in one colour.
  const drawBars = (ctx: CanvasRenderingContext2D, W: number, H: number, color: string) => {
    const peaks = peaksRef.current;
    if (!peaks) return;
    ctx.fillStyle = color;
    const mid = H / 2;
    const n = peaks.length;
    for (let x = 0; x < W; x++) {
      const b0 = Math.floor((x / W) * n);
      const b1 = Math.min(n - 1, Math.floor(((x + 1) / W) * n));
      let peak = 0;
      for (let b = b0; b <= b1; b++) if (peaks[b] > peak) peak = peaks[b];
      const barH = Math.max(1, peak * H * 0.9);
      ctx.fillRect(x, mid - barH / 2, 1, barH);
    }
  };

  // ---- Two-colour waveform from cached peaks (redraws only on zoom/resize) ----
  // Base = dim parchment (unplayed); a stacked gold canvas (the "played" copy) is
  // revealed left-to-right by a clip-path that tracks the playhead — so playback
  // progress is shown without redrawing the canvas every frame. Detected pauses
  // (the silence gaps that define verse boundaries) are drawn as faint gold bands
  // so the user can see what they're segmenting on.
  const drawWaveform = useCallback(() => {
    const base = waveCanvasRef.current;
    const prog = progressCanvasRef.current;
    const track = trackRef.current;
    if (!base || !track || !peaksRef.current) return;
    const cssW = track.clientWidth;
    const cssH = track.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.min(MAX_CANVAS_W, Math.floor(cssW * dpr));
    const H = Math.floor(cssH * dpr);

    base.width = W;
    base.height = H;
    const bctx = base.getContext("2d");
    if (!bctx) return;
    bctx.clearRect(0, 0, W, H);
    // Faint gold bands at the detected silence centres — the pauses the auto-split
    // and snapping use, now visible instead of invisible drag targets.
    const dur = durationRef.current;
    if (dur > 0 && pausesRef.current.length) {
      bctx.fillStyle = "rgba(224,192,116,0.20)";
      const bandW = Math.max(1, Math.round(2 * dpr));
      for (const p of pausesRef.current) {
        const x = (p / dur) * W;
        bctx.fillRect(x - bandW / 2, 0, bandW, H);
      }
    }
    drawBars(bctx, W, H, "rgba(236,231,218,0.36)"); // parchment, unplayed

    if (prog) {
      prog.width = W;
      prog.height = H;
      const pctx = prog.getContext("2d");
      if (pctx) {
        pctx.clearRect(0, 0, W, H);
        drawBars(pctx, W, H, "rgba(201,162,75,0.9)"); // gold, played
      }
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

  // Measure the scroll viewport so we can size the fixed-center-playhead model:
  // the track is an explicit pixel width (viewport × zoom) with a half-viewport
  // pad on each end, so time 0 and the clip end can both reach the centre line.
  useEffect(() => {
    const cont = scrollRef.current;
    if (!cont) return;
    const measure = () => setViewportW(cont.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cont);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!decoded) return;
    requestAnimationFrame(() => {
      drawWaveform();
      // Reveal the played portion for the current playhead (non-zero after a
      // remount, e.g. toggling fullscreen mid-clip).
      const dur = durationRef.current;
      if (dur > 0) setPlayheadVisual((headTimeRef.current / dur) * 100);
    });
  }, [decoded, drawWaveform, setPlayheadVisual]);

  // ---- Shared player subscription: centre the track on the playhead ----
  // setPlayheadVisual already scrolls the track so the current time sits under
  // the fixed centre line, so no separate follow-scroll is needed.
  useEffect(() => {
    return importedPlayer.subscribe((time, isPlaying) => {
      setPlaying(isPlaying);
      setHeadTime(time);
      const dur = durationRef.current;
      if (dur > 0) setPlayheadVisual((time / dur) * 100);
    });
  }, [setPlayheadVisual]);

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
    if (dur > 0) setPlayheadVisual((t / dur) * 100);
    const segs = useAppStore.getState().audioSource;
    if (segs.mode === "imported") {
      const idx = segs.timings.findIndex((tm) => t >= tm.start && t < tm.end);
      if (idx >= 0 && idx !== useAppStore.getState().currentVerseIndex) {
        useAppStore.getState().setCurrentVerseIndex(idx);
      }
    }
  }, [setPlayheadVisual]);

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

  // Scroll = scrub. When the USER scrolls the track (drag / wheel / trackpad),
  // the time under the fixed centre line is scrollLeft / trackW × duration —
  // seek there. Our own scroll (playback follow, zoom recentre) is flagged so it
  // doesn't loop back into a seek.
  useEffect(() => {
    const cont = scrollRef.current;
    if (!cont) return;
    const onScroll = () => {
      const dur = durationRef.current;
      const tw = trackWRef.current || 1;
      const centerFrac = tw > 0 ? cont.scrollLeft / tw : 0;
      if (programmaticScrollRef.current || dur <= 0) return;
      const t = Math.min(dur, Math.max(0, centerFrac * dur));
      seek(t);
    };
    cont.addEventListener("scroll", onScroll, { passive: true });
    return () => cont.removeEventListener("scroll", onScroll);
  }, [seek]);

  // Keep zoom centred on the playhead: trackW changed, so re-scroll to keep the
  // current time under the centre line.
  useEffect(() => {
    const dur = durationRef.current;
    if (dur <= 0) return;
    setPlayheadVisual((headTimeRef.current / dur) * 100);
  }, [zoom, viewportW, setPlayheadVisual]);

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
      } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (e.code === "Delete" || e.code === "Backspace") {
        // Remove the selected verse (never the last one) — CapCut's Delete key.
        e.preventDefault();
        deleteVerse(useAppStore.getState().currentVerseIndex);
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
          commit(markAlignmentBoundaryReviewed(next, i + 1));
        }
      } else if (e.code === "KeyL" || e.code === "KeyR") {
        // L / R: pull the LEFT or RIGHT boundary of the verse under the playhead
        // to the playhead. L grows the previous (left) verse up to the playhead;
        // R pulls the next (right) verse's start back to the playhead (same edge
        // as plain S, but explicit and symmetric with L).
        e.preventDefault();
        const cur = useAppStore.getState().audioSource;
        if (cur.mode !== "imported") return;
        const t = importedPlayer.currentTime();
        const next = cur.timings.map((x) => ({ ...x }));
        const i = next.findIndex((s) => t >= s.start && t < s.end);
        if (i < 0) return;
        if (e.code === "KeyL" && i > 0) {
          const b = Math.max(next[i - 1].start + MIN_DUR, Math.min(next[i].end - MIN_DUR, t));
          next[i - 1].end = b;
          next[i].start = b;
          commit(markAlignmentBoundaryReviewed(next, i));
        } else if (e.code === "KeyR" && i < next.length - 1) {
          const b = Math.max(next[i].start + MIN_DUR, Math.min(next[i + 1].end - MIN_DUR, t));
          next[i].end = b;
          next[i + 1].start = b;
          commit(markAlignmentBoundaryReviewed(next, i + 1));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Editing commands only read refs/Zustand at invocation time; re-registering
    // this global handler on every timing mutation would interrupt shortcuts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, setHead]);

  // ---- Drag-to-pan the track (fixed-centre scrub) -------------------------
  // Touch scrolls the track natively; for mouse (which doesn't drag-scroll an
  // overflow container) we pan scrollLeft with the pointer. The scroll handler
  // then maps the new centre time and seeks — so dragging left/right scrubs.
  const panStartX = useRef(0);
  const panStartScroll = useRef(0);
  const panCaptureRef = useRef<{ element: HTMLElement; pointerId: number } | null>(null);
  const onPanMove = useCallback((e: PointerEvent) => {
    const cont = scrollRef.current;
    if (!cont) return;
    cont.scrollLeft = panStartScroll.current - (e.clientX - panStartX.current);
  }, []);
  const onPanEnd = useCallback(() => {
    const capture = panCaptureRef.current;
    if (capture?.element.hasPointerCapture(capture.pointerId)) {
      capture.element.releasePointerCapture(capture.pointerId);
    }
    panCaptureRef.current = null;
    window.removeEventListener("pointermove", onPanMove);
    window.removeEventListener("pointerup", onPanEnd);
    window.removeEventListener("pointercancel", onPanEnd);
  }, [onPanMove]);
  const pinchingRef = useRef(false);
  const startPan = (event: React.PointerEvent<HTMLElement>) => {
    const cont = scrollRef.current;
    if (!cont || pinchingRef.current) return;
    panStartX.current = event.clientX;
    panStartScroll.current = cont.scrollLeft;
    event.currentTarget.setPointerCapture(event.pointerId);
    panCaptureRef.current = { element: event.currentTarget, pointerId: event.pointerId };
    window.addEventListener("pointermove", onPanMove);
    window.addEventListener("pointerup", onPanEnd);
    window.addEventListener("pointercancel", onPanEnd);
  };

  // ---- Dragging block edges / bodies (snap to pauses; push neighbours) ----
  const applyDrag = useCallback((clientX: number, precision = false) => {
    const drag = dragRef.current;
    const dur = durationRef.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!drag || !rect || dur <= 0) return;
    let t = timelinePointerTime({
      clientX,
      trackLeft: rect.left,
      trackWidth: rect.width,
      duration: dur,
      precision,
      pointerStartX: drag.pointerStartX,
      initialTargetTime: drag.initialTargetTime,
    });

    // Snap a dragged edge onto a nearby pause OR the playhead (within ~10px) for
    // easy precision. The playhead lets you click the exact break point first,
    // then drag the boundary and it locks onto your cursor mark. On a fresh snap
    // we flash the guide and fire a light haptic tick — the CapCut "money detail"
    // for boundary work.
    let snapped = false;
    if (drag.kind !== "body") {
      const tolSec = (10 / rect.width) * dur;
      let bd = tolSec;
      let target: number | null = null;
      const candidates = [...pausesRef.current, headTimeRef.current];
      for (const p of candidates) {
        const d = Math.abs(p - t);
        if (d < bd) {
          bd = d;
          t = p;
          target = p;
        }
      }
      snapped = target !== null;
      if (snapped && lastSnapRef.current !== target) {
        navigator.vibrate?.(8); // light tick only on a NEW snap, not every frame
      }
      lastSnapRef.current = target;
    } else {
      lastSnapRef.current = null;
    }

    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const next = cur.timings.map((x) => ({ ...x }));
    const i = drag.index;
    const seg = next[i];
    if (!seg) return;

    let edgeTime = t;
    let reviewedBoundaryIndexes: number[] = [];
    if (drag.kind === "start") {
      const floor = i > 0 ? next[i - 1].start + MIN_DUR : 0;
      const s = Math.min(seg.end - MIN_DUR, Math.max(floor, t));
      if (i > 0 && s < next[i - 1].end) next[i - 1].end = s;
      seg.start = s;
      edgeTime = s;
      reviewedBoundaryIndexes = [i];
    } else if (drag.kind === "end") {
      const ceil = i < next.length - 1 ? next[i + 1].end - MIN_DUR : dur;
      const e = Math.max(seg.start + MIN_DUR, Math.min(ceil, t));
      if (i < next.length - 1 && e > next[i + 1].start) next[i + 1].start = e;
      seg.end = e;
      edgeTime = e;
      if (i < next.length - 1 && Math.abs(e - next[i + 1].start) < 1e-6) {
        reviewedBoundaryIndexes = [i + 1];
      }
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
      reviewedBoundaryIndexes = [i];
    }
    // Drag mutations don't record history per frame; the start snapshot is
    // pushed on release so undo restores to the pre-drag state in one step.
    const reviewed = reviewedBoundaryIndexes.reduce(
      (result, boundaryIndex) => markAlignmentBoundaryReviewed(result, boundaryIndex),
      next,
    );
    commit(reviewed, false);
    setDragInfo({ pct: (edgeTime / dur) * 100, time: edgeTime, snapped });
    // commit reads the current Zustand snapshot and stable history refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDragMove = useCallback(
    (e: PointerEvent) => applyDrag(e.clientX, precisionMode || e.shiftKey || e.altKey),
    [applyDrag, precisionMode]
  );
  const dragCaptureRef = useRef<{ element: Element; pointerId: number } | null>(null);
  const onDragEnd = useCallback(() => {
    // Push the pre-drag snapshot so undo rewinds the entire drag in one step.
    if (dragSnapshotRef.current) {
      pushHistory(dragSnapshotRef.current);
      dragSnapshotRef.current = null;
    }
    dragRef.current = null;
    tapDownRef.current = null;
    setDragInfo(null);
    const capture = dragCaptureRef.current;
    if (capture?.element.hasPointerCapture(capture.pointerId)) {
      capture.element.releasePointerCapture(capture.pointerId);
    }
    dragCaptureRef.current = null;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    // pushHistory only mutates stable refs; keeping this listener stable avoids
    // removing a different pointerup callback mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDragMove]);

  // Tracks the pointer-down on a verse body so we can distinguish a tap (no
  // movement) from a drag (movement). On tap-up over the ACTIVE verse, the
  // pointer position becomes an intra-verse split — no playhead positioning,
  // no Split button needed.
  const tapDownRef = useRef<{ x: number; t: number; idx: number } | null>(null);

  const startDrag = (index: number, kind: DragKind, splitIdx?: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pinchingRef.current) return;
    const seg = timings[index];
    const t = pxToTime(e.clientX);
    const initialTargetTime = kind === "end"
      ? seg.end
      : kind === "split"
        ? seg.splits?.[splitIdx ?? 0] ?? t
        : kind === "body"
          ? t
          : seg.start;
    // Snapshot for undo — anything mutated during this drag rewinds in one step.
    dragSnapshotRef.current = currentSnapshot();
    dragRef.current = {
      index,
      kind,
      splitIdx,
      grabOffset: kind === "body" ? t - seg.start : 0,
      pointerStartX: e.clientX,
      initialTargetTime,
    };
    if (kind === "body") {
      tapDownRef.current = { x: e.clientX, t: performance.now(), idx: index };
      // Only seek when activating a different verse. Re-tapping the active one
      // should not yank the playhead away from where the user is editing.
      if (store.currentVerseIndex !== index) {
        store.setCurrentVerseIndex(index);
        seek(seg.start);
      }
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragCaptureRef.current = { element: e.currentTarget, pointerId: e.pointerId };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
  };

  // Two-finger pinch zoom for phones and tablets. The first touch can begin a
  // normal pan/drag; the second converts the gesture into zoom and safely ends
  // that pending edit before changing scale.
  const pinchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const pinchDistance = () => {
    const points = [...pinchPointersRef.current.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };
  const onTimelinePointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    pinchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchPointersRef.current.size === 2) {
      pinchingRef.current = true;
      pinchStartRef.current = { distance: Math.max(1, pinchDistance()), zoom };
      onPanEnd();
      if (dragRef.current) onDragEnd();
    }
  };
  const onTimelinePointerMoveCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !pinchPointersRef.current.has(event.pointerId)) return;
    pinchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const start = pinchStartRef.current;
    if (!start || pinchPointersRef.current.size < 2) return;
    event.preventDefault();
    setZoom(pinchZoom({
      startZoom: start.zoom,
      startDistance: start.distance,
      currentDistance: pinchDistance(),
    }));
  };
  const onTimelinePointerEndCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    pinchPointersRef.current.delete(event.pointerId);
    if (pinchPointersRef.current.size < 2) {
      pinchingRef.current = false;
      pinchStartRef.current = null;
    }
  };

  // Tap-up on the active verse → split at the tapped position. Cancels if the
  // pointer moved (that's a drag) or the tap wasn't on the already-active card
  // (first tap activates, second tap splits).
  const onBodyPointerUp = (index: number) => (e: React.PointerEvent) => {
    const down = tapDownRef.current;
    tapDownRef.current = null;
    if (!down) return;
    if (down.idx !== index) return;
    if (Math.abs(e.clientX - down.x) > 5) return; // movement → was a drag
    if (performance.now() - down.t > 400) return; // long press, ignore
    if (index !== activeIdx) return; // first tap activates, second splits
    const t = pxToTime(e.clientX);
    addSplitAt(t);
    seek(t); // park playhead at the split so the preview can confirm
  };

  // Core: insert a split at an arbitrary time inside the active verse. The
  // playhead-button version (Split at playhead, Shift+S) and the tap-to-split
  // both funnel through here. The verse's text divides proportionally so a
  // long ayah can change on-screen text mid-recitation without breaking the
  // ayah itself.
  const addSplitAt = (time: number) => {
    const state = useAppStore.getState();
    const cur = state.audioSource;
    if (cur.mode !== "imported") return;
    const i = state.currentVerseIndex;
    const seg = cur.timings[i];
    if (!seg) return;
    const verse = state.verses.find((v) => v.verse_number === seg.verseNumber);
    if (!verse) return;
    const words = verse.text_uthmani.split(/\s+/).filter(Boolean);
    const dur = seg.end - seg.start;
    if (dur <= 0 || words.length < 4) return; // need room for 2 words on each side

    // Map the tap time to a word index, then snap to a boundary. Each resulting
    // segment must contain at least 2 whole words — single-word chunks read as
    // typos in motion. Existing splits define which sub-range we're in.
    const MIN_WORDS_PER_SEG = 2;
    const fraction = Math.max(0, Math.min(1, (time - seg.start) / dur));
    const existingWIdx = (seg.splits ?? []).map((sp) =>
      Math.round(((sp - seg.start) / dur) * words.length)
    );
    const sorted = [...existingWIdx].sort((a, b) => a - b);
    let lo = 0;
    let hi = words.length;
    for (const w of sorted) {
      if (w <= Math.round(fraction * words.length)) lo = w;
      else { hi = w; break; }
    }
    const minWIdx = lo + MIN_WORDS_PER_SEG;
    const maxWIdx = hi - MIN_WORDS_PER_SEG;
    if (minWIdx > maxWIdx) return; // sub-range too short to split with 2+2 words
    const desired = Math.round(fraction * words.length);
    const wIdx = Math.max(minWIdx, Math.min(maxWIdx, desired));
    if (existingWIdx.includes(wIdx)) return;

    const snappedTime = seg.start + (wIdx / words.length) * dur;
    const oldSplits = seg.splits ?? [];
    const oldWords = seg.splitWords ?? oldSplits.map((sp) =>
      Math.round(((sp - seg.start) / dur) * words.length)
    );
    const combined = oldSplits.map((sp, j) => ({ t: sp, w: oldWords[j] }));
    combined.push({ t: snappedTime, w: wIdx });
    combined.sort((a, b) => a.t - b.t);
    const next = cur.timings.map((x) => ({ ...x }));
    next[i] = {
      ...next[i],
      splits: combined.map((c) => c.t),
      splitWords: combined.map((c) => c.w),
      splitWordTotal: words.length,
    };
    commit(next);
  };

  const addSplit = () => addSplitAt(headTimeRef.current);

  const removeSplit = (verseIdx: number, splitIdx: number) => {
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
  };

  // ---- Word-range trim (pick a contiguous slice of the verse's words) -----
  // Used to clip "half of the verse": the displayed text and the audio shrink
  // to only the chosen word range, everything outside becomes a skipped gap.
  const setVerseWordRange = (verseIdx: number, from: number, to: number) => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const verses = useAppStore.getState().verses;
    const target = cur.timings[verseIdx];
    if (!target) return;
    const verse = verses.find((v) => v.verse_number === target.verseNumber);
    if (!verse) return;
    const wc = verse.text_uthmani.split(/\s+/).filter(Boolean).length;
    if (wc <= 0) return;
    const lo = Math.max(0, Math.min(wc - 1, from));
    const hi = Math.max(lo, Math.min(wc - 1, to));
    const isFullRange = lo === 0 && hi === wc - 1;
    const next = cur.timings.map((x) => ({ ...x }));
    next[verseIdx] = {
      ...next[verseIdx],
      // Storing the full range would be noise — drop the field instead.
      wordRange: isFullRange ? undefined : { from: lo, to: hi },
    };
    commit(next);
  };

  const clearVerseWordRange = (verseIdx: number) => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const next = cur.timings.map((x) => ({ ...x }));
    if (!next[verseIdx]) return;
    next[verseIdx] = { ...next[verseIdx], wordRange: undefined };
    commit(next);
  };

  // ---- Duplicate a verse so the same ayah appears twice on the timeline ----
  // If there's free audio after the source (e.g. the recording says the verse
  // twice), the copy fills that gap. Otherwise the source's own time is split
  // in half and both copies sit side by side — combine with word-trim and you
  // get "first half" + "second half" of a long ayah as separate cards.
  const duplicateVerse = (verseIdx: number) => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported") return;
    const dur = durationRef.current;
    const source = cur.timings[verseIdx];
    if (!source) return;
    const sourceLen = source.end - source.start;
    if (sourceLen < MIN_DUR * 2) return; // too short to host a copy

    const nextStart =
      verseIdx + 1 < cur.timings.length ? cur.timings[verseIdx + 1].start : dur;
    const freeAfter = nextStart - source.end;

    let newSource: VerseTiming;
    let copy: VerseTiming;

    if (freeAfter >= MIN_DUR * 2) {
      // Plenty of free time after the source → put the copy there.
      newSource = source;
      copy = {
        verseNumber: source.verseNumber,
        start: source.end,
        end: Math.min(dur, source.end + Math.min(sourceLen, freeAfter)),
        wordRange: source.wordRange ? { ...source.wordRange } : undefined,
      };
    } else {
      // No room → split the source's own time range in half. Splits are dropped
      // on both copies because their original positions no longer make sense.
      const mid = source.start + sourceLen / 2;
      newSource = { ...source, end: mid, splits: undefined, splitWords: undefined, splitWordTotal: undefined };
      copy = {
        verseNumber: source.verseNumber,
        start: mid,
        end: source.end,
        wordRange: source.wordRange ? { ...source.wordRange } : undefined,
      };
    }

    const next = [
      ...cur.timings.slice(0, verseIdx),
      newSource,
      copy,
      ...cur.timings.slice(verseIdx + 1),
    ];
    commit(next);
    // Activate the new copy so any follow-up edits land on it.
    useAppStore.getState().setCurrentVerseIndex(verseIdx + 1);
  };

  // Remove a mis-detected verse from the timeline. History snapshots include
  // selection and active index as well as timings, so deletion is safely
  // reversible without desynchronising preview/export state.
  const deleteVerse = (verseIdx: number) => {
    const cur = useAppStore.getState().audioSource;
    if (cur.mode !== "imported" || cur.timings.length <= 1) return;
    pushHistory(currentSnapshot());
    useAppStore.getState().deleteImportedVerse(verseIdx);
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
    let reviewedBoundaryIndex = kind === "start" ? i : -1;
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
      if (i < next.length - 1 && Math.abs(e - next[i + 1].start) < 1e-6) {
        reviewedBoundaryIndex = i + 1;
      }
    }
    commit(markAlignmentBoundaryReviewed(next, reviewedBoundaryIndex));
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
    commit(next);
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
        e.preventDefault();
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
    const verseNumbers = verseNumbersForAlignment(cur.timings);
    if (verseNumbers.length === 0) return;
    setRedetecting(true);
    try {
      await loadCorpus();
      const weights = getVerseWeights(surahId, verseNumbers[0], verseNumbers[verseNumbers.length - 1]);
      const diagnostics = verseNumbers.map((verseNumber) => ({
        verseNumber,
        agreementSeconds: null,
        confidence: "low" as const,
      }));
      const aligned = attachAlignmentDiagnostics(
        autoSegment(buf, verseNumbers, weights),
        "pause",
        diagnostics,
      );
      commit(applyAlignedTimingsToRows(cur.timings, aligned));
      setDeepErr(null);
      const review = buildAlignmentReview("pause", diagnostics);
      setAlignmentReview(review);
      setAlignmentReviewDismissed(false);
      setReviewCursorVerse(review.reviewVerseNumbers[0] ?? null);
    } finally {
      setRedetecting(false);
    }
  };

  // Re-run speech recognition and map each verse's words onto the audio's word
  // onsets — most accurate for run-on recitation with few pauses.
  const deepAlign = async () => {
    const buf = bufferRef.current;
    const state = useAppStore.getState();
    const cur = state.audioSource;
    const surahId = state.surah?.id;
    if (!buf || cur.mode !== "imported" || !surahId) return;
    const verseNumbers = verseNumbersForAlignment(cur.timings);
    if (verseNumbers.length === 0) return;
    deepAbortRef.current?.abort();
    const controller = new AbortController();
    deepAbortRef.current = controller;
    setDeepErr(null);
    setDeepProgress({ stage: "prepare", detail: "Preparing the imported audio" });
    try {
      const result = await alignImportedAudio({
        buffer: buf,
        surah: surahId,
        verseNumbers,
        signal: controller.signal,
        deviceMemoryGb: browserDeviceMemoryGb(),
        onModelProgress: (loaded, total) => setDeepProgress(
          total
            ? {
              stage: "listen",
              detail: "Downloading the local recognition model",
              percent: Math.round((loaded / total) * 100),
            }
            : { stage: "listen", detail: "Listening for ayah transitions locally" }
        ),
      });
      setDeepProgress({ stage: "align", detail: "Placing and checking ayah boundaries" });
      commit(applyAlignedTimingsToRows(cur.timings, result.timings));
      const review = buildAlignmentReview(result.method, result.boundaryDiagnostics);
      setAlignmentReview(review);
      setAlignmentReviewDismissed(false);
      setReviewCursorVerse(review.reviewVerseNumbers[0] ?? null);
      setDeepErr(null);
    } catch (error) {
      setDeepErr(alignmentFailureMessage(error));
    } finally {
      if (deepAbortRef.current === controller) {
        deepAbortRef.current = null;
        setDeepProgress(null);
      }
    }
  };

  const cancelDeepAlign = () => {
    setDeepProgress((current) => ({
      stage: current?.stage ?? "listen",
      detail: "Cancelling alignment",
      percent: current?.percent,
    }));
    deepAbortRef.current?.abort();
  };

  useEffect(() => () => deepAbortRef.current?.abort(), []);

  if (!imported || timings.length === 0) return null;

  const persistedAlignmentReview = alignmentReviewDismissed
    ? null
    : buildPersistedAlignmentReview(timings);
  const activeAlignmentReview = alignmentReview ?? persistedAlignmentReview;
  const visibleAlignmentReview = activeAlignmentReview
    ? alignmentReviewProgress(activeAlignmentReview, timings)
    : null;
  const reviewVerses = visibleAlignmentReview?.reviewVerseNumbers ?? [];
  const requestedReviewIndex = reviewCursorVerse == null
    ? -1
    : reviewVerses.indexOf(reviewCursorVerse);
  const reviewIndex = reviewVerses.length === 0
    ? -1
    : requestedReviewIndex >= 0 ? requestedReviewIndex : 0;
  const reviewVerse = reviewIndex >= 0 ? reviewVerses[reviewIndex] : null;
  const reviewRowIndex = reviewVerse == null
    ? -1
    : timings.findIndex((timing) =>
        timing.verseNumber === reviewVerse &&
        timing.alignmentReviewed !== true &&
        (timing.alignmentConfidence === "medium" || timing.alignmentConfidence === "low"));
  const reviewTiming = reviewRowIndex >= 0 ? timings[reviewRowIndex] : null;

  const focusReviewBoundary = (verseNumber: number, listen = false) => {
    const rowIndex = timings.findIndex((timing) =>
      timing.verseNumber === verseNumber &&
      timing.alignmentReviewed !== true &&
      (timing.alignmentConfidence === "medium" || timing.alignmentConfidence === "low"));
    const timing = rowIndex >= 0 ? timings[rowIndex] : null;
    if (!timing) return;
    setReviewCursorVerse(verseNumber);
    store.setCurrentVerseIndex(rowIndex);
    const leadIn = Math.max(0, timing.start - (listen ? 1.15 : 0));
    seek(leadIn);
    if (listen && url && !importedPlayer.isPlaying()) importedPlayer.play(url);
  };

  const moveReviewCursor = (direction: -1 | 1) => {
    if (reviewVerses.length === 0) return;
    const nextIndex = (Math.max(0, reviewIndex) + direction + reviewVerses.length) % reviewVerses.length;
    focusReviewBoundary(reviewVerses[nextIndex]);
  };

  const markCurrentReviewChecked = () => {
    if (reviewRowIndex < 0) return;
    const nextVerse = reviewVerses.length > 1
      ? reviewVerses[(reviewIndex + 1) % reviewVerses.length]
      : null;
    commit(markAlignmentBoundaryReviewed(timings, reviewRowIndex));
    setReviewCursorVerse(nextVerse);
    if (nextVerse != null) {
      const nextRowIndex = timings.findIndex((timing) => timing.verseNumber === nextVerse);
      if (nextRowIndex >= 0) {
        store.setCurrentVerseIndex(nextRowIndex);
        seek(timings[nextRowIndex].start);
      }
    }
  };
  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

  // Fixed-center geometry: an explicit-pixel track (viewport × zoom) padded by
  // half a viewport on each side. scrollLeft = fraction × trackW then centres the
  // matching time under the fixed playhead line (see setPlayheadVisual).
  const vw = viewportW || 1;
  const trackW = Math.max(vw, Math.round(vw * zoom));
  const padPx = Math.round((viewportW || 0) / 2);
  trackWRef.current = trackW;
  const activeIdx = store.currentVerseIndex;
  const tickStep = duration > 240 ? 30 : duration > 90 ? 10 : 5;
  const tickCount = duration > 0 ? Math.min(200, Math.floor(duration / tickStep) + 1) : 0;
  const busy = redetecting || deepProgress != null;

  return (
    <div className="space-y-4">
      {/* Primary transport — the controls used 80% of the time stay in front.
          Pause rebuild, recitation alignment, and trim live in a collapsible cluster. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={loading || duration === 0}
          className="btn-gold flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40 sm:h-10 sm:w-10"
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
          className={`flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[11px] transition-colors disabled:opacity-40 sm:min-h-9 ${
            looping ? "bg-[var(--gold)] text-[var(--ink-deep)]" : "btn-ghost"
          }`}
          title="Loop the selected verse to fine-tune its start/end by ear"
        >
          <TlIcon d={TL_ICON.loop} /> Loop verse
        </button>

        {/* Undo / Redo — paired buttons next to the transport so the user
            never has to hunt for them. Disabled state reads naturally. */}
        <div className="flex items-center">
          <button
            onClick={undo}
            disabled={historyRef.current.length === 0}
            className="btn-ghost flex h-11 w-11 items-center justify-center rounded-l-full border-r-0 text-[13px] disabled:opacity-30 sm:h-9 sm:w-9"
            aria-label="Undo last timeline edit"
            title="Undo (⌘Z)"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v6h6M3 13a9 9 0 1 0 3-6.7" />
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={futureRef.current.length === 0}
            className="btn-ghost flex h-11 w-11 items-center justify-center rounded-r-full text-[13px] disabled:opacity-30 sm:h-9 sm:w-9"
            aria-label="Redo timeline edit"
            title="Redo (⌘⇧Z)"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7v6h-6M21 13a9 9 0 1 1-3-6.7" />
            </svg>
          </button>
        </div>

        <span className="tabular-nums text-[13px] text-[var(--muted)]">
          {fmt(headTime)} <span className="text-[var(--muted-deep)]">/ {fmt(duration)}</span>
        </span>

        {/* Right cluster: Tools toggle + zoom */}
        <div className="ml-auto flex items-center gap-2.5 max-sm:ml-0 max-sm:w-full max-sm:justify-between">
          <button
            onClick={() => setToolsOpen((v) => !v)}
            disabled={loading || duration === 0}
            className={`flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[11px] transition-colors disabled:opacity-40 sm:min-h-9 ${
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
          <button
            onClick={() => setPrecisionMode((value) => !value)}
            aria-pressed={precisionMode}
            className={`flex min-h-11 items-center rounded-full border px-3 text-[11px] transition-colors sm:min-h-9 ${
              precisionMode
                ? "border-gold/50 bg-gold/10 text-parchment"
                : "border-[var(--hairline)] text-[var(--muted)] hover:border-gold hover:text-parchment"
            }`}
            title="Slow boundary and split dragging for precise adjustments (Shift also works)"
          >
            Precision
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const tm = timings[activeIdx];
                const span = tm ? tm.end - tm.start : 0;
                if (span > 0 && duration > 0) {
                  setZoom(Math.min(24, Math.max(1, +((duration / span) * 0.8).toFixed(2))));
                  seek((tm.start + tm.end) / 2);
                }
              }}
              disabled={loading || duration === 0}
              className="hidden h-9 items-center gap-1.5 rounded-full border border-[var(--hairline)] px-3 text-[11px] text-parchment transition-colors hover:border-gold disabled:opacity-30 sm:flex"
              title="Zoom to the selected verse"
            >
              <TlIcon d={TL_ICON.focus} className="h-3.5 w-3.5" /> Focus
            </button>
            <button
              onClick={() => setZoom(1)}
              disabled={zoom <= 1}
              className="hidden h-9 items-center rounded-full border border-[var(--hairline)] px-3 text-[11px] text-parchment transition-colors hover:border-gold disabled:opacity-30 sm:flex"
              title="Fit the whole clip"
            >
              Fit
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(1, +(z / 1.5).toFixed(2)))}
              disabled={zoom <= 1}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment hover:border-gold disabled:opacity-30 sm:h-9 sm:w-9"
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
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hairline)] text-parchment hover:border-gold disabled:opacity-30 sm:h-9 sm:w-9"
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
            className="btn-gold flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] disabled:opacity-40 sm:min-h-9"
            title="Rebuild every verse boundary from the recitation's pauses"
          >
            {redetecting ? "Rebuilding…" : <><TlIcon d={TL_ICON.refresh} /> Rebuild from pauses</>}
          </button>
          <button
            onClick={deepAlign}
            disabled={busy || loading}
            className="btn-ghost min-h-11 rounded-full px-3 text-[11px] disabled:opacity-40 sm:min-h-9"
            title="Re-run speech recognition to align each verse's words to the audio (best for run-on recitation)"
          >
            Align by recitation
          </button>
          <span className="mx-1 h-4 w-px bg-[var(--hairline)]" />
          <button
            onClick={() => trimTo("start")}
            disabled={loading || duration === 0}
            className="btn-ghost flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] disabled:opacity-40 sm:min-h-9"
            title="Delete everything before the playhead"
          >
            <TlIcon d={TL_ICON.trimStart} /> Trim start
          </button>
          <button
            onClick={() => trimTo("end")}
            disabled={loading || duration === 0}
            className="btn-ghost flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] disabled:opacity-40 sm:min-h-9"
            title="Delete everything after the playhead"
          >
            Trim end <TlIcon d={TL_ICON.trimEnd} />
          </button>
          <span className="ml-auto hidden text-[10px] text-[var(--muted-deep)] sm:inline">
            Rebuild from pauses or align to the recited words
          </span>
        </div>
      )}

      {deepProgress && (
        <AlignmentProgress
          progress={deepProgress}
          onCancel={cancelDeepAlign}
        />
      )}

      {deepErr && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 text-[11px] text-gold-soft"
        >
          <span className="leading-relaxed">{deepErr}</span>
          <button
            onClick={() => setDeepErr(null)}
            aria-label="Dismiss"
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gold-soft/60 transition-colors hover:bg-white/[0.04] hover:text-gold-soft sm:h-9 sm:w-9"
          >
            <TlIcon d={TL_ICON.x} className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {visibleAlignmentReview && reviewTiming ? (
        <section
          aria-label="Alignment boundary review"
          className="rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-3"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/80">
                Boundary review · {reviewIndex + 1} of {reviewVerses.length}
              </p>
              <p className="mt-1 text-xs font-medium text-amber-50">
                Before ayah {reviewTiming.verseNumber} at {fmt(reviewTiming.start)}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-amber-100/65">
                {visibleAlignmentReview.methodLabel} marked this cut {reviewTiming.alignmentConfidence}. Listen across the transition, drag the amber edge if needed, then mark it checked.
              </p>
            </div>
            <button
              onClick={() => {
                setAlignmentReview(null);
                setAlignmentReviewDismissed(true);
              }}
              aria-label="Dismiss alignment review"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-amber-100/50 hover:bg-white/[0.05] hover:text-amber-100"
            >
              <TlIcon d={TL_ICON.x} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
            <button type="button" onClick={() => moveReviewCursor(-1)} className="btn-ghost min-h-10 rounded-lg px-3 text-[11px] disabled:opacity-40" disabled={reviewVerses.length < 2}>Previous</button>
            <button type="button" onClick={() => focusReviewBoundary(reviewTiming.verseNumber, true)} className="btn-ghost min-h-10 rounded-lg px-3 text-[11px]">Listen across cut</button>
            <button type="button" onClick={markCurrentReviewChecked} className="min-h-10 rounded-lg bg-amber-300 px-3 text-[11px] font-semibold text-[var(--ink-deep)] hover:bg-amber-200">Mark checked</button>
            <button type="button" onClick={() => moveReviewCursor(1)} className="btn-ghost min-h-10 rounded-lg px-3 text-[11px] disabled:opacity-40" disabled={reviewVerses.length < 2}>Next</button>
          </div>
        </section>
      ) : visibleAlignmentReview ? (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-soft/25 bg-emerald-soft/10 px-3 py-2 text-[11px] text-emerald-soft">
          <span className="leading-relaxed">{visibleAlignmentReview.message}</span>
          <button onClick={() => {
            setAlignmentReview(null);
            setAlignmentReviewDismissed(true);
          }} aria-label="Dismiss alignment report" className="ml-auto flex h-9 w-9 items-center justify-center rounded-full opacity-60 hover:bg-white/[0.04] hover:opacity-100"><TlIcon d={TL_ICON.x} /></button>
        </div>
      ) : null}

      {/* Selected-verse inspector — one quiet strip with breathing room.
          Each time is its own button: click to snap that boundary to the
          playhead. No repeated "at playhead" labels. */}
      {timings[activeIdx] && (() => {
        const v = timings[activeIdx];
        const len = Math.max(0, v.end - v.start);
        const splitCount = v.splits?.length ?? 0;
        const segCount = splitCount + 1;
        const activeVerse = store.verses.find((vv) => vv.verse_number === v.verseNumber);
        const totalWords = activeVerse
          ? activeVerse.text_uthmani.split(/\s+/).filter(Boolean).length
          : 0;
        const range = v.wordRange ?? { from: 0, to: Math.max(0, totalWords - 1) };
        const isTrimmed = !!v.wordRange;
        return (
          <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] px-4 py-2.5">
            <span
              className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md bg-[var(--gold)]/15 px-2 text-[12px] font-medium tabular-nums text-gold-soft ring-1 ring-inset ring-[var(--hairline)]"
              title={`Verse ${v.verseNumber} of this clip`}
            >
              {v.verseNumber}
            </span>

            <div className="flex items-center gap-2 text-[12px] tabular-nums">
              <button
                onClick={() => setBoundaryToHead("start")}
                className="inline-flex min-h-11 items-center rounded px-1 text-parchment underline-offset-4 transition-colors hover:text-gold hover:underline sm:min-h-7"
                title="Click to set this verse's start at the playhead"
              >
                {fmt(v.start)}
              </button>
              <span className="text-[var(--muted-deep)]">→</span>
              <button
                onClick={() => setBoundaryToHead("end")}
                className="inline-flex min-h-11 items-center rounded px-1 text-parchment underline-offset-4 transition-colors hover:text-gold hover:underline sm:min-h-7"
                title="Click to set this verse's end at the playhead"
              >
                {fmt(v.end)}
              </button>
              <span className="text-[var(--muted-deep)]">({fmt(len)})</span>
            </div>

            <button
              onClick={addSplit}
              className="btn-ghost flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] sm:min-h-7"
              title="Split this verse's text at the playhead (for long verses)"
            >
              <TlIcon d={TL_ICON.scissors} /> Split
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

            <button
              onClick={() => setWordTrimOpen((o) => !o)}
              disabled={totalWords < 2}
              aria-expanded={wordTrimOpen}
              className={`btn-ghost flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] disabled:opacity-40 sm:min-h-7 ${
                isTrimmed ? "ring-1 ring-emerald-soft/50 text-emerald-soft" : ""
              }`}
              title="Keep only a contiguous range of this verse's words"
            >
              <TlIcon d={TL_ICON.type} /> Words {isTrimmed && `· ${range.to - range.from + 1}/${totalWords}`}
            </button>

            <button
              onClick={() => duplicateVerse(activeIdx)}
              className="btn-ghost flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] sm:min-h-7"
              title="Duplicate this verse so the same ayah appears twice on the timeline"
            >
              <TlIcon d={TL_ICON.copy} /> Duplicate
            </button>

            <button
              onClick={() => deleteVerse(activeIdx)}
              disabled={timings.length <= 1}
              className="btn-ghost flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] transition-colors hover:border-[var(--gold)] hover:text-gold-soft disabled:opacity-30 sm:min-h-7"
              title="Remove this verse from the clip"
            >
              <TlIcon d={TL_ICON.trash} /> Delete
            </button>

            {wordTrimOpen && totalWords >= 2 && (
              <div
                role="dialog"
                aria-label="Trim verse words"
                className="absolute top-full left-0 right-0 z-40 mt-1.5 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-gold-soft/80">
                    Trim verse words
                  </span>
                  <span className="text-[10px] tabular-nums text-[var(--muted-deep)]">
                    {totalWords} words total
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                    From
                    <input
                      type="number"
                      min={1}
                      max={range.to + 1}
                      value={range.from + 1}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(totalWords, parseInt(e.target.value) || 1));
                        setVerseWordRange(activeIdx, n - 1, range.to);
                      }}
                      className="field h-11 w-16 px-2 text-center text-[12px] tabular-nums sm:h-7 sm:w-14"
                    />
                  </label>
                  <span className="text-[var(--muted-deep)]">→</span>
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                    To
                    <input
                      type="number"
                      min={range.from + 1}
                      max={totalWords}
                      value={range.to + 1}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(totalWords, parseInt(e.target.value) || totalWords));
                        setVerseWordRange(activeIdx, range.from, n - 1);
                      }}
                      className="field h-11 w-16 px-2 text-center text-[12px] tabular-nums sm:h-7 sm:w-14"
                    />
                  </label>
                  <span className="text-[11px] text-emerald-soft/80 tabular-nums">
                    keeps {range.to - range.from + 1} of {totalWords}
                  </span>
                  {isTrimmed && (
                    <button
                      onClick={() => clearVerseWordRange(activeIdx)}
                      className="min-h-11 rounded-full px-2 text-[11px] text-[var(--muted)] underline-offset-4 hover:bg-white/[0.04] hover:text-parchment hover:underline sm:min-h-7"
                    >
                      Reset to full verse
                    </button>
                  )}
                </div>
                <p
                  dir="rtl"
                  className="font-arabic mt-3 max-h-24 overflow-y-auto rounded-md bg-[var(--ink-deep)] p-3 text-[15px] leading-loose text-parchment ring-1 ring-[var(--hairline-soft)]"
                >
                  {(() => {
                    if (!activeVerse) return null;
                    const allWords = activeVerse.text_uthmani.split(/\s+/).filter(Boolean);
                    return allWords.map((w, i) => {
                      const kept = i >= range.from && i <= range.to;
                      return (
                        <span
                          key={i}
                          className={kept ? "text-parchment" : "text-[var(--muted-deep)] opacity-50"}
                        >
                          {w}{i < allWords.length - 1 ? " " : ""}
                        </span>
                      );
                    });
                  })()}
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {loading && <p className="text-[11px] text-[var(--muted-deep)]">Loading waveform…</p>}

      {/* Scroll viewport — fixed-centre model: the content is an explicit-pixel
          track padded by half a viewport each side, and it scrolls under a
          stationary centre playhead (below). Drag / wheel / trackpad to scrub. */}
      <div className="relative">
      <div
        ref={scrollRef}
        onPointerDownCapture={onTimelinePointerDownCapture}
        onPointerMoveCapture={onTimelinePointerMoveCapture}
        onPointerUpCapture={onTimelinePointerEndCapture}
        onPointerCancelCapture={onTimelinePointerEndCapture}
        role="region"
        aria-label="Timeline waveform. Drag to scrub, pinch to zoom."
        className="overflow-x-auto overflow-y-hidden overscroll-x-contain"
      >
        <div className="flex">
        <div className="shrink-0" style={{ width: padPx }} aria-hidden />
        <div className="shrink-0" style={{ width: trackW }}>
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
                startPan(e); // drag left/right to scrub (scroll under the centre line)
              }
            }}
            className={`relative cursor-ew-resize touch-none overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--ink-deep)] ${
              fullscreen ? "h-[clamp(180px,38dvh,420px)]" : "h-24"
            }`}
          >
            <canvas
              ref={waveCanvasRef}
              data-wave="1"
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            {/* Gold "played" copy, revealed left-to-right by a clip-path that
                tracks the playhead (updated in setPlayheadVisual). */}
            <canvas
              ref={progressCanvasRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{ clipPath: "inset(0 100% 0 0)" }}
            />

            {/* Verse segment blocks — each split part is its own block.
                Shared edges between parts of the same verse are split handles;
                outer edges are the verse start/end. */}
            {(() => {
              const PART_LETTERS = "abcdefghijklmnopqrstuvwxyz";
              const segs: {
                tIdx: number; pIdx: number; total: number;
                vn: number; s: number; e: number;
              }[] = [];
              for (let i = 0; i < timings.length; i++) {
                const t = timings[i];
                const pts = [t.start, ...(t.splits ?? []), t.end];
                for (let p = 0; p < pts.length - 1; p++) {
                  segs.push({ tIdx: i, pIdx: p, total: pts.length - 1, vn: t.verseNumber, s: pts[p], e: pts[p + 1] });
                }
              }
              return segs.map((seg, idx) => {
                const left = pct(seg.s);
                const width = Math.max(0.4, pct(seg.e) - left);
                const active = seg.tIdx === activeIdx;
                const isFirst = seg.pIdx === 0;
                const isLast = seg.pIdx === seg.total - 1;
                const multiPart = seg.total > 1;
                const label = multiPart ? `${seg.vn}${PART_LETTERS[seg.pIdx] ?? seg.pIdx}` : `${seg.vn}`;
                const leftDrag = isFirst ? "start" as DragKind : "split" as DragKind;
                const leftSplitIdx = isFirst ? undefined : seg.pIdx - 1;
                const rightDrag = isLast ? "end" as DragKind : "split" as DragKind;
                const rightSplitIdx = isLast ? undefined : seg.pIdx;
                const isReferenceBoundary = isFirst && seg.tIdx > 0 &&
                  timings[seg.tIdx - 1]?.verseNumber !== seg.vn;
                const needsReview = isReferenceBoundary &&
                  timings[seg.tIdx]?.alignmentReviewed !== true &&
                  (visibleAlignmentReview?.reviewVerseNumbers.includes(seg.vn) ||
                    timings[seg.tIdx]?.alignmentConfidence === "medium" ||
                    timings[seg.tIdx]?.alignmentConfidence === "low");
                return (
                  <div
                    key={`seg-${seg.tIdx}-${seg.pIdx}`}
                    className={`group absolute top-1 bottom-1 transition-colors ${
                      isFirst && isLast ? "rounded-md" : isFirst ? "rounded-l-md rounded-r-[2px]" : isLast ? "rounded-l-[2px] rounded-r-md" : "rounded-[2px]"
                    } ${
                      active
                        ? `z-[15] border-2 bg-[rgba(201,162,75,0.04)] ${multiPart ? "border-emerald-soft/60" : "border-gold"}`
                        : `border hover:border-gold/50 ${
                            idx % 2 === 0 ? "bg-[rgba(255,255,255,0.02)]" : "bg-transparent"
                          } ${multiPart ? "border-emerald-soft/20" : "border-[var(--hairline)]"}`
                    }`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    {needsReview && (
                      <span
                        aria-label={`Review boundary before ayah ${seg.vn}`}
                        title={`Low-confidence boundary before ayah ${seg.vn}`}
                        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-1 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.75)]"
                      />
                    )}
                    <span
                      className={`pointer-events-none absolute left-1 top-1 z-[1] rounded px-1.5 py-px text-[10px] font-semibold tabular-nums ${
                        active
                          ? multiPart ? "bg-emerald-soft text-[var(--ink-deep)]" : "bg-gold text-[var(--ink-deep)]"
                          : "bg-[var(--ink)]/85 text-gold-soft ring-1 ring-[var(--hairline)]"
                      }`}
                    >
                      {label}
                    </span>
                    <div
                      onPointerDown={startDrag(seg.tIdx, leftDrag, leftSplitIdx)}
                      className={`group/h absolute left-0 top-0 bottom-0 z-10 flex w-11 cursor-ew-resize items-center justify-center hover:bg-gold/10 active:bg-gold/20 ${isFirst ? "rounded-l-md" : ""}`}
                      title={isFirst ? "Drag the verse start" : "Drag to adjust split boundary"}
                    >
                      <span className="h-1/2 w-0.5 rounded-full bg-gold/50 transition-all group-hover/h:h-2/3 group-hover/h:bg-gold group-active/h:h-3/4" />
                    </div>
                    <div
                      onPointerDown={startDrag(seg.tIdx, "body")}
                      onPointerUp={onBodyPointerUp(seg.tIdx)}
                      className={`h-full w-full ${
                        active
                          ? "cursor-cell active:cursor-grabbing"
                          : "cursor-grab active:cursor-grabbing"
                      }`}
                      title={active ? "Tap to add a split here · drag to move the verse" : "Tap to select this verse"}
                    />
                    <div
                      onPointerDown={startDrag(seg.tIdx, rightDrag, rightSplitIdx)}
                      className={`group/h absolute right-0 top-0 bottom-0 z-10 flex w-11 cursor-ew-resize items-center justify-center hover:bg-gold/10 active:bg-gold/20 ${isLast ? "rounded-r-md" : ""}`}
                      title={isLast ? "Drag the verse end" : "Drag to adjust split boundary"}
                    >
                      <span className="h-1/2 w-0.5 rounded-full bg-gold/50 transition-all group-hover/h:h-2/3 group-hover/h:bg-gold group-active/h:h-3/4" />
                    </div>
                    {active && !isLast && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSplit(seg.tIdx, seg.pIdx);
                        }}
                        className="absolute -right-[22px] top-1/2 z-[16] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--ink-deep)] text-emerald-soft ring-1 ring-[var(--hairline)] transition-colors hover:text-gold-soft"
                        title="Merge with next part"
                        aria-label="Merge with next part"
                      >
                        <TlIcon d={TL_ICON.x} className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              });
            })()}

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

            {/* Drag guide + live time label — turns gold and thickens on a snap. */}
            {dragInfo && (
              <>
                <div
                  className={`pointer-events-none absolute top-0 bottom-0 z-30 ${
                    dragInfo.snapped ? "w-0.5 bg-gold shadow-[0_0_6px_rgba(201,162,75,0.8)]" : "w-px bg-parchment"
                  }`}
                  style={{ left: `${dragInfo.pct}%` }}
                />
                <div
                  className={`pointer-events-none absolute top-0 z-30 -translate-x-1/2 rounded px-1.5 py-0.5 text-[10px] tabular-nums ring-1 ${
                    dragInfo.snapped
                      ? "bg-gold text-[var(--ink-deep)] ring-gold"
                      : "bg-[var(--ink)] text-parchment ring-[var(--hairline)]"
                  }`}
                  style={{ left: `${dragInfo.pct}%` }}
                >
                  {fmt(dragInfo.time)}
                </div>
              </>
            )}

          </div>

          {/* Captions track — a CapCut-style row under the waveform where every
              verse's on-screen text (broken into split-segments) is visible
              inline with its time range. No playback needed to confirm what
              will appear when. */}
          <div className="relative mt-1.5 h-10 rounded-md bg-[var(--ink-deep)]/60 ring-1 ring-[var(--hairline-soft)]">
            {timings.map((tg, i) => {
              const verse = store.verses.find((v) => v.verse_number === tg.verseNumber);
              if (!verse) return null;
              const span = tg.end - tg.start;
              if (span <= 0) return null;
              const segs = verseSegments(tg, verse.text_uthmani);
              const points = [tg.start, ...(tg.splits ?? []), tg.end];
              const active = i === activeIdx;
              return segs.map((segText, si) => {
                if (!segText) return null;
                const lo = points[si];
                const hi = points[si + 1];
                const leftPct = pct(lo);
                const widthPct = Math.max(0.4, pct(hi) - pct(lo));
                return (
                  <div
                    key={`cap-${i}-${si}`}
                    className={`absolute top-1 bottom-1 flex items-center overflow-hidden rounded-md px-1.5 transition-colors ${
                      active
                        ? "z-[2] bg-[var(--surface)]/85 ring-1 ring-emerald-soft/40"
                        : "z-[1] bg-[var(--surface)]/40 ring-1 ring-[var(--hairline-soft)]"
                    }`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    title={segText}
                    dir="rtl"
                  >
                    <span
                      className={`font-arabic w-full truncate text-right text-[12px] leading-tight ${
                        active ? "text-parchment" : "text-parchment/65"
                      }`}
                    >
                      {segText}
                    </span>
                  </div>
                );
              });
            })}
          </div>
        </div>
        <div className="shrink-0" style={{ width: padPx }} aria-hidden />
        </div>
      </div>
        {/* Fixed centre playhead — the timeline scrolls under this stationary
            line, so "at the playhead" always means screen-centre. */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-px -translate-x-1/2 bg-gold shadow-[0_0_6px_rgba(201,162,75,0.8)]">
          <span className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-gold" />
        </div>
      </div>

      {/* Discoverable shortcuts — replaces the dense help paragraph that used
          to live here. Tucked at the right so the timeline itself can breathe. */}
      <div className="relative flex items-center justify-end">
        <button
          onClick={() => setShortcutsOpen((v) => !v)}
          className="flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-[11px] text-[var(--muted-deep)] transition-colors hover:bg-[var(--ink-deep)] hover:text-parchment sm:min-h-8"
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
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted-deep)] transition-colors hover:bg-white/[0.04] hover:text-parchment sm:h-9 sm:w-9"
              >
                <TlIcon d={TL_ICON.x} className="h-4 w-4" />
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
              <dt className="font-mono text-gold-soft">L / R</dt>
              <dd className="text-[var(--muted)]">Pull the left / right boundary to the playhead</dd>
              <dt className="font-mono text-gold-soft">Del</dt>
              <dd className="text-[var(--muted)]">Remove the selected verse</dd>
              <dt className="font-mono text-gold-soft">⌘Z</dt>
              <dd className="text-[var(--muted)]">Undo · Shift to redo</dd>
            </dl>
            <div className="mt-3 border-t border-[var(--hairline-soft)] pt-3 text-[11px] leading-relaxed text-[var(--muted)]">
              The playhead stays centred — drag the timeline to scrub, and it
              snaps to the detected pauses. Drag a verse’s edges to retime · drag
              the middle to move. Trimmed regions and gaps are skipped on play
              and export.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
