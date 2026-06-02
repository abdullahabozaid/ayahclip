// Single shared playback engine for imported audio. One <audio> element drives
// the timeline, the studio preview, and the fullscreen preview — so there is
// never more than one track playing, and the playhead / current verse stay in
// sync everywhere. Lives outside React (module singleton) on purpose: the audio
// element must survive component mounts/unmounts (e.g. opening fullscreen).

import { useAppStore } from "./store";
import { verseTextAt } from "./audio-import";

type Listener = (time: number, playing: boolean) => void;

// The <audio> element is parked on globalThis so it survives module hot-reloads in
// dev — otherwise an old module instance's element keeps playing while a new one
// creates a second, and you hear the recitation duplicated.
const G = globalThis as unknown as { __ayahAudio?: HTMLAudioElement; __ayahAudioUrl?: string };

let playing = false;
let raf = 0;
let lastWord: number | null = -1; // last active word index pushed to the store
let loopStart: number | null = null; // when set, playback loops this region (a verse)
let loopEnd: number | null = null;
// Track which intra-verse segment is currently on-screen so we only push to the
// store when it changes (cheaper than re-rendering every frame).
let lastSegKey: string | null = null;

function clearPlaybackSegment() {
  if (lastSegKey === null) return;
  lastSegKey = null;
  useAppStore.getState().setPlaybackSegment(null, null);
}
const listeners = new Set<Listener>();

function emit() {
  const t = G.__ayahAudio?.currentTime ?? 0;
  for (const l of listeners) l(t, playing);
}

function ensure(url: string): HTMLAudioElement {
  let audio = G.__ayahAudio ?? null;
  if (!audio || G.__ayahAudioUrl !== url) {
    audio?.pause();
    audio = new Audio(url);
    G.__ayahAudio = audio;
    G.__ayahAudioUrl = url;
    audio.addEventListener("ended", () => {
      playing = false;
      cancelAnimationFrame(raf);
      if (lastWord !== null) {
        lastWord = null;
        useAppStore.getState().setActiveWordIndex(null);
      }
      clearPlaybackSegment();
      emit();
    });
  }
  return audio;
}

function frame() {
  const audio = G.__ayahAudio;
  if (!audio) return;
  let t = audio.currentTime;
  // Loop a single region (e.g. one verse) when set — for fine-tuning by ear.
  if (loopEnd != null && t >= loopEnd - 0.02) {
    t = loopStart ?? 0;
    audio.currentTime = t;
  }
  const src = useAppStore.getState().audioSource;
  if (src.mode === "imported" && src.timings.length && loopEnd == null) {
    // Skip gaps so playback covers only the kept (cropped) regions.
    const inBlock = src.timings.some((s) => t >= s.start && t < s.end);
    if (!inBlock) {
      const nextStart = src.timings
        .map((s) => s.start)
        .filter((s) => s > t + 0.001)
        .sort((a, b) => a - b)[0];
      if (nextStart !== undefined) {
        audio.currentTime = nextStart; // skip a trimmed/gap region
        t = nextStart;
      } else {
        // Past the final verse — stop so the trimmed tail never plays.
        audio.pause();
        playing = false;
        cancelAnimationFrame(raf);
        if (lastWord !== null) {
          lastWord = null;
          useAppStore.getState().setActiveWordIndex(null);
        }
        clearPlaybackSegment();
        emit();
        return;
      }
    }
    const idx = src.timings.findIndex((s) => t >= s.start && t < s.end);
    if (idx >= 0 && idx !== useAppStore.getState().currentVerseIndex) {
      useAppStore.getState().setCurrentVerseIndex(idx);
    }

    // Word-by-word highlight: which word of the current verse is being recited.
    // Proportional within the verse's span over its displayed word count — lands
    // on the right word given the (now accurate) verse boundaries, and the index
    // always matches the rendered text. Only pushed to the store when it changes.
    const st = useAppStore.getState();
    if (st.wordHighlight && idx >= 0) {
      const seg = src.timings[idx];
      const verse = st.verses.find((vv) => vv.verse_number === seg.verseNumber);
      const count = verse ? verse.text_uthmani.split(/\s+/).filter(Boolean).length : 0;
      let wordIdx: number | null = null;
      if (count > 0 && seg.end > seg.start) {
        const prog = Math.min(0.999, Math.max(0, (t - seg.start) / (seg.end - seg.start)));
        wordIdx = Math.min(count - 1, Math.floor(prog * count));
      }
      if (wordIdx !== lastWord) {
        lastWord = wordIdx;
        st.setActiveWordIndex(wordIdx);
      }
    } else if (lastWord !== null) {
      lastWord = null;
      st.setActiveWordIndex(null);
    }

    // Intra-verse splits: swap on-screen Arabic + translation to the current
    // segment when the active verse has splits. No splits → restore full text.
    if (idx >= 0) {
      const seg = src.timings[idx];
      const verse = st.verses.find((vv) => vv.verse_number === seg.verseNumber);
      if (seg.splits && seg.splits.length > 0 && verse) {
        // Identify the segment by index so we only emit on transitions.
        let segIdx = 0;
        for (const sp of seg.splits) {
          if (t >= sp) segIdx++;
          else break;
        }
        const key = `${idx}:${segIdx}`;
        if (key !== lastSegKey) {
          lastSegKey = key;
          const ar = verseTextAt(seg, verse.text_uthmani, t);
          const tr =
            verse.translation != null ? verseTextAt(seg, verse.translation, t) : null;
          st.setPlaybackSegment(ar, tr);
        }
      } else if (lastSegKey !== null) {
        clearPlaybackSegment();
      }
    } else if (lastSegKey !== null) {
      clearPlaybackSegment();
    }
  }
  emit();
  raf = requestAnimationFrame(frame);
}

export const importedPlayer = {
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  isPlaying: () => playing,
  currentTime: () => G.__ayahAudio?.currentTime ?? 0,
  play(url: string) {
    const a = ensure(url);
    if (a.duration && a.currentTime >= a.duration - 0.05) a.currentTime = 0;
    a.play().then(
      () => {
        playing = true;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
        emit();
      },
      () => {
        playing = false;
        emit();
      }
    );
  },
  pause() {
    G.__ayahAudio?.pause();
    playing = false;
    cancelAnimationFrame(raf);
    if (lastWord !== null) {
      lastWord = null;
      useAppStore.getState().setActiveWordIndex(null);
    }
    clearPlaybackSegment();
    emit();
  },
  toggle(url: string) {
    if (playing) importedPlayer.pause();
    else importedPlayer.play(url);
  },
  seek(url: string, t: number) {
    const a = ensure(url);
    a.currentTime = Math.max(0, t);
    emit();
  },
  setLoop(start: number, end: number) {
    loopStart = start;
    loopEnd = end;
  },
  clearLoop() {
    loopStart = null;
    loopEnd = null;
  },
  isLooping: () => loopEnd != null,
  stop() {
    importedPlayer.pause();
  },
};
