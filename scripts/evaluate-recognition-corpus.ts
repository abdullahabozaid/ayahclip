// Manifest-driven recognition evaluator for unseen or real-handset Quran audio.
// Audio stays outside git. Pass either a JSONL manifest or a directory whose
// filenames begin `surah_ayah_...`, as in the Quran-Lab tlog hold-out set, or
// use EveryAyah's six-digit `SSSAAA.mp3` convention.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createNodeAsrRunner,
  decodeAudioFile,
  editDistance,
  NODE_ASR_SAMPLE_RATE,
} from "./lib/node-asr";

interface CorpusCase {
  id: string;
  audioPath: string;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
}

interface ManifestRow {
  id?: unknown;
  audio?: unknown;
  path?: unknown;
  file?: unknown;
  surah?: unknown;
  chapter?: unknown;
  chapter_id?: unknown;
  ayah?: unknown;
  verse?: unknown;
  verse_number?: unknown;
  ayahStart?: unknown;
  ayahEnd?: unknown;
}

const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"]);

function numericFlag(name: string): number | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : null;
}

function numberFrom(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function caseFromRow(row: ManifestRow, manifestDir: string, index: number): CorpusCase {
  const audio = [row.audio, row.path, row.file].find((value) => typeof value === "string");
  if (typeof audio !== "string" || !audio.trim()) {
    throw new Error(`Manifest row ${index + 1} has no audio/path/file value`);
  }
  const surah = numberFrom(row.surah, row.chapter, row.chapter_id);
  const ayahStart = numberFrom(row.ayahStart, row.ayah, row.verse, row.verse_number);
  const ayahEnd = numberFrom(row.ayahEnd, ayahStart);
  if (!surah || !ayahStart || !ayahEnd || ayahEnd < ayahStart) {
    throw new Error(`Manifest row ${index + 1} has an invalid Quran range`);
  }
  const audioPath = resolve(manifestDir, audio);
  if (!existsSync(audioPath)) throw new Error(`Audio not found: ${audioPath}`);
  return {
    id: typeof row.id === "string" && row.id ? row.id : `${surah}:${ayahStart}-${ayahEnd}:${index + 1}`,
    audioPath,
    surah,
    ayahStart,
    ayahEnd,
  };
}

function loadCases(inputPath: string): CorpusCase[] {
  const absolute = resolve(inputPath);
  if (!existsSync(absolute)) throw new Error(`Corpus input not found: ${absolute}`);
  if (statSync(absolute).isDirectory()) {
    return readdirSync(absolute)
      .filter((name) => AUDIO_EXTENSIONS.has(extname(name).toLowerCase()))
      .sort()
      .map((name, index) => {
        const match = /^(\d{1,3})_(\d{1,3})(?:_|\.)/.exec(name) ??
          /^(\d{3})(\d{3})(?:_|\.)/.exec(name);
        if (!match) {
          throw new Error(`Cannot infer surah and ayah from ${name}; use a JSONL manifest`);
        }
        const surah = Number(match[1]);
        const ayah = Number(match[2]);
        return {
          id: `${surah}:${ayah}:${index + 1}`,
          audioPath: join(absolute, name),
          surah,
          ayahStart: ayah,
          ayahEnd: ayah,
        };
      });
  }
  const manifestDir = dirname(absolute);
  return readFileSync(absolute, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => caseFromRow(JSON.parse(line) as ManifestRow, manifestDir, index));
}

function asAudioBuffer(audio: Float32Array): AudioBuffer {
  return {
    numberOfChannels: 1,
    sampleRate: NODE_ASR_SAMPLE_RATE,
    length: audio.length,
    duration: audio.length / NODE_ASR_SAMPLE_RATE,
    getChannelData: () => audio,
  } as unknown as AudioBuffer;
}

function sameRange(
  candidate: { surah: number; ayahStart: number; ayahEnd: number } | null,
  expected: CorpusCase,
) {
  return Boolean(candidate &&
    candidate.surah === expected.surah &&
    candidate.ayahStart === expected.ayahStart &&
    candidate.ayahEnd === expected.ayahEnd);
}

async function main() {
  const input = process.argv[2];
  if (!input || input.startsWith("--")) {
    throw new Error(
      "Usage: npm run benchmark:recognition-corpus -- <manifest.jsonl|audio-directory> [--limit N] [--min-exact 0.8] [--min-top3 0.95] [--min-candidate-recall 0.98] [--max-false-auto 0]",
    );
  }
  const limit = numericFlag("--limit");
  const cases = loadCases(input).slice(0, limit && limit > 0 ? limit : undefined);
  if (cases.length === 0) throw new Error("Recognition corpus contains no audio cases");

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const corpusJson = readFileSync(join(projectRoot, "public/quran-corpus.json"), "utf8");
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).includes("quran-corpus.json")) {
      return { json: async () => JSON.parse(corpusJson) } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const {
    assessVerseMatch,
    getVersesText,
    loadCorpus,
    normalizeArabic,
    recoverLeadingVerse,
    selectRecognitionCandidates,
  } = await import("../src/lib/verse-match");
  const { findSpeechSpan } = await import("../src/lib/audio-import");
  await loadCorpus();
  const runner = await createNodeAsrRunner(projectRoot);

  const results = [];
  for (const item of cases) {
    const audio = decodeAudioFile(item.audioPath);
    const emissions = await runner.recognize(audio);
    const assessment = assessVerseMatch(emissions.transcription.text);
    const speechStart = findSpeechSpan(asAudioBuffer(audio)).start;
    const recovery = assessment.match
      ? recoverLeadingVerse(
        assessment.match,
        emissions.transcription.charTimes[0],
        speechStart,
      )
      : null;
    const predicted = recovery?.match ?? assessment.match;
    const effectiveConfidence = recovery?.recovered && assessment.confidence === "high"
      ? "medium"
      : assessment.confidence;
    const candidates = predicted
      ? selectRecognitionCandidates(predicted, assessment.alternatives, 3)
      : [];
    const allCandidates = predicted
      ? selectRecognitionCandidates(predicted, assessment.alternatives, 10)
      : [];
    const reference = normalizeArabic(
      getVersesText(item.surah, item.ayahStart, item.ayahEnd).text,
    );
    const transcript = normalizeArabic(emissions.transcription.text);
    const exact = sameRange(predicted, item);
    const top3 = candidates.some((candidate) => sameRange(candidate, item));
    const candidateRecall = allCandidates.some((candidate) => sameRange(candidate, item));
    const autoApplied = effectiveConfidence !== "low";
    results.push({
      id: item.id,
      audio: item.audioPath,
      expectedRange: `${item.surah}:${item.ayahStart}-${item.ayahEnd}`,
      detectedRange: predicted
        ? `${predicted.surah}:${predicted.ayahStart}-${predicted.ayahEnd}`
        : null,
      confidence: effectiveConfidence,
      score: predicted ? Number(predicted.score.toFixed(3)) : null,
      margin: Number(assessment.margin.toFixed(3)),
      exact,
      expectedInTop3: top3,
      expectedInCandidateSet: candidateRecall,
      autoApplied,
      falseAutoApply: autoApplied && !exact,
      recoveredLeadingVerse: recovery?.recovered ?? false,
      characterErrorRate: Number(
        (editDistance(transcript, reference) / Math.max(1, reference.length)).toFixed(3),
      ),
      transcript: emissions.transcription.text,
    });
  }

  const exactCount = results.filter((result) => result.exact).length;
  const top3Count = results.filter((result) => result.expectedInTop3).length;
  const candidateCount = results.filter((result) => result.expectedInCandidateSet).length;
  const autoApplied = results.filter((result) => result.autoApplied);
  const falseAutoCount = results.filter((result) => result.falseAutoApply).length;
  const meanCer = results.reduce((sum, result) => sum + result.characterErrorRate, 0) /
    results.length;
  const summary = {
    cases: results.length,
    exactRangeAccuracy: Number((exactCount / results.length).toFixed(3)),
    top3RangeRecall: Number((top3Count / results.length).toFixed(3)),
    candidateRangeRecall: Number((candidateCount / results.length).toFixed(3)),
    autoAppliedCases: autoApplied.length,
    autoApplyPrecision: Number(((autoApplied.length - falseAutoCount) /
      Math.max(1, autoApplied.length)).toFixed(3)),
    falseAutoApplies: falseAutoCount,
    lowConfidenceCases: results.filter((result) => result.confidence === "low").length,
    meanCharacterErrorRate: Number(meanCer.toFixed(3)),
  };
  console.log(JSON.stringify({ input: resolve(input), summary, results }, null, 2));

  const minExact = numericFlag("--min-exact");
  const minTop3 = numericFlag("--min-top3");
  const minCandidateRecall = numericFlag("--min-candidate-recall");
  const maxFalseAuto = numericFlag("--max-false-auto");
  const failures = [
    minExact !== null && summary.exactRangeAccuracy < minExact
      ? `exact range accuracy ${summary.exactRangeAccuracy} < ${minExact}`
      : null,
    minTop3 !== null && summary.top3RangeRecall < minTop3
      ? `top-3 recall ${summary.top3RangeRecall} < ${minTop3}`
      : null,
    minCandidateRecall !== null && summary.candidateRangeRecall < minCandidateRecall
      ? `candidate recall ${summary.candidateRangeRecall} < ${minCandidateRecall}`
      : null,
    maxFalseAuto !== null && summary.falseAutoApplies > maxFalseAuto
      ? `false auto-applies ${summary.falseAutoApplies} > ${maxFalseAuto}`
      : null,
  ].filter(Boolean);
  if (failures.length > 0) throw new Error(`Recognition corpus gate failed: ${failures.join("; ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
