import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * Guards the four-place settings duplication that silently dropped
 * translationVerseNumber, wordHighlight and backgroundVideoSync. Until the
 * declarations are unified (Phase 1), this test is what keeps them in sync.
 */
function appStateSettingFields(): Set<string> {
  const src = read("src/lib/store.ts");
  const block = src.slice(src.indexOf("interface AppState"), src.indexOf("  setSurah:"));
  const fields = new Set(
    [...block.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1])
  );
  // Runtime/session state that is deliberately not persisted.
  for (const t of [
    "surah", "verses", "selectedVerseNumbers", "currentVerseIndex", "projectId",
    "playbackSegmentArabic", "playbackSegmentTranslation", "playbackSegmentIsLast",
    "activeWordIndex", "audioSource", "verseParts", "activePartIndex",
    "pendingTemplateMedia",
  ]) fields.delete(t);
  return fields;
}

function projectSettingsFields(): Set<string> {
  const src = read("src/types/index.ts");
  const start = src.indexOf("  settings: {");
  const block = src.slice(start, src.indexOf("\n  };", start));
  return new Set([...block.matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]));
}

function saveNowFields(): Set<string> {
  const src = read("src/app/studio/page.tsx");
  const start = src.indexOf("      settings: {");
  const block = src.slice(start, src.indexOf("\n      },", start));
  return new Set([...block.matchAll(/(\w+):\s*state\./g)].map((m) => m[1]));
}

describe("settings persistence round-trip", () => {
  it("every persistable store field is declared in Project['settings']", () => {
    const missing = [...appStateSettingFields()].filter((f) => !projectSettingsFields().has(f));
    expect(missing).toEqual([]);
  });

  it("every persistable store field is written by saveNow", () => {
    const missing = [...appStateSettingFields()].filter((f) => !saveNowFields().has(f));
    expect(missing).toEqual([]);
  });

  it("saveNow writes nothing that Project['settings'] does not declare", () => {
    const extra = [...saveNowFields()].filter((f) => !projectSettingsFields().has(f));
    expect(extra).toEqual([]);
  });

  it("the three previously-dropped toggles are covered", () => {
    for (const f of ["translationVerseNumber", "wordHighlight", "backgroundVideoSync"]) {
      expect(projectSettingsFields()).toContain(f);
      expect(saveNowFields()).toContain(f);
    }
  });
});
