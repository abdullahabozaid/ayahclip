import { describe, expect, it } from "vitest";
import { buildDiagnostics, classifyBrowser, classifyPlatform, type DiagnosticsInput } from "../diagnostics";

const input: DiagnosticsInput = {
  userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
  language: "en-GB",
  viewport: { width: 390, height: 844, pixelRatio: 3 },
  capabilities: {
    webAudio: true,
    webCodecs: true,
    offscreenCanvas: true,
    indexedDb: true,
  },
  editor: {
    audioMode: "imported",
    videoFormat: "9:16",
    backgroundType: "video",
    selectedVerseCount: 3,
    timingCount: 3,
    backgroundSceneCount: 2,
    backgroundSequenceEnabled: true,
  },
};

describe("privacy-safe diagnostics", () => {
  it("reports coarse browser and platform families", () => {
    expect(classifyBrowser(input.userAgent)).toBe("Chrome");
    expect(classifyPlatform(input.userAgent)).toBe("macOS");
  });

  it("uses an allow-list and excludes source content", () => {
    const unsafeInput = {
      ...input,
      fileName: "private-recitation.mp3",
      mediaUrl: "blob:private-media",
      arabicText: "private-arabic-text",
      translation: "private-translation",
    } as DiagnosticsInput;
    const json = JSON.stringify(buildDiagnostics(unsafeInput, "2026-07-16T12:00:00.000Z"));

    expect(json).not.toContain("private-recitation");
    expect(json).not.toContain("private-media");
    expect(json).not.toContain("private-arabic-text");
    expect(json).not.toContain("private-translation");
    expect(json).not.toContain(input.userAgent);
  });

  it("includes useful editor state without identifying the project", () => {
    const report = buildDiagnostics(input, "2026-07-16T12:00:00.000Z");
    expect(report.environment).toMatchObject({
      browser: "Chrome",
      platform: "macOS",
      viewport: "390x844",
    });
    expect(report.editor).toEqual(input.editor);
  });
});
