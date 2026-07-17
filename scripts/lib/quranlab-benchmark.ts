import { normalizeArabic } from "../../src/lib/verse-match";

export interface QuranCorpusReference {
  s: number;
  a: number;
  c: string;
}

export interface QuranLabBenchmarkRow {
  id?: unknown;
  source?: unknown;
  reference_text?: unknown;
  text?: unknown;
  audio?: unknown;
  reciter?: unknown;
}

export interface AyahClipBenchmarkRow {
  id: string;
  audio: string;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  tags: string[];
  license: string;
  reciter: string;
  device: string;
  referenceText: string;
  benchmarkSource: string;
}

export interface QuranLabConversionResult {
  rows: AyahClipBenchmarkRow[];
  skippedAmbiguous: number;
  skippedInvalid: number;
  skippedUnmatched: number;
}

interface ReferenceLocation {
  surah: number;
  ayah: number;
}

function referenceIndex(corpus: readonly QuranCorpusReference[]): Map<string, ReferenceLocation[]> {
  const index = new Map<string, ReferenceLocation[]>();
  for (const verse of corpus) {
    const key = normalizeArabic(verse.c);
    const locations = index.get(key) ?? [];
    locations.push({ surah: verse.s, ayah: verse.a });
    index.set(key, locations);
  }
  return index;
}

function nonempty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Convert the gated Quran-Lab ASR benchmark into AyahClip's local manifest.
 * Repeated verses are excluded because audio/text alone cannot prove which
 * occurrence was intended; no guessed Quran range is allowed into the gate.
 */
export function convertQuranLabBenchmark(
  input: readonly QuranLabBenchmarkRow[],
  corpus: readonly QuranCorpusReference[],
  sourceFilter?: string,
): QuranLabConversionResult {
  const references = referenceIndex(corpus);
  const rows: AyahClipBenchmarkRow[] = [];
  let skippedAmbiguous = 0;
  let skippedInvalid = 0;
  let skippedUnmatched = 0;

  for (const [index, row] of input.entries()) {
    const source = nonempty(row.source);
    if (sourceFilter && source !== sourceFilter) continue;
    const audio = nonempty(row.audio);
    const referenceText = nonempty(row.reference_text) ?? nonempty(row.text);
    if (!source || !audio || !referenceText) {
      skippedInvalid += 1;
      continue;
    }

    const locations = references.get(normalizeArabic(referenceText)) ?? [];
    if (locations.length === 0) {
      skippedUnmatched += 1;
      continue;
    }
    if (locations.length > 1) {
      skippedAmbiguous += 1;
      continue;
    }

    const location = locations[0];
    const phone = source === "tlog_holdout";
    rows.push({
      id: nonempty(row.id) ?? `${source}:${index + 1}`,
      audio,
      surah: location.surah,
      ayahStart: location.ayah,
      ayahEnd: location.ayah,
      tags: phone ? ["phone", "unseen-reciter"] : ["unseen-reciter"],
      license: `Quran-Lab/quranic-asr-benchmark gated ASR research/evaluation terms; upstream ${source}; no redistribution`,
      reciter: nonempty(row.reciter) ?? source,
      device: phone ? "real phone microphone" : "source studio recording",
      referenceText,
      benchmarkSource: source,
    });
  }

  return { rows, skippedAmbiguous, skippedInvalid, skippedUnmatched };
}
