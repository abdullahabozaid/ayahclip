import { describe, expect, it } from "vitest";
import { bulkRecognitionWindows } from "../bulk-recognition";

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
