import { describe, expect, it } from "vitest";
import {
  bulkYoutubeRangeError,
  formatTimecode,
  parseTimecode,
  sourcePlatform,
  validateSourceLink,
  youtubeRangeError,
} from "./source-link";

describe("source links", () => {
  it("accepts exact supported video hosts and paths", () => {
    expect(sourcePlatform("https://youtu.be/abc123")).toBe("youtube");
    expect(sourcePlatform("https://www.youtube.com/watch?v=abc123&list=queue")).toBe("youtube");
    expect(sourcePlatform("https://www.youtube.com/shorts/abc123")).toBe("youtube");
    expect(sourcePlatform("https://www.tiktok.com/@creator/video/123")).toBe("tiktok");
    expect(sourcePlatform("https://www.instagram.com/reel/abc/")).toBe("instagram");
  });

  it("rejects deceptive hosts and non-video YouTube pages", () => {
    expect(validateSourceLink("https://youtube.com.evil.example/watch?v=abc")).toBeNull();
    expect(validateSourceLink("http://youtube.com/watch?v=abc")).toBeNull();
    expect(validateSourceLink("https://youtube.com/@channel")).toBeNull();
    expect(validateSourceLink("https://youtube.com/playlist?list=abc")).toBeNull();
  });

  it("normalizes YouTube playlists to a single video", () => {
    const source = validateSourceLink("https://youtube.com/watch?v=abc&list=queue&index=4");
    expect(source?.url.toString()).toBe("https://youtube.com/watch?v=abc");
  });
});

describe("source timecodes", () => {
  it("parses creator-friendly timestamps", () => {
    expect(parseTimecode("90")).toBe(90);
    expect(parseTimecode("1:30")).toBe(90);
    expect(parseTimecode("1:02:03")).toBe(3_723);
    expect(parseTimecode("1:60")).toBeNull();
    expect(parseTimecode("-1")).toBeNull();
  });

  it("formats seconds without unnecessary hours", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(90)).toBe("1:30");
    expect(formatTimecode(3_723)).toBe("1:02:03");
  });

  it("bounds segments to the recognition limit", () => {
    expect(youtubeRangeError(60, 180)).toBeNull();
    expect(youtubeRangeError(60, 60)).toContain("after");
    expect(youtubeRangeError(0, 481)).toContain("8 minutes");
  });

  it("allows a longer, explicitly bulk-scoped segment", () => {
    expect(bulkYoutubeRangeError(0, 30 * 60)).toBeNull();
    expect(bulkYoutubeRangeError(0, 30 * 60 + 1)).toContain("30 minutes");
  });
});
