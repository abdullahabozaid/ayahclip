import { afterEach, describe, expect, it, vi } from "vitest";

import { ensureQcfFontsReady, isQcfPageLoaded } from "@/lib/qcf-font-loader";
import type { QcfWord } from "@/types";

const pageWord: QcfWord = {
  position: 1,
  code_v2: "glyph",
  page_number: 777,
  line_number: 1,
  text_uthmani: "بِسْمِ",
  char_type_name: "word",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QCF page font loading", () => {
  it("retries a page after a transient request failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      });
    const add = vi.fn();
    class FontFaceMock {
      async load() { return this; }
    }

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("FontFace", FontFaceMock);
    vi.stubGlobal("document", { fonts: { add } });

    await expect(ensureQcfFontsReady([pageWord])).rejects.toThrow("Failed to load QCF font p777");
    await expect(ensureQcfFontsReady([pageWord])).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledTimes(1);
    expect(isQcfPageLoaded(777)).toBe(true);
  });
});
