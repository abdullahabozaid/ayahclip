import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createNodeAsrRunner,
  decodeAudioFile,
  NODE_ASR_SAMPLE_RATE,
} from "./lib/node-asr";

function concatenate(parts: readonly Float32Array[]): Float32Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
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

async function main() {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const fixtures = join(root, "tmp/alignment-benchmark");
  const intro = decodeAudioFile(join(fixtures, "holdout-ghamadi/001002.mp3"));
  const target = readdirSync(join(fixtures, "alafasy-mid-surah"))
    .filter((name) => name.endsWith(".mp3"))
    .sort()
    .map((name) => decodeAudioFile(join(fixtures, "alafasy-mid-surah", name)));
  const pause = new Float32Array(Math.round(NODE_ASR_SAMPLE_RATE * 0.75));
  const audio = concatenate([intro, pause, ...target]);
  const audioBuffer = asAudioBuffer(audio);

  const corpusJson = readFileSync(join(root, "public/quran-corpus.json"), "utf8");
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).includes("quran-corpus.json")) {
      return { json: async () => JSON.parse(corpusJson) } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const {
    assessVerseMatch,
    hasCompetingRecognitionWindow,
    loadCorpus,
    recoverLeadingVerse,
    recoverRecognitionWindowCandidates,
    selectRecognitionCandidates,
  } = await import("../src/lib/verse-match");
  const { findSilenceCenters, findSpeechSpan } = await import("../src/lib/audio-import");
  const { recognitionTranscriptWindows } = await import("../src/lib/recognition-retry");
  await loadCorpus();

  const runner = await createNodeAsrRunner(root);
  const emissions = await runner.recognize(audio);
  const assessment = assessVerseMatch(emissions.transcription.text);
  const speechStart = findSpeechSpan(audioBuffer).start;
  const recovery = assessment.match
    ? recoverLeadingVerse(assessment.match, emissions.transcription.charTimes[0], speechStart)
    : null;
  const predicted = recovery?.match ?? assessment.match;
  const confidence = recovery?.recovered && assessment.confidence === "high"
    ? "medium"
    : assessment.confidence;
  const windows = confidence !== "high"
    ? recognitionTranscriptWindows(
      emissions.transcription,
      findSilenceCenters(audioBuffer),
      audioBuffer.duration,
    )
    : [];
  const recovered = recoverRecognitionWindowCandidates(windows);
  const competingWindow = Boolean(
    predicted && hasCompetingRecognitionWindow(predicted, recovered)
  );
  const reviewPrimary = recovered[0] ?? predicted;
  const candidates = reviewPrimary
    ? selectRecognitionCandidates(reviewPrimary, [
      ...recovered.slice(1),
      ...(predicted ? [predicted] : []),
      ...assessment.alternatives,
    ])
    : [];
  const expected = { surah: 89, ayahStart: 6, ayahEnd: 10 };
  const sameRange = (candidate: typeof expected | null) => Boolean(candidate &&
    candidate.surah === expected.surah &&
    candidate.ayahStart === expected.ayahStart &&
    candidate.ayahEnd === expected.ayahEnd);
  const exact = sameRange(predicted);
  const autoApplied = confidence !== "low" && !competingWindow;
  const falseAutoApply = autoApplied && !exact;
  const expectedInCandidateSet = candidates.some((candidate) => sameRange(candidate));

  console.log(JSON.stringify({
    expectedRange: "89:6-10",
    detectedRange: predicted
      ? `${predicted.surah}:${predicted.ayahStart}-${predicted.ayahEnd}`
      : null,
    confidence,
    competingWindow,
    autoApplied,
    falseAutoApply,
    exact,
    expectedInCandidateSet,
    candidateRanges: candidates.map((candidate) =>
      `${candidate.surah}:${candidate.ayahStart}-${candidate.ayahEnd}`),
    recoveredRanges: recovered.map((candidate) => ({
      range: `${candidate.surah}:${candidate.ayahStart}-${candidate.ayahEnd}`,
      score: Number(candidate.score.toFixed(3)),
    })),
    windowCount: windows.length,
    transcript: emissions.transcription.text,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
