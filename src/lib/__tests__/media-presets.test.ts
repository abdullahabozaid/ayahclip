import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { artisticBackgroundPresets } from "@/lib/backgrounds";
import { STOCK_IMAGES } from "@/lib/stock-library";
import { VIDEO_PRESETS } from "@/lib/video-presets";

describe("curated media presets", () => {
  it("exports only manually reviewed people-free media", () => {
    expect(STOCK_IMAGES.length).toBeGreaterThanOrEqual(20);
    expect(VIDEO_PRESETS.length).toBeGreaterThanOrEqual(16);
    expect(STOCK_IMAGES.every((item) => item.peopleFree)).toBe(true);
    expect(VIDEO_PRESETS.every((item) => item.peopleFree)).toBe(true);
  });

  it("covers the people-free motion categories promised by the product", () => {
    const tags = new Set(VIDEO_PRESETS.flatMap((item) => item.tags));
    const requiredTags = [
      "water",
      "waterfall",
      "drive",
      "mountains",
      "trail",
      "clouds",
      "night",
      "stars",
      "abstract",
      "architecture",
    ] as const;

    for (const requiredTag of requiredTags) {
      expect(tags.has(requiredTag), requiredTag).toBe(true);
    }

    expect(VIDEO_PRESETS.filter((item) => item.category === "night").length)
      .toBeGreaterThanOrEqual(2);
  });

  it("keeps reviewed motion assets distinct, traceable, and bounded for browser use", () => {
    expect(new Set(VIDEO_PRESETS.map((item) => item.id)).size).toBe(VIDEO_PRESETS.length);
    expect(new Set(VIDEO_PRESETS.map((item) => item.videoUrl)).size).toBe(VIDEO_PRESETS.length);
    expect(VIDEO_PRESETS.every((item) =>
      item.sourcePageUrl === `https://www.pexels.com/video/${item.sourceId}/`
    )).toBe(true);
    expect(VIDEO_PRESETS.every((item) => item.fileSizeBytes > 0)).toBe(true);
    expect(Math.max(...VIDEO_PRESETS.map((item) => item.fileSizeBytes)))
      .toBeLessThan(55 * 1024 * 1024);
  });

  it("keeps every reviewed stock photo traceable to its exact Pexels source", () => {
    expect(new Set(STOCK_IMAGES.map((item) => item.id)).size).toBe(STOCK_IMAGES.length);
    expect(new Set(STOCK_IMAGES.map((item) => item.sourceId)).size).toBe(STOCK_IMAGES.length);
    expect(STOCK_IMAGES.every((item) =>
      item.sourcePageUrl === `https://www.pexels.com/photo/${item.sourceId}/`
    )).toBe(true);
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

  it("keeps the public picker on the reviewed library instead of unmoderated search", () => {
    const pickerSource = readFileSync(
      resolve(process.cwd(), "src/components/BackgroundPicker.tsx"),
      "utf8",
    );

    expect(pickerSource).toContain("<StockLibrary");
    expect(pickerSource).not.toContain("PexelsSearch");
    expect(existsSync(resolve(process.cwd(), "src/app/api/pexels/route.ts"))).toBe(false);
  });

  it("ships optimized local artwork in a separately labelled illustration collection", () => {
    expect(artisticBackgroundPresets).toHaveLength(34);
    expect(artisticBackgroundPresets.every((item) =>
      item.type === "image" &&
      item.collection === "artistic" &&
      item.value.startsWith("/backgrounds/artistic") &&
      item.value.endsWith(".webp")
    )).toBe(true);

    for (const item of artisticBackgroundPresets) {
      const assetPath = resolve(process.cwd(), "public", item.value.slice(1));
      expect(existsSync(assetPath), item.label).toBe(true);
      expect(statSync(assetPath).size, item.label).toBeLessThan(350 * 1024);
    }

    const pickerSource = readFileSync(
      resolve(process.cwd(), "src/components/BackgroundPicker.tsx"),
      "utf8",
    );
    expect(pickerSource).toContain("Artistic illustrations");
    expect(pickerSource).toContain("Original vertical compositions with room for captions.");
  });
});
