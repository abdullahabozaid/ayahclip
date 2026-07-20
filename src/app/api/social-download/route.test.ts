import { describe, expect, it } from "vitest";
import {
  buildSourceDownloadArgs,
  chooseYoutubeStrategy,
  downloadErrorMessage,
  parseFfmpegProgressSeconds,
  parseProgressLine,
  SOURCE_TOO_LARGE,
} from "@/lib/social-download-jobs";

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
    expect(args).toContain("--no-force-keyframes-at-cuts");
    expect(args).toContain("--remux-video");
    expect(args).toContain("--concurrent-fragments");
    expect(args).not.toContain("--max-filesize");
    // Cap by shorter side (res sort), never [height<=N] — a pixel-height filter
    // silently downgrades portrait videos to a lower rung. See YOUTUBE_FORMAT_SORT.
    expect(args).toContain("--format-sort");
    expect(args.join(" ")).toContain("res:480");
    expect(args.join(" ")).not.toContain("height<=");
    expect(args.join(" ")).toContain("vcodec^=avc1");
    expect(args.at(-1)).toBe("https://youtube.com/watch?v=owned-video");
  });

  it("offers an explicit HD section that caps the shorter side at 720", () => {
    const args = buildSourceDownloadArgs({
      platform: "youtube",
      url: "https://youtube.com/watch?v=owned-video",
      outputTemplate: "/tmp/%(id)s.%(ext)s",
      startSeconds: 60,
      endSeconds: 180,
      quality: "hd",
    });
    expect(args).toContain("*60-180");
    expect(args).toContain("--format-sort");
    expect(args.join(" ")).toContain("res:720");
    // No pixel-height cap: it would reject a portrait 720p (720x1280) rendition.
    expect(args.join(" ")).not.toContain("height<=");
    expect(args.join(" ")).not.toContain("res:1080");
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

  it("emits per-line progress instead of silencing it", () => {
    const args = buildSourceDownloadArgs({
      platform: "youtube",
      url: "https://youtube.com/watch?v=owned-video",
      outputTemplate: "/tmp/%(id)s.%(ext)s",
      startSeconds: 0,
      endSeconds: 30,
    });
    expect(args).toContain("--newline");
    expect(args).toContain("--progress-template");
    expect(args).not.toContain("--no-progress");
  });

  it("asks ffmpeg for machine-readable progress on ranged YouTube downloads", () => {
    const args = buildSourceDownloadArgs({
      platform: "youtube",
      url: "https://youtube.com/watch?v=owned-video",
      outputTemplate: "/tmp/%(id)s.%(ext)s",
      startSeconds: 0,
      endSeconds: 30,
    });
    expect(args).toContain("--downloader-args");
    expect(args.join(" ")).toContain("ffmpeg:-progress pipe:1");

    const tiktok = buildSourceDownloadArgs({
      platform: "tiktok",
      url: "https://www.tiktok.com/@creator/video/123",
      outputTemplate: "/tmp/%(id)s.%(ext)s",
    });
    expect(tiktok).not.toContain("--downloader-args");
  });
});

describe("youtube download strategy", () => {
  it("downloads the full file and trims locally for normal-length sources", () => {
    // Section streaming is paced at ~playback speed by YouTube; the full
    // fragmented download measured ~10× quicker for sources under an hour.
    expect(chooseYoutubeStrategy({ durationSeconds: 600, startSeconds: 60, endSeconds: 180 })).toEqual({
      mode: "full",
      trim: { startSeconds: 60, durationSeconds: 120 },
    });
  });

  it("skips the trim pass when the range already spans the whole source", () => {
    expect(chooseYoutubeStrategy({ durationSeconds: 300, startSeconds: 0, endSeconds: 300 })).toEqual({
      mode: "full",
      trim: null,
    });
  });

  it("falls back to section streaming for very long or unprobeable sources", () => {
    expect(chooseYoutubeStrategy({ durationSeconds: 3 * 60 * 60, startSeconds: 0, endSeconds: 120 }).mode).toBe("section");
    expect(chooseYoutubeStrategy({ durationSeconds: null, startSeconds: 0, endSeconds: 120 }).mode).toBe("section");
  });

  it("omits section args entirely for a full-strategy download", () => {
    const args = buildSourceDownloadArgs({
      platform: "youtube",
      url: "https://youtube.com/watch?v=owned-video",
      outputTemplate: "/tmp/%(id)s.%(ext)s",
    });
    expect(args).not.toContain("--download-sections");
    expect(args).not.toContain("--downloader-args");
    expect(args).toContain("--concurrent-fragments");
    expect(args.join(" ")).toContain("res:480");
  });
});

describe("ffmpeg progress parsing", () => {
  it("reads processed media seconds from out_time keys (microseconds either way)", () => {
    expect(parseFfmpegProgressSeconds("out_time_us=12500000")).toBe(12.5);
    expect(parseFfmpegProgressSeconds("out_time_ms=12500000")).toBe(12.5);
  });

  it("ignores unrelated ffmpeg progress keys", () => {
    expect(parseFfmpegProgressSeconds("frame=250")).toBeNull();
    expect(parseFfmpegProgressSeconds("out_time=00:00:12.500000")).toBeNull();
    expect(parseFfmpegProgressSeconds("progress=continue")).toBeNull();
  });
});

describe("progress line parsing", () => {
  it("reads downloaded, total, and eta from a template line", () => {
    expect(parseProgressLine("AC|1048576|10485760|NA|42")).toEqual({
      downloadedBytes: 1048576,
      totalBytes: 10485760,
      etaSeconds: 42,
    });
  });

  it("falls back to the total estimate when the exact total is unknown", () => {
    expect(parseProgressLine("AC|500|NA|2000|NA")).toEqual({
      downloadedBytes: 500,
      totalBytes: 2000,
      etaSeconds: null,
    });
  });

  it("survives a carriage-return prefix and ignores unrelated output", () => {
    expect(parseProgressLine("\rAC|1|2|NA|1")?.downloadedBytes).toBe(1);
    expect(parseProgressLine("[download] Destination: video.mp4")).toBeNull();
    expect(parseProgressLine("AC|NA|NA|NA|NA")).toBeNull();
    expect(parseProgressLine("")).toBeNull();
  });
});

describe("download error message", () => {
  it("surfaces an actionable reason when the source is too large", () => {
    const msg = downloadErrorMessage(`some noise\n${SOURCE_TOO_LARGE}: resolved source exceeded the import limit`, "youtube");
    expect(msg).toContain("too large");
    expect(msg.toLowerCase()).toContain("fast");
  });

  it("explains a YouTube bot-check instead of blaming the times", () => {
    const msg = downloadErrorMessage("ERROR: Sign in to confirm you're not a bot", "youtube");
    expect(msg.toLowerCase()).toContain("blocking automated");
  });

  it("still reports private/unavailable videos", () => {
    expect(downloadErrorMessage("ERROR: Video unavailable. This video is private", "youtube"))
      .toContain("private, restricted, or unavailable");
  });

  it("falls back to the generic message for unknown failures", () => {
    expect(downloadErrorMessage("ERROR: some transient network hiccup", "youtube"))
      .toContain("could not import that public segment");
  });
});
