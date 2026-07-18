import { describe, expect, it } from "vitest";

import { getAudioUrl } from "../api";
import { reciters, RECITER_REGIONS, supportsWordTimings } from "../reciters";

describe("reciter audio sources", () => {
  it("uses EveryAyah's verified Minshawy Murattal directory spelling", () => {
    const reciter = reciters.find((item) => item.id === "minshawi-murattal");

    expect(reciter?.folder).toBe("Minshawy_Murattal_128kbps");
    expect(getAudioUrl(reciter!.folder, 1, 1)).toBe(
      "https://everyayah.com/data/Minshawy_Murattal_128kbps/001001.mp3"
    );
  });

  it("offers a broad, grouped verse-level catalog", () => {
    expect(reciters.length).toBeGreaterThanOrEqual(40);
    expect(new Set(reciters.map((reciter) => reciter.id)).size).toBe(reciters.length);
    expect(new Set(reciters.map((reciter) => reciter.folder)).size).toBe(reciters.length);

    for (const region of RECITER_REGIONS) {
      expect(reciters.some((reciter) => reciter.region === region.id)).toBe(true);
    }
  });

  it("distinguishes word-synced voices from whole-verse sources", () => {
    expect(supportsWordTimings(reciters.find((reciter) => reciter.id === "alafasy"))).toBe(true);
    expect(supportsWordTimings(reciters.find((reciter) => reciter.id === "yasser-dossary"))).toBe(false);
    expect(reciters.find((reciter) => reciter.id === "husary-muallim")?.quranComRecitationId).toBe(12);
  });
});
