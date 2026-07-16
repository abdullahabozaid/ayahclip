import type { VerseTiming } from "./audio-import";

export const TIMELINE_HISTORY_LIMIT = 50;

export interface TimelineSnapshot {
  timings: VerseTiming[];
  selectedVerseNumbers: number[];
  currentVerseIndex: number;
}

export function cloneVerseTimings(
  timings: readonly VerseTiming[],
): VerseTiming[] {
  return timings.map((timing) => ({
    ...timing,
    splits: timing.splits ? [...timing.splits] : undefined,
    splitWords: timing.splitWords ? [...timing.splitWords] : undefined,
    splitCharFractions: timing.splitCharFractions
      ? [...timing.splitCharFractions]
      : undefined,
    wordRange: timing.wordRange ? { ...timing.wordRange } : undefined,
  }));
}

export function cloneTimelineSnapshot(
  snapshot: TimelineSnapshot,
): TimelineSnapshot {
  return {
    timings: cloneVerseTimings(snapshot.timings),
    selectedVerseNumbers: [...snapshot.selectedVerseNumbers],
    currentVerseIndex: snapshot.currentVerseIndex,
  };
}

/** Returns a new bounded stack so history entries cannot share mutable arrays. */
export function appendTimelineSnapshot(
  stack: readonly TimelineSnapshot[],
  snapshot: TimelineSnapshot,
  limit = TIMELINE_HISTORY_LIMIT,
): TimelineSnapshot[] {
  const next = [...stack, cloneTimelineSnapshot(snapshot)];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
