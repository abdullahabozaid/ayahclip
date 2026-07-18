import { describe, expect, it } from "vitest";
import { buildSourceDownloadArgs } from "./route";

describe("source resolver command", () => {
  it("requests only the selected YouTube range and normalizes it to MP4", () => {
    const args = buildSourceDownloadArgs({
      platform: "youtube",
      url: "https://youtube.com/watch?v=owned-video",
      outputTemplate: "/tmp/%(id)s.%(ext)s",
      startSeconds: 60,
      endSeconds: 180,
    });

    expect(args).toContain("--download-sections");
    expect(args).toContain("*60-180");
    expect(args).toContain("--force-keyframes-at-cuts");
    expect(args).toContain("--recode-video");
    expect(args).not.toContain("--max-filesize");
    expect(args.join(" ")).toContain("height<=1080");
    expect(args.join(" ")).toContain("vcodec^=avc1");
    expect(args.at(-1)).toBe("https://youtube.com/watch?v=owned-video");
  });

  it("preserves the existing clean social-source preference", () => {
    const args = buildSourceDownloadArgs({
      platform: "tiktok",
      url: "https://www.tiktok.com/@creator/video/123",
      outputTemplate: "/tmp/%(id)s.%(ext)s",
    });

    expect(args).not.toContain("--download-sections");
    expect(args).toContain("--max-filesize");
    expect(args.join(" ")).toContain("format_note!*=watermarked");
  });
});
