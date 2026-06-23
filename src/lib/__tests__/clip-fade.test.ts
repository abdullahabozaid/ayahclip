// Tests for the clip-start fade math. Pure functions so the fade can be computed
// identically in the live preview and in both export paths (preview == export).
import { describe, it, expect } from "vitest";
import { clipFadeProgress, applyAudioFadeIn } from "@/lib/clip-fade";

describe("clipFadeProgress", () => {
  it("is 0 at the very start and 1 at/after the window", () => {
    expect(clipFadeProgress(0, 400)).toBe(0);
    expect(clipFadeProgress(200, 400)).toBe(0.5);
    expect(clipFadeProgress(400, 400)).toBe(1);
    expect(clipFadeProgress(800, 400)).toBe(1);
  });

  it("clamps negative elapsed to 0", () => {
    expect(clipFadeProgress(-50, 400)).toBe(0);
  });

  it("is fully visible (1) when the fade is disabled", () => {
    expect(clipFadeProgress(0, 0)).toBe(1);
    expect(clipFadeProgress(100, 0)).toBe(1);
    expect(clipFadeProgress(100, -10)).toBe(1);
  });
});

describe("applyAudioFadeIn", () => {
  it("ramps the first N ms of samples from 0 to 1 in place", () => {
    const rate = 1000; // 1 sample per ms → 10ms = 10 samples
    const data = new Float32Array(20).fill(1);
    applyAudioFadeIn(data, rate, 10);
    expect(data[0]).toBe(0); // i/n = 0/10
    expect(data[5]).toBeCloseTo(0.5, 5); // 5/10
    expect(data[9]).toBeCloseTo(0.9, 5); // 9/10
    expect(data[10]).toBe(1); // first untouched sample
    expect(data[19]).toBe(1); // tail untouched
  });

  it("is a no-op when the fade duration is 0 or negative", () => {
    const data = new Float32Array(8).fill(1);
    applyAudioFadeIn(data, 48000, 0);
    expect(Array.from(data)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    applyAudioFadeIn(data, 48000, -5);
    expect(Array.from(data)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("never ramps past the end of a short buffer", () => {
    const rate = 1000;
    const data = new Float32Array(4).fill(1); // only 4 samples, window wants 10
    applyAudioFadeIn(data, rate, 10);
    // n is capped at the buffer length (4), so the ramp uses i/4
    expect(data[0]).toBe(0);
    expect(data[3]).toBeCloseTo(0.75, 5);
  });
});
