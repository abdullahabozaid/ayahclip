// Which surahs appear in each of the 30 ajzāʾ (Juz). A Juz spans a contiguous
// range of surahs (the Quran is in surah order), and a surah split by a Juz
// boundary belongs to both adjacent ajzāʾ — so ranges can overlap by one surah.
// Derived from the standard Juz start points (e.g. Juz 2 = 2:142, Juz 14 = 15:1).
export const JUZ_COUNT = 30;

export const JUZ_SURAH_RANGE: Record<number, [number, number]> = {
  1: [1, 2],
  2: [2, 2],
  3: [2, 3],
  4: [3, 4],
  5: [4, 4],
  6: [4, 5],
  7: [5, 6],
  8: [6, 7],
  9: [7, 8],
  10: [8, 9],
  11: [9, 11],
  12: [11, 12],
  13: [12, 14],
  14: [15, 16],
  15: [17, 18],
  16: [18, 20],
  17: [21, 22],
  18: [23, 25],
  19: [25, 27],
  20: [27, 29],
  21: [29, 33],
  22: [33, 36],
  23: [36, 39],
  24: [39, 41],
  25: [41, 45],
  26: [46, 51],
  27: [51, 57],
  28: [58, 66],
  29: [67, 77],
  30: [78, 114],
};

/** True if any part of `surahId` falls within the given Juz. */
export function isSurahInJuz(surahId: number, juz: number): boolean {
  const range = JUZ_SURAH_RANGE[juz];
  if (!range) return true;
  return surahId >= range[0] && surahId <= range[1];
}
