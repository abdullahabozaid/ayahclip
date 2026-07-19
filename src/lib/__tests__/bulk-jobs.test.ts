import { describe, expect, it, vi } from "vitest";
import { BULK_JOB_SCHEMA_VERSION, createBulkJob } from "../bulk-jobs";

describe("bulk job creation", () => {
  it("creates a resumable empty checkpoint with the requested batch settings", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const source = new File(["media"], "recitation.mp4", { type: "video/mp4" });
    const job = createBulkJob({
      source,
      duration: 1_234.5,
      requestedCount: 30,
      templateId: "ayahclip-gold-line",
    });

    expect(job).toMatchObject({
      schemaVersion: BULK_JOB_SCHEMA_VERSION,
      stage: "source",
      sourceName: "recitation.mp4",
      sourceType: "video/mp4",
      duration: 1_234.5,
      requestedCount: 30,
      templateId: "ayahclip-gold-line",
      nextWindowIndex: 0,
    });
    expect(job.detectedAyahs).toEqual([]);
    expect(job.candidates).toEqual([]);
    expect(job.renderTasks).toEqual([]);
    vi.restoreAllMocks();
  });
});
