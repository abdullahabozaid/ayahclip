// Download the public per-ayah MP3s used by scripts/evaluate-alignment.ts.
// Files live under ignored tmp/ so the repository never vendors recitations.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "tmp/alignment-benchmark");

const cases = [
  { dir: "alafasy", source: "Alafasy_128kbps", surah: 1, verses: [1, 2, 3, 4, 5, 6, 7] },
  { dir: "minshawi", source: "Minshawy_Murattal_128kbps", surah: 1, verses: [1, 2, 3, 4, 5, 6, 7] },
  { dir: "sudais", source: "Abdurrahmaan_As-Sudais_192kbps", surah: 1, verses: [1, 2, 3, 4, 5, 6, 7] },
  { dir: "husary", source: "Husary_128kbps", surah: 1, verses: [1, 2, 3, 4, 5, 6, 7] },
  { dir: "basit-murattal", source: "Abdul_Basit_Murattal_192kbps", surah: 1, verses: [1, 2, 3, 4, 5, 6, 7] },
  { dir: "alafasy-baqarah-opening", source: "Alafasy_128kbps", surah: 2, verses: [1, 2, 3, 4, 5] },
  { dir: "alafasy-long-ayah", source: "Alafasy_128kbps", surah: 2, verses: [254, 255, 256] },
  { dir: "alafasy-mid-ayah", source: "Alafasy_128kbps", surah: 2, verses: [255, 256] },
  { dir: "alafasy-mid-surah", source: "Alafasy_128kbps", surah: 89, verses: [6, 7, 8, 9, 10] },
  { dir: "alafasy-repeated", source: "Alafasy_128kbps", surah: 55, verses: [13, 14, 15, 16] },
];

const pad = (number) => String(number).padStart(3, "0");

async function downloadFixture(testCase, verse) {
  const file = `${pad(testCase.surah)}${pad(verse)}.mp3`;
  const dir = join(OUT, testCase.dir);
  const target = join(dir, file);
  if (existsSync(target)) return `cached ${testCase.dir}/${file}`;
  mkdirSync(dir, { recursive: true });
  const url = `https://everyayah.com/data/${testCase.source}/${file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} downloading ${url}`);
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  return `saved  ${testCase.dir}/${file}`;
}

for (const testCase of cases) {
  for (const verse of testCase.verses) {
    console.log(await downloadFixture(testCase, verse));
  }
}
