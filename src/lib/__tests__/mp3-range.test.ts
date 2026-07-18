import { describe, expect, it } from "vitest";

import { findMp3Frame, id3EndOffset, planMp3Range } from "../mp3-range";

describe("MP3 byte-range planning", () => {
  it("skips an ID3v2 tag, including its optional footer", () => {
    const bytes = new Uint8Array([
      0x49, 0x44, 0x33, 0x04, 0x00, 0x10,
      0x00, 0x00, 0x01, 0x00,
    ]);

    expect(id3EndOffset(bytes)).toBe(148);
    expect(id3EndOffset(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe(0);
  });

  it("reads MPEG-1 and MPEG-2 Layer III frame rates", () => {
    expect(findMp3Frame(new Uint8Array([0, 0xff, 0xfb, 0xd0, 0x00]))).toEqual({
      offset: 1,
      bitrate: 256_000,
      sampleRate: 44_100,
    });
    expect(findMp3Frame(new Uint8Array([0xff, 0xf3, 0xa0, 0x00]))).toEqual({
      offset: 0,
      bitrate: 96_000,
      sampleRate: 22_050,
    });
  });

  it("plans a bounded ayah window rather than the full chapter", () => {
    const plan = planMp3Range({
      totalBytes: 268_000_000,
      audioStartByte: 1_024,
      bitrate: 256_000,
      startSeconds: 7_062.32,
      endSeconds: 7_124.08,
      chapterEndSeconds: 8_390.5,
    });

    expect(plan.byteStart).toBeGreaterThan(200_000_000);
    expect(plan.byteEnd).toBeLessThan(268_000_000);
    expect(plan.byteEnd - plan.byteStart + 1).toBeLessThan(2_500_000);
  });
});
