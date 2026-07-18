import { describe, expect, it } from "vitest";
import { filterReciters, groupReciters, normalizeReciterSearch } from "../reciter-discovery";
import { reciters } from "../reciters";

describe("reciter discovery", () => {
  it("matches English and Arabic names without requiring diacritics", () => {
    expect(filterReciters(reciters, "Yasser Dosari", false).map((item) => item.id)).toEqual(["yasser-dossary"]);
    expect(filterReciters(reciters, "ياسر الدوسري", false).map((item) => item.id)).toEqual(["yasser-dossary"]);
    expect(normalizeReciterSearch("ٱلْحُصَرِيّ")).toBe("ٱلحصري");
  });

  it("finds voices by place, style and timing capability", () => {
    const haramain = filterReciters(reciters, "Makkah Madinah", false);
    expect(haramain.length).toBeGreaterThan(10);
    expect(haramain.every((item) => item.region === "haramain")).toBe(true);

    const teachers = filterReciters(reciters, "Muallim", false);
    expect(teachers.map((item) => item.id)).toContain("husary-muallim");

    const synced = filterReciters(reciters, "", true);
    expect(synced.length).toBeGreaterThan(5);
    expect(synced.every((item) => item.quranComRecitationId != null)).toBe(true);
  });

  it("puts favourites and recent voices first without duplicating entries", () => {
    const groups = groupReciters(reciters, ["yasser-dossary"], ["alafasy", "yasser-dossary"]);
    expect(groups[0]).toMatchObject({ id: "favorites", label: "Favourites" });
    expect(groups[0].reciters.map((item) => item.id)).toEqual(["yasser-dossary"]);
    expect(groups[1].reciters.map((item) => item.id)).toEqual(["alafasy"]);

    const ids = groups.flatMap((group) => group.reciters.map((item) => item.id));
    expect(ids).toHaveLength(reciters.length);
    expect(new Set(ids).size).toBe(reciters.length);
  });
});
