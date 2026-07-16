import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StyleSettings } from "../style";
import {
  SAVED_TEMPLATES_KEY,
  getSavedTemplates,
  sanitizeTemplateForStorage,
  saveTemplate,
} from "../saved-templates";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const base: StyleSettings = {
  arabicFont: "uthmanic-hafs",
  arabicFontSize: 32,
  arabicFontWeight: 400,
  lineHeight: 1,
  textPosition: 50,
  translationEnabled: true,
  translationFont: "sans-serif",
  translationFontSize: 14,
  translationFontWeight: 500,
  textColor: "#ffffff",
  overlayOpacity: 30,
  overlayColor: "#000000",
  textShadow: { enabled: true, color: "#000000", blur: 4, offsetX: 0, offsetY: 2 },
  background: { type: "solid", value: "#08090d", label: "Ink" },
  letterbox: { enabled: false, barColor: "#000000", barStyle: "solid" },
};

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: new MemoryStorage() },
    configurable: true,
  });
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("saved templates", () => {
  it("round-trips a versioned full visual template", () => {
    saveTemplate({
      name: "Gold line",
      mediaPolicy: "use-template-media",
      settings: { ...base, highlightEnabled: true, highlightColor: "#81713a" },
      extras: { clipFadeMs: 350 },
    });
    const saved = getSavedTemplates(base);
    expect(saved).toHaveLength(1);
    expect(saved[0].schemaVersion).toBe(1);
    expect(saved[0].settings.highlightColor).toBe("#81713a");
    expect(saved[0].extras.clipFadeMs).toBe(350);
  });

  it("drops malformed records without hiding valid templates", () => {
    saveTemplate({ name: "Valid", mediaPolicy: "use-template-media", settings: base });
    const raw = JSON.parse(window.localStorage.getItem(SAVED_TEMPLATES_KEY) ?? "[]");
    window.localStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify([{}, ...raw]));
    expect(getSavedTemplates(base).map((item) => item.name)).toEqual(["Valid"]);
  });

  it("replaces transient uploaded media with a reusable slot", () => {
    const sanitized = sanitizeTemplateForStorage({
      name: "Uploaded video",
      mediaPolicy: "use-template-media",
      settings: {
        ...base,
        background: { type: "video", value: "blob:https://ayahclip/video", label: "reciter.mp4" },
      },
    });
    expect(sanitized.settings.background).toEqual({
      type: "solid",
      value: "#08090d",
      label: "Add your media",
    });
    expect(sanitized.mediaSlots).toEqual([
      { id: "background", accepts: "video", label: "reciter.mp4" },
    ]);
    expect(JSON.stringify(sanitized)).not.toContain("blob:");
  });

  it("migrates legacy layout styles without claiming their media", () => {
    window.localStorage.setItem(
      "ayahclip:saved-styles",
      JSON.stringify([{ id: "old", name: "Old style", settings: { arabicFontSize: 44 } }])
    );
    const migrated = getSavedTemplates(base);
    expect(migrated[0].name).toBe("Old style");
    expect(migrated[0].settings.arabicFontSize).toBe(44);
    expect(migrated[0].mediaPolicy).toBe("preserve-current-media");
  });
});
