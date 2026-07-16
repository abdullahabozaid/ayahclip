import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../store";

describe("imported timeline deletion", () => {
  beforeEach(() => {
    useAppStore.setState({
      audioSource: {
        mode: "imported",
        url: "blob:test",
        name: "test.mp3",
        timings: [
          { verseNumber: 1, start: 0, end: 2 },
          { verseNumber: 2, start: 2, end: 4 },
          { verseNumber: 3, start: 4, end: 6 },
        ],
      },
      selectedVerseNumbers: [1, 2, 3],
      currentVerseIndex: 2,
    });
  });

  it("removes the timing, selection, and clamps the active index together", () => {
    useAppStore.getState().deleteImportedVerse(2);
    const state = useAppStore.getState();

    expect(state.audioSource.mode).toBe("imported");
    if (state.audioSource.mode !== "imported") return;
    expect(state.audioSource.timings.map((timing) => timing.verseNumber)).toEqual([1, 2]);
    expect(state.selectedVerseNumbers).toEqual([1, 2]);
    expect(state.currentVerseIndex).toBe(1);
  });

  it("keeps a verse selected while another timing still uses it", () => {
    useAppStore.setState((state) => ({
      audioSource: state.audioSource.mode === "imported"
        ? {
            ...state.audioSource,
            timings: [
              { verseNumber: 1, start: 0, end: 1 },
              { verseNumber: 1, start: 1, end: 2 },
              { verseNumber: 2, start: 2, end: 4 },
            ],
          }
        : state.audioSource,
      selectedVerseNumbers: [1, 2],
    }));

    useAppStore.getState().deleteImportedVerse(0);
    expect(useAppStore.getState().selectedVerseNumbers).toEqual([1, 2]);
  });

  it("never deletes the last timing", () => {
    useAppStore.setState({
      audioSource: {
        mode: "imported",
        url: "blob:test",
        name: "test.mp3",
        timings: [{ verseNumber: 1, start: 0, end: 2 }],
      },
      selectedVerseNumbers: [1],
      currentVerseIndex: 0,
    });

    useAppStore.getState().deleteImportedVerse(0);
    const source = useAppStore.getState().audioSource;
    expect(source.mode === "imported" ? source.timings : []).toHaveLength(1);
    expect(useAppStore.getState().selectedVerseNumbers).toEqual([1]);
  });
});
