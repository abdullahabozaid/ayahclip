// Synthetic accuracy tests for verse detection + forced alignment.
//   Run: npx tsx scripts/test-detection.ts
//
// These exercise the pure-logic core (matcher, muqatta'āt verse-1 leniency,
// Needleman–Wunsch forced alignment) against the real corpus, with no audio.
// Real-recitation accuracy still needs a human listening to actual clips — this
// only guards the text/timing logic from regressing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpusPath = join(__dirname, "..", "public", "quran-corpus.json");

// loadCorpus() does `fetch("/quran-corpus.json")`; serve it from disk under Node.
const corpusBody = readFileSync(corpusPath, "utf8");
globalThis.fetch = (async (url: string) => {
  if (String(url).includes("quran-corpus.json")) {
    return { json: async () => JSON.parse(corpusBody) } as Response;
  }
  throw new Error(`unexpected fetch in test: ${url}`);
}) as typeof fetch;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Deterministic PRNG so "noisy ASR" cases are reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Drop `rate` fraction of characters to mimic ASR deletions.
function dropChars(text: string, rate: number, seed: number): string {
  const rng = mulberry32(seed);
  return [...text].filter(() => rng() > rate).join("");
}

async function main() {
const { loadCorpus, matchVerses, getVersesText } = await import("../src/lib/verse-match");
const { verseTextAt } = await import("../src/lib/audio-import");
await loadCorpus();

console.log("\n── Matcher: exact text → correct surah + range ──");
const matchCases: { name: string; surah: number; lo: number; hi: number }[] = [
  { name: "Al-Fatihah 1:1-7", surah: 1, lo: 1, hi: 7 },
  { name: "Al-Ikhlas 112:1-4", surah: 112, lo: 1, hi: 4 },
  { name: "Ayat al-Kursi 2:255", surah: 2, lo: 255, hi: 255 },
  { name: "Al-Baqarah 2:1-5 (muqatta'āt)", surah: 2, lo: 1, hi: 5 },
  { name: "Al-Fajr 89:1-10 (was misdetected as 2)", surah: 89, lo: 1, hi: 10 },
  { name: "An-Nas 114:1-6", surah: 114, lo: 1, hi: 6 },
];
for (const c of matchCases) {
  const { text } = getVersesText(c.surah, c.lo, c.hi);
  const m = matchVerses(text);
  check(
    c.name,
    !!m && m.surah === c.surah && m.ayahStart === c.lo && m.ayahEnd === c.hi,
    m ? `got ${m.surah}:${m.ayahStart}-${m.ayahEnd} score=${m.score.toFixed(2)}` : "no match"
  );
}

console.log("\n── Matcher: mid-surah start keeps muqatta'āt verse 1 OUT ──");
{
  // Al-Fajr verses 6-9 alone must NOT pull in Al-Fajr verse 1, and must stay in surah 89.
  const { text } = getVersesText(89, 6, 9);
  const m = matchVerses(text);
  check(
    "Al-Fajr 89:6-9 stays surah 89, starts at 6",
    !!m && m.surah === 89 && m.ayahStart === 6,
    m ? `got ${m.surah}:${m.ayahStart}-${m.ayahEnd}` : "no match"
  );
}

console.log("\n── Matcher: robust to ASR-style deletions ──");
for (const rate of [0.1, 0.18, 0.25]) {
  const { text } = getVersesText(2, 255, 255); // Ayat al-Kursi — long, distinctive
  const noisy = dropChars(text, rate, 42);
  const m = matchVerses(noisy);
  check(
    `Ayat al-Kursi with ${Math.round(rate * 100)}% chars dropped → surah 2`,
    !!m && m.surah === 2 && m.ayahStart <= 255 && m.ayahEnd >= 255,
    m ? `got ${m.surah}:${m.ayahStart}-${m.ayahEnd} score=${m.score.toFixed(2)}` : "no match"
  );
}

console.log("\n── Matcher: gibberish → no false match (returns null) ──");
{
  const m = matchVerses("زقشثضصطعغفقكمنهويلاب لا يوجد نص قراني هنا اطلاقا");
  check("random Arabic letters → null or low-confidence handled", m === null || m.score < 0.95,
    m ? `got ${m.surah}:${m.ayahStart}-${m.ayahEnd} score=${m.score.toFixed(2)}` : "null");
}

// Forced alignment moved from decode-then-fuzzy-match to TRUE CTC forced
// alignment on the model's per-frame emissions. Because that needs the browser
// ONNX model (not runnable from this Node script), its logic is covered by the
// vitest suites instead: ctc-align (Viterbi), ctc-vocab (skeleton tokenization +
// emission marginalization), and forced-align (timing assembly / fade-in / snap).

console.log("\n── Intra-verse splits: verseTextAt segment math ──");
{
  const t = { verseNumber: 1, start: 0, end: 10, splits: [5] };
  const text = "a b c d e f g h i j"; // 10 words
  check("before split → first half", verseTextAt(t, text, 2) === "a b c d e", `got "${verseTextAt(t, text, 2)}"`);
  check("after split → second half", verseTextAt(t, text, 7) === "f g h i j", `got "${verseTextAt(t, text, 7)}"`);
  check("at split boundary → second half", verseTextAt(t, text, 5) === "f g h i j");
}
{
  const t = { verseNumber: 1, start: 0, end: 12, splits: [4, 8] };
  const words = Array.from({ length: 12 }, (_, i) => String(i + 1)).join(" ");
  check("no splits → full text", verseTextAt({ verseNumber: 1, start: 0, end: 12 }, words, 5) === words);
  const s0 = verseTextAt(t, words, 1);
  const s1 = verseTextAt(t, words, 5);
  const s2 = verseTextAt(t, words, 10);
  check("3 segments cover all 12 words", (s0.split(" ").length + s1.split(" ").length + s2.split(" ").length) === 12,
    `got ${s0.split(" ").length}+${s1.split(" ").length}+${s2.split(" ").length}`);
  check("3 segments are disjoint and in order",
    s0 === "1 2 3 4" && s1 === "5 6 7 8" && s2 === "9 10 11 12",
    `s0="${s0}" s1="${s1}" s2="${s2}"`);
}
{
  // Edge: single-word verse → no segmentation, return full.
  const t = { verseNumber: 1, start: 0, end: 5, splits: [2] };
  check("single-word verse falls back to full text", verseTextAt(t, "only", 3) === "only");
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
