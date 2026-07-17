import { describe, expect, it } from "vitest";
import { exportFailureMessage } from "../export-errors";

describe("export failure copy", () => {
  it("preserves the correct recovery action for missing imported audio", () => {
    expect(exportFailureMessage(new Error(
      "Imported audio is no longer available — re-import the clip.",
    ))).toContain("Re-import the source file");
  });

  it("does not disguise a Quran font failure as an encoder problem", () => {
    const message = exportFailureMessage(new Error(
      "The selected Quran font did not finish loading. Please retry the export.",
    ));
    expect(message).toContain("Quran font");
    expect(message).toContain("fallback Arabic face");
  });

  it("distinguishes memory, media decode, network, and encoder failures", () => {
    expect(exportFailureMessage(new RangeError("Out of memory"))).toContain("available memory");
    expect(exportFailureMessage(new Error("background video has no usable duration"))).toContain("Replace it");
    expect(exportFailureMessage(new Error("failed to fetch audio"))).toContain("connection");
    expect(exportFailureMessage(new Error("WebCodecs encoder not supported"))).toContain("latest Chrome or Edge");
  });
});
