import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchVerses } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QPC Hafs source pairing", () => {
  it("requests and retains the Unicode source matched to UthmanicHafs", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("api.alquran.cloud")) {
        return new Response(JSON.stringify({ data: { ayahs: [] } }), { status: 200 });
      }
      return new Response(JSON.stringify({
        verses: [{
          id: 1,
          verse_number: 1,
          verse_key: "1:1",
          text_uthmani: "بِسْمِ ٱللَّهِ",
          text_qpc_hafs: "بِسۡمِ ٱللَّهِ",
          translations: [{ text: "In the name of Allah" }],
          words: [{
            position: 1,
            code_v2: "glyph",
            page_number: 1,
            line_number: 1,
            text_uthmani: "بِسْمِ",
            text_qpc_hafs: "بِسۡمِ",
            char_type_name: "word",
          }],
        }],
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const verses = await fetchVerses(1);

    expect(String(fetchMock.mock.calls[0][0])).toContain("fields=text_uthmani,text_qpc_hafs");
    expect(String(fetchMock.mock.calls[0][0])).toContain("word_fields=code_v2,text_uthmani,text_qpc_hafs");
    expect(verses[0].text_qpc_hafs).toBe("بِسۡمِ ٱللَّهِ");
    expect(verses[0].qcfWords?.[0].text_qpc_hafs).toBe("بِسۡمِ");
  });
});
