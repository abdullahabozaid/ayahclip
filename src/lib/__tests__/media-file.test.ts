import { describe, expect, it } from "vitest";

import { isImageFile, isSupportedVideoFile, VIDEO_FILE_ACCEPT } from "../media-file";

describe("phone media classification", () => {
  it("recognises QuickTime and extension-only phone videos", () => {
    expect(isSupportedVideoFile({ name: "camera.mov", type: "video/quicktime" })).toBe(true);
    expect(isSupportedVideoFile({ name: "camera.MOV", type: "" })).toBe(true);
    expect(isSupportedVideoFile({ name: "export.m4v", type: "application/octet-stream" })).toBe(true);
  });

  it("keeps the browser-video allowlist narrow", () => {
    expect(isSupportedVideoFile({ name: "clip.mp4", type: "video/mp4" })).toBe(true);
    expect(isSupportedVideoFile({ name: "clip.webm", type: "video/webm" })).toBe(true);
    expect(isSupportedVideoFile({ name: "notes.txt", type: "video/fake" })).toBe(false);
    expect(isSupportedVideoFile({ name: "still.jpg", type: "image/jpeg" })).toBe(false);
    expect(VIDEO_FILE_ACCEPT).toContain("video/quicktime");
    expect(VIDEO_FILE_ACCEPT).toContain(".mov");
  });

  it("recognises ordinary image MIME types separately", () => {
    expect(isImageFile({ type: "image/jpeg" })).toBe(true);
    expect(isImageFile({ type: "video/quicktime" })).toBe(false);
  });
});
