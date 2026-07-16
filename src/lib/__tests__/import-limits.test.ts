import { describe, expect, it } from "vitest";
import {
  importSizeError,
  MAX_IMPORT_BYTES,
  RECOMMENDED_IMPORT_BYTES,
  recognitionDurationError,
  recognitionDurationLimit,
  recognitionDurationWarning,
} from "../import-limits";

describe("import limits", () => {
  it("keeps the recommendation below the hard limit", () => {
    expect(RECOMMENDED_IMPORT_BYTES).toBeLessThan(MAX_IMPORT_BYTES);
  });

  it("accepts files at the hard limit", () => {
    expect(importSizeError(MAX_IMPORT_BYTES)).toBeNull();
  });

  it("rejects files above the hard limit with actionable guidance", () => {
    expect(importSizeError(MAX_IMPORT_BYTES + 1)).toContain("Trim it first");
  });
});

describe("recognition duration limits", () => {
  it("uses a lower ceiling on memory-constrained devices", () => {
    expect(recognitionDurationLimit(4)).toBe(240);
    expect(recognitionDurationLimit(8)).toBe(480);
    expect(recognitionDurationLimit()).toBe(480);
  });

  it("blocks recognition before a likely tab OOM", () => {
    expect(recognitionDurationError(241, 4)).toContain("limited to 4 minutes");
    expect(recognitionDurationError(240, 4)).toBeNull();
    expect(recognitionDurationError(481, 16)).toContain("limited to 8 minutes");
  });

  it("warns about long but supported jobs", () => {
    expect(recognitionDurationWarning(181)).toContain("long recognition job");
    expect(recognitionDurationWarning(180)).toBeNull();
  });
});
