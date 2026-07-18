import { describe, expect, it } from "vitest";
import {
  type ReviewManifest,
  type RuntimeMedia,
  validateStockMedia,
} from "../../../scripts/stock-media-review-validation";

function fixture() {
  const manifest: ReviewManifest = {
    policyVersion: 1,
    reviewer: "manual-editorial",
    photoReviewMethod: "full-frame",
    videoReviewMethod: "sampled-frames",
    videoSampleFractions: [0, 0.2, 0.4, 0.6, 0.8, 1],
    maximumVideoBytes: 100,
    requiredVideoTags: ["water"],
    approved: [
      { kind: "photo", runtimeId: "forest", sourceId: 10, reviewedAt: "2026-07-18", reviewMethod: "full-frame", peopleVisible: false },
      { kind: "video", runtimeId: "river", sourceId: 20, reviewedAt: "2026-07-18", reviewMethod: "sampled-frames", peopleVisible: false },
    ],
    rejected: [{ kind: "video", runtimeId: "crowd", reason: "Visible people during sampled-frame review." }],
  };
  const runtime: RuntimeMedia[] = [
    { kind: "photo", runtimeId: "forest", sourceId: 10, sourcePageUrl: "https://www.pexels.com/photo/10/", peopleFree: true },
    { kind: "video", runtimeId: "river", sourceId: 20, sourcePageUrl: "https://www.pexels.com/video/20/", peopleFree: true, fileSizeBytes: 80, tags: ["water"] },
  ];
  return { manifest, runtime };
}

describe("stock media review validation", () => {
  it("accepts a one-to-one reviewed people-free catalog", () => {
    const { manifest, runtime } = fixture();
    expect(validateStockMedia(manifest, runtime)).toEqual({ coveredVideoTags: ["water"] });
  });

  it("rejects public media without matching review evidence", () => {
    const { manifest, runtime } = fixture();
    manifest.approved = manifest.approved.slice(0, 1);
    expect(() => validateStockMedia(manifest, runtime)).toThrow("video:river is public but has no approved review record");
  });

  it("rejects provenance drift and oversized videos", () => {
    const provenance = fixture();
    provenance.manifest.approved[1].sourceId = 21;
    expect(() => validateStockMedia(provenance.manifest, provenance.runtime)).toThrow("review source ID does not match runtime provenance");

    const oversized = fixture();
    oversized.runtime[1].fileSizeBytes = 101;
    expect(() => validateStockMedia(oversized.manifest, oversized.runtime)).toThrow("exceeds the browser-size ceiling");
  });

  it("never allows a rejected runtime ID back into the public catalog", () => {
    const { manifest, runtime } = fixture();
    manifest.approved.push({ kind: "video", runtimeId: "crowd", sourceId: 30, reviewedAt: "2026-07-18", reviewMethod: "sampled-frames", peopleVisible: false });
    runtime.push({ kind: "video", runtimeId: "crowd", sourceId: 30, sourcePageUrl: "https://www.pexels.com/video/30/", peopleFree: true, fileSizeBytes: 50, tags: ["water"] });
    expect(() => validateStockMedia(manifest, runtime)).toThrow("video:crowd was rejected but is public");
  });
});
