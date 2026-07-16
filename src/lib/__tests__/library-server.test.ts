import { describe, it, expect } from "vitest";
import { canonicalVideoType } from "../library-server";

describe("canonicalVideoType", () => {
  it("accepts the two known-safe video types", () => {
    expect(canonicalVideoType("video/mp4")).toBe("video/mp4");
    expect(canonicalVideoType("video/webm")).toBe("video/webm");
  });

  it("ignores a codecs suffix", () => {
    expect(canonicalVideoType('video/mp4; codecs="avc1.640028"')).toBe("video/mp4");
    expect(canonicalVideoType("video/webm;codecs=vp9")).toBe("video/webm");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(canonicalVideoType("  VIDEO/MP4  ")).toBe("video/mp4");
  });

  it("rejects anything else — this is what stops stored XSS", () => {
    for (const bad of ["text/html", "image/svg+xml", "video/quicktime", "", "application/json"]) {
      expect(canonicalVideoType(bad)).toBeNull();
    }
  });
});
