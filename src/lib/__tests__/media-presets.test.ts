import { describe, expect, it } from "vitest";
import { STOCK_IMAGES } from "@/lib/stock-library";
import { VIDEO_PRESETS } from "@/lib/video-presets";

describe("curated media presets", () => {
  it("exports only manually reviewed people-free media", () => {
    expect(STOCK_IMAGES.length).toBeGreaterThanOrEqual(20);
    expect(VIDEO_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(STOCK_IMAGES.every((item) => item.peopleFree)).toBe(true);
    expect(VIDEO_PRESETS.every((item) => item.peopleFree)).toBe(true);
  });

  it("does not restore media rejected during visual review", () => {
    expect(STOCK_IMAGES.some((item) => item.id === "lanterns-2")).toBe(false);
    expect(VIDEO_PRESETS.some((item) => item.id === "mosque")).toBe(false);
    expect(VIDEO_PRESETS.some((item) => item.id === "desert-dunes")).toBe(false);
  });

  it("ships only provenance-recorded Pexels stock, never copied social posts", () => {
    expect(STOCK_IMAGES.every((item) =>
      item.url.startsWith("https://images.pexels.com/photos/") &&
      item.thumbUrl.startsWith("https://images.pexels.com/photos/")
    )).toBe(true);
    expect(VIDEO_PRESETS.every((item) =>
      item.videoUrl.startsWith("https://videos.pexels.com/video-files/") &&
      (!item.thumbnailUrl || item.thumbnailUrl.startsWith("https://images.pexels.com/videos/"))
    )).toBe(true);
    expect(JSON.stringify([...STOCK_IMAGES, ...VIDEO_PRESETS]).toLowerCase())
      .not.toContain("snaptik");
  });
});
