import { describe, expect, it } from "vitest";
import { importSizeError, MAX_IMPORT_BYTES, RECOMMENDED_IMPORT_BYTES } from "../import-limits";

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
