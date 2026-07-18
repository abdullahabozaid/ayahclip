import { describe, expect, it } from "vitest";
import {
  buildExactCutArgs,
  buildSourceDownloadArgs,
  buildYoutubeFullDownloadArgs,
  parseYoutubeProbe,
  youtubeFastPathAllowed,
} from "./route";

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
    expect(args).toContain("ffmpeg_o:-preset veryfast");
    expect(args).not.toContain("--max-filesize");
    expect(args.join(" ")).toContain("height<=1080");
    expect(args.join(" ")).toContain("vcodec^=avc1");
    expect(args.at(-1)).toBe("https://youtube.com/watch?v=owned-video");
  });

  it("uses a guarded full-source fast path only for reasonably sized videos", () => {
    expect(parseYoutubeProbe("275|38174699\n")).toEqual({
      durationSeconds: 275,
      sourceBytes: 38174699,
    });
    expect(youtubeFastPathAllowed(parseYoutubeProbe("275|38174699\n"))).toBe(true);
    expect(youtubeFastPathAllowed(parseYoutubeProbe("1200|38174699\n"))).toBe(false);
    expect(youtubeFastPathAllowed(parseYoutubeProbe("275|500000000\n"))).toBe(false);
    expect(youtubeFastPathAllowed(parseYoutubeProbe("NA|NA\n"))).toBe(false);
  });

  it("downloads a compatible full source then makes an exact fast local cut", () => {
    const downloadArgs = buildYoutubeFullDownloadArgs(
      "https://youtube.com/watch?v=owned-video",
      "/tmp/source.%(ext)s",
    );
    expect(downloadArgs).not.toContain("--download-sections");
    expect(downloadArgs).toContain("--max-filesize");
    expect(downloadArgs.join(" ")).toContain("vcodec^=avc1");

    const cutArgs = buildExactCutArgs({
      sourcePath: "/tmp/source.mp4",
      outputPath: "/tmp/segment.mp4",
      startSeconds: 60,
      endSeconds: 180,
    });
    expect(cutArgs).toContain("veryfast");
    expect(cutArgs).toContain("120");
    expect(cutArgs.at(-1)).toBe("/tmp/segment.mp4");
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
