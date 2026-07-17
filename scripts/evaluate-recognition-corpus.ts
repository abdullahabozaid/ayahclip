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
import {
  parseRecognitionTags,
  recognitionGateFailures,
  summarizeRecognitionCorpus,
} from "./lib/recognition-corpus";

interface CorpusCase {
  id: string;
  audioPath: string;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  tags: string[];
  license: string | null;
  reciter: string | null;
  device: string | null;
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
  tags?: unknown;
  stressors?: unknown;
  conditions?: unknown;
  license?: unknown;
  licence?: unknown;
  reciter?: unknown;
  device?: unknown;
}

const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"]);

function numericFlag(name: string): number | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : null;
}

function stringFlag(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    tags: parseRecognitionTags([
      ...parseRecognitionTags(row.tags),
      ...parseRecognitionTags(row.stressors),
      ...parseRecognitionTags(row.conditions),
    ]),
    license: text(row.license ?? row.licence),
    reciter: text(row.reciter),
    device: text(row.device),
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
          tags: [],
          license: null,
          reciter: null,
          device: null,
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
      "Usage: npm run benchmark:recognition-corpus -- <manifest.jsonl|audio-directory> [--limit N] [--min-cases N] [--min-exact 0.8] [--min-top3 0.95] [--min-candidate-recall 0.98] [--min-auto-applies N] [--min-auto-precision 1] [--max-false-auto 0] [--require-tags phone,room-echo,compression,background-speech,unseen-reciter] [--min-cases-per-tag N] [--min-tag-candidate-recall 0.9] [--max-tag-false-auto 0] [--require-license-metadata]",
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
    hasCompetingRecognitionWindow,
    loadCorpus,
    normalizeArabic,
    recoverLeadingVerse,
    recoverRecognitionWindowCandidates,
    selectRecognitionCandidates,
  } = await import("../src/lib/verse-match");
  const { findSilenceCenters, findSpeechSpan } = await import("../src/lib/audio-import");
  const { recognitionTranscriptWindows } = await import("../src/lib/recognition-retry");
  await loadCorpus();
  const runner = await createNodeAsrRunner(projectRoot);

  const results = [];
  for (const item of cases) {
    const audio = decodeAudioFile(item.audioPath);
    const emissions = await runner.recognize(audio);
    const assessment = assessVerseMatch(emissions.transcription.text);
    const audioBuffer = asAudioBuffer(audio);
    const speechStart = findSpeechSpan(audioBuffer).start;
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
    const windowCandidates = effectiveConfidence !== "high"
      ? recoverRecognitionWindowCandidates(recognitionTranscriptWindows(
        emissions.transcription,
        findSilenceCenters(audioBuffer),
        audioBuffer.duration,
      ))
      : [];
    const competingWindow = Boolean(
      predicted && hasCompetingRecognitionWindow(predicted, windowCandidates)
    );
    const reviewPrimary = windowCandidates[0] ?? predicted;
    const reviewAlternatives = [
      ...windowCandidates.slice(1),
      ...(predicted ? [predicted] : []),
      ...assessment.alternatives,
    ];
    const candidates = reviewPrimary
      ? selectRecognitionCandidates(reviewPrimary, reviewAlternatives, 3)
      : [];
    const allCandidates = reviewPrimary
      ? selectRecognitionCandidates(reviewPrimary, reviewAlternatives, 10)
      : [];
    const reference = normalizeArabic(
      getVersesText(item.surah, item.ayahStart, item.ayahEnd).text,
    );
    const transcript = normalizeArabic(emissions.transcription.text);
    const exact = sameRange(predicted, item);
    const top3 = candidates.some((candidate) => sameRange(candidate, item));
    const candidateRecall = allCandidates.some((candidate) => sameRange(candidate, item));
    const autoApplied = effectiveConfidence !== "low" && !competingWindow;
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
      tags: item.tags,
      license: item.license,
      reciter: item.reciter,
      device: item.device,
    });
  }

  const summary = summarizeRecognitionCorpus(results);
  console.log(JSON.stringify({ input: resolve(input), summary, results }, null, 2));

  const requiredTags = parseRecognitionTags(stringFlag("--require-tags"));
  const failures = recognitionGateFailures(summary, {
    minCases: numericFlag("--min-cases") ?? undefined,
    minExact: numericFlag("--min-exact") ?? undefined,
    minTop3: numericFlag("--min-top3") ?? undefined,
    minCandidateRecall: numericFlag("--min-candidate-recall") ?? undefined,
    minAutoApplies: numericFlag("--min-auto-applies") ?? undefined,
    minAutoPrecision: numericFlag("--min-auto-precision") ?? undefined,
    maxFalseAuto: numericFlag("--max-false-auto") ?? undefined,
    requiredTags,
    minCasesPerRequiredTag: numericFlag("--min-cases-per-tag") ?? undefined,
    minRequiredTagCandidateRecall: numericFlag("--min-tag-candidate-recall") ?? undefined,
    maxRequiredTagFalseAuto: numericFlag("--max-tag-false-auto") ?? undefined,
    requireLicenseMetadata: process.argv.includes("--require-license-metadata"),
  });
  if (failures.length > 0) throw new Error(`Recognition corpus gate failed: ${failures.join("; ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
