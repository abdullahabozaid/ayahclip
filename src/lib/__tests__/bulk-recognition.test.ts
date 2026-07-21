import { describe, expect, it } from "vitest";
import { bulkRecognitionWindows, silenceAwareWindows } from "../bulk-recognition";

describe("bulkRecognitionWindows", () => {
  it("keeps every inference window below the single-pass limit with overlap", () => {
    const windows = bulkRecognitionWindows(30 * 60);
    expect(windows).toHaveLength(9);
    expect(windows[0]).toEqual({ start: 0, end: 240 });
    expect(windows.at(-1)?.end).toBe(30 * 60);
    for (let index = 0; index < windows.length; index++) {
      expect(windows[index].end - windows[index].start).toBeLessThanOrEqual(240);
      if (index > 0) expect(windows[index - 1].end - windows[index].start).toBe(24);
    }
  });

  it("uses one exact window for a short source", () => {
    expect(bulkRecognitionWindows(90)).toEqual([{ start: 0, end: 90 }]);
  });
});

describe("silenceAwareWindows (item C: pause-aligned cuts)", () => {
  it("snaps the boundary to a pause near the target instead of the fixed mark", () => {
    // A pause at 250s sits within tolerance of the 240s target; cut there.
    const windows = silenceAwareWindows(600, [{ time: 250, len: 1.2 }]);
    expect(windows[0].start).toBe(0);
    expect(windows[0].end).toBe(250);
  });

  it("prefers the longest pause among several near the target", () => {
    const windows = silenceAwareWindows(600, [
      { time: 230, len: 0.4 },
      { time: 255, len: 1.5 },
      { time: 260, len: 0.5 },
    ]);
    expect(windows[0].end).toBe(255);
  });

  it("falls back to the fixed target when no pause is within tolerance", () => {
    const windows = silenceAwareWindows(600, [{ time: 120, len: 2 }]);
    expect(windows[0].end).toBe(240);
  });

  it("keeps a small overlap between consecutive windows", () => {
    const windows = silenceAwareWindows(600, [{ time: 250, len: 1 }], { overlapSeconds: 12 });
    expect(windows.length).toBeGreaterThan(1);
    expect(windows[1].start).toBe(windows[0].end - 12);
  });

  it("takes the whole remainder as the final window and never exceeds maxSeconds", () => {
    const windows = silenceAwareWindows(500, []);
    expect(windows.at(-1)?.end).toBe(500);
    for (const window of windows) {
      expect(window.end - window.start).toBeLessThanOrEqual(5 * 60);
      expect(window.end).toBeGreaterThan(window.start);
    }
  });

  it("returns one window for a source shorter than maxSeconds", () => {
    expect(silenceAwareWindows(200, [{ time: 100, len: 1 }])).toEqual([{ start: 0, end: 200 }]);
  });

  it("terminates and covers the whole source for a long pause-rich recitation", () => {
    const silences = Array.from({ length: 60 }, (_, i) => ({ time: (i + 1) * 30, len: 1 }));
    const windows = silenceAwareWindows(30 * 60, silences);
    expect(windows[0].start).toBe(0);
    expect(windows.at(-1)?.end).toBe(30 * 60);
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].start).toBeGreaterThan(windows[i - 1].start);
      expect(windows[i].start).toBeLessThan(windows[i].end);
    }
  });

  it("returns no windows for a non-positive duration", () => {
    expect(silenceAwareWindows(0, [])).toEqual([]);
  });
});
