import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../store";

// beginNewProject must wipe every piece of per-clip state, or a fresh clip of
// the same surah inherits the previous clip's edits. emphasis is keyed by
// verse_key, so a stale entry re-decorates the same verse in the new clip.
describe("beginNewProject clears per-clip state", () => {
  beforeEach(() => {
    useAppStore.setState({
      emphasis: { "1:1": { arabic: [0, 2], translation: [1] } },
      activeWordIndex: 3,
      verseParts: { 1: [2] },
      selectedVerseNumbers: [1, 2, 3],
      projectId: "old-id",
    });
  });

  it("resets emphasis to empty", () => {
    useAppStore.getState().beginNewProject();
    expect(useAppStore.getState().emphasis).toEqual({});
  });

  it("clears the transient active word highlight", () => {
    useAppStore.getState().beginNewProject();
    expect(useAppStore.getState().activeWordIndex).toBeNull();
  });

  it("still clears the pre-existing state it already handled", () => {
    useAppStore.getState().beginNewProject();
    const s = useAppStore.getState();
    expect(s.verseParts).toEqual({});
    expect(s.selectedVerseNumbers).toEqual([]);
    expect(s.projectId).toBeNull();
    expect(s.audioSource).toEqual({ mode: "reciter" });
  });
});
