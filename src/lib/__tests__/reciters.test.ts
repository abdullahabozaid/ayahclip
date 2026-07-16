import { describe, expect, it } from "vitest";

import { getAudioUrl } from "../api";
import { reciters } from "../reciters";

describe("reciter audio sources", () => {
  it("uses EveryAyah's verified Minshawy Murattal directory spelling", () => {
    const reciter = reciters.find((item) => item.id === "minshawi-murattal");

    expect(reciter?.folder).toBe("Minshawy_Murattal_128kbps");
    expect(getAudioUrl(reciter!.folder, 1, 1)).toBe(
      "https://everyayah.com/data/Minshawy_Murattal_128kbps/001001.mp3"
    );
  });
});
