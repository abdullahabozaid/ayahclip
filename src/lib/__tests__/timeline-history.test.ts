import { describe, expect, it } from "vitest";
import {
  appendTimelineSnapshot,
  cloneTimelineSnapshot,
  cloneVerseTimings,
  type TimelineSnapshot,
} from "../timeline-history";

const snapshot = (): TimelineSnapshot => ({
  timings: [
    {
      verseNumber: 1,
      start: 0,
      end: 4,
      splits: [1.5],
      splitWords: [3],
      wordRange: { from: 1, to: 6 },
    },
  ],
  selectedVerseNumbers: [1, 2],
  currentVerseIndex: 1,
});

describe("timeline history snapshots", () => {
  it("deep-clones every mutable timing field", () => {
    const original = snapshot();
    const timings = cloneVerseTimings(original.timings);
    timings[0].splits?.push(2.5);
    timings[0].splitWords?.push(5);
    if (timings[0].wordRange) timings[0].wordRange.from = 4;

    expect(original.timings[0].splits).toEqual([1.5]);
    expect(original.timings[0].splitWords).toEqual([3]);
    expect(original.timings[0].wordRange).toEqual({ from: 1, to: 6 });
  });

  it("keeps selection and active index in the same reversible snapshot", () => {
    const original = snapshot();
    const copy = cloneTimelineSnapshot(original);
    copy.selectedVerseNumbers.pop();
    copy.timings[0].end = 2;

    expect(original.selectedVerseNumbers).toEqual([1, 2]);
    expect(original.currentVerseIndex).toBe(1);
    expect(original.timings[0].end).toBe(4);
  });

  it("bounds history while retaining the newest edits", () => {
    let history: TimelineSnapshot[] = [];
    for (let index = 0; index < 4; index += 1) {
      history = appendTimelineSnapshot(
        history,
        { ...snapshot(), currentVerseIndex: index },
        3,
      );
    }

    expect(history.map((entry) => entry.currentVerseIndex)).toEqual([1, 2, 3]);
  });
});
