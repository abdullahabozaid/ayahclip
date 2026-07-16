// Real-audio regression harness for AyahClip's browser ASR + CTC aligner.
//
// Usage:
//   npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/alafasy
//
// The directory must contain one MP3 per verse, named 001001.mp3, 001002.mp3,
// etc. Each file is decoded independently, then the PCM is concatenated. That
// gives us exact ground-truth verse boundaries without hand-labeling.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  mel_filter_bank,
  spectrogram,
  window_function,
} from "@huggingface/transformers";
import * as ort from "onnxruntime-web/wasm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE_RATE = 16_000;
const N_FFT = 512;
const HOP_LENGTH = 160;
const WIN_LENGTH = 400;
const N_MELS = 80;
const PREEMPH = 0.97;
const DITHER = 1e-5;
const LOG_GUARD = 1e-5;

function decodeMp3(path: string): Float32Array {
  const raw = execFileSync("ffmpeg", [
    "-v", "error", "-i", path, "-f", "f32le", "-acodec", "pcm_f32le",
    "-ac", "1", "-ar", String(SAMPLE_RATE), "pipe:1",
  ], { maxBuffer: 256 * 1024 * 1024 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
}

function concatenate(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

async function computeMel(audio: Float32Array) {
  const filters = mel_filter_bank(
    N_FFT / 2 + 1, N_MELS, 0, 8000, SAMPLE_RATE, "slaney", "htk"
  );
  const window = window_function(WIN_LENGTH, "hann", { periodic: true });
  const dithered = new Float32Array(audio.length);
  let ditherState = 0x6d2b79f5;
  for (let i = 0; i < audio.length; i++) {
    ditherState = (Math.imul(ditherState, 1664525) + 1013904223) >>> 0;
    const noise = (ditherState / 4294967296) * 2 - 1;
    dithered[i] = audio[i] + DITHER * noise;
  }
  const spec = await spectrogram(dithered, window, WIN_LENGTH, HOP_LENGTH, {
    fft_length: N_FFT,
    power: 2,
    center: false,
    pad_mode: "reflect",
    onesided: true,
    preemphasis: PREEMPH,
    mel_filters: filters,
    mel_floor: 1e-10,
    transpose: false,
  });
  const data = spec.data as Float32Array;
  const timeFrames = spec.dims[1];
  const features = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) features[i] = Math.log(data[i] + LOG_GUARD);
  for (let m = 0; m < N_MELS; m++) {
    let sum = 0;
    for (let t = 0; t < timeFrames; t++) sum += features[m * timeFrames + t];
    const mean = sum / timeFrames;
    let sumSq = 0;
    for (let t = 0; t < timeFrames; t++) {
      const delta = features[m * timeFrames + t] - mean;
      sumSq += delta * delta;
    }
    const std = Math.sqrt(sumSq / timeFrames) || 1e-10;
    for (let t = 0; t < timeFrames; t++) {
      features[m * timeFrames + t] = (features[m * timeFrames + t] - mean) / std;
    }
  }
  return { features, timeFrames };
}

function logSoftmax(data: Float32Array, T: number, V: number): Float32Array {
  const out = new Float32Array(T * V);
  for (let t = 0; t < T; t++) {
    const base = t * V;
    let max = -Infinity;
    for (let v = 0; v < V; v++) max = Math.max(max, data[base + v]);
    let sum = 0;
    for (let v = 0; v < V; v++) sum += Math.exp(data[base + v] - max);
    const lse = max + Math.log(sum);
    for (let v = 0; v < V; v++) out[base + v] = data[base + v] - lse;
  }
  return out;
}

function greedyDecode(
  data: Float32Array,
  T: number,
  V: number,
  vocab: Record<string, string>,
  frameDuration: number
) {
  const entries: { char: string; time: number }[] = [];
  let previous = -1;
  for (let t = 0; t < T; t++) {
    const base = t * V;
    let best = 0;
    for (let v = 1; v < V; v++) if (data[base + v] > data[base + best]) best = v;
    if (best !== previous && vocab[String(best)] !== "<blank>") {
      for (const char of vocab[String(best)] ?? "") {
        const rendered = char === "▁" ? " " : char;
        if (rendered === " " &&
          (entries.length === 0 || entries[entries.length - 1].char === " ")) continue;
        entries.push({ char: rendered, time: t * frameDuration });
      }
    }
    previous = best;
  }
  while (entries.at(-1)?.char === " ") entries.pop();
  return {
    text: entries.map((entry) => entry.char).join(""),
    charTimes: entries.map((entry) => entry.time),
  };
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

async function main() {
  const sourceDir = resolve(process.argv[2] || "tmp/alignment-benchmark/alafasy");
  const files = readdirSync(sourceDir)
    .filter((name) => /^\d{6}\.mp3$/.test(name))
    .sort();
  if (files.length < 2) throw new Error(`Need at least two verse MP3s in ${sourceDir}`);

  const surahs = new Set(files.map((name) => Number(name.slice(0, 3))));
  if (surahs.size !== 1) throw new Error("All benchmark files must be from one surah");
  const surah = [...surahs][0];
  const verseNumbers = files.map((name) => Number(name.slice(3, 6)));
  const parts = files.map((name) => decodeMp3(join(sourceDir, name)));
  const expectedStarts: number[] = [];
  let samples = 0;
  for (const part of parts) {
    expectedStarts.push(samples / SAMPLE_RATE);
    samples += part.length;
  }
  const audio = concatenate(parts);
  const duration = audio.length / SAMPLE_RATE;

  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  const wasmDir = resolve(ROOT, "node_modules/onnxruntime-web/dist") + "/";
  ort.env.wasm.wasmPaths = pathToFileURL(wasmDir).href;
  const model = readFileSync(join(ROOT, "public/asr/fastconformer_ar_ctc_q8.onnx"));
  const session = await ort.InferenceSession.create(
    model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength),
    { executionProviders: ["wasm"] }
  );
  const { features, timeFrames } = await computeMel(audio);
  const input = new ort.Tensor("float32", features, [1, N_MELS, timeFrames]);
  const length = new ort.Tensor("int64", BigInt64Array.from([BigInt(timeFrames)]), [1]);
  const outputMap = await session.run({
    [session.inputNames[0]]: input,
    [session.inputNames[1]]: length,
  });
  const output = outputMap[session.outputNames[0]];
  const [, T, V] = output.dims as number[];
  const vocab = JSON.parse(readFileSync(join(ROOT, "public/asr-vocab.json"), "utf8"));

  const corpus = readFileSync(join(ROOT, "public/quran-corpus.json"), "utf8");
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).includes("quran-corpus.json")) {
      return { json: async () => JSON.parse(corpus) } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
  const { getVerseWeights, getVersesText, loadCorpus, matchVerses, normalizeArabic } =
    await import("../src/lib/verse-match");
  const { forceAlignVerses } = await import("../src/lib/forced-align");
  const { autoSegment, findSilenceCenters, findSpeechSpan } = await import("../src/lib/audio-import");
  await loadCorpus();
  const asAudioBuffer = (pcm: Float32Array) => ({
    numberOfChannels: 1,
    sampleRate: SAMPLE_RATE,
    length: pcm.length,
    duration: pcm.length / SAMPLE_RATE,
    getChannelData: () => pcm,
  }) as unknown as AudioBuffer;
  const audioBuffer = {
    numberOfChannels: 1,
    sampleRate: SAMPLE_RATE,
    length: audio.length,
    duration,
    getChannelData: () => audio,
  } as unknown as AudioBuffer;
  const decoded = greedyDecode(output.data as Float32Array, T, V, vocab, duration / T);
  const aligned = forceAlignVerses({
    emissions: {
      logProbs: logSoftmax(output.data as Float32Array, T, V),
      T,
      V,
      frameDur: duration / T,
      blankId: 1024,
      vocab,
      transcription: { ...decoded, wordStarts: [] },
    },
    surah,
    verseNumbers,
    audioDuration: duration,
    audioStart: findSpeechSpan(audioBuffer).start,
    silences: findSilenceCenters(audioBuffer),
  });
  if (!aligned) throw new Error("Alignment returned null");

  const expectedOnsets = expectedStarts.map(
    (cut, index) => cut + findSpeechSpan(asAudioBuffer(parts[index])).start
  );
  const cutErrors = aligned.map((timing, index) => Math.abs(timing.start - expectedStarts[index]));
  const onsetErrors = aligned.map((timing, index) => Math.abs(timing.start - expectedOnsets[index]));
  const transcript = decoded.text;
  const normalizedTranscript = normalizeArabic(transcript);
  const reference = normalizeArabic(
    getVersesText(surah, verseNumbers[0], verseNumbers[verseNumbers.length - 1]).text
  );
  const detection = matchVerses(transcript);
  const { alignTranscriptVerses } = await import("../src/lib/transcript-align");
  const transcriptResult = alignTranscriptVerses({
    text: transcript,
    charTimes: decoded.charTimes,
    surah,
    verseNumbers,
    audioDuration: duration,
  });
  const transcriptAligned = transcriptResult?.timings ?? null;
  const transcriptErrors = transcriptAligned?.map(
    (timing, index) => Math.abs(timing.start - expectedOnsets[index])
  ) ?? [];
  const pauseBaseline = autoSegment(
    audioBuffer,
    verseNumbers,
    getVerseWeights(surah, verseNumbers[0], verseNumbers[verseNumbers.length - 1])
  );
  const pauseErrors = pauseBaseline.map(
    (timing, index) => Math.abs(timing.start - expectedStarts[index])
  );
  const relevantCuts = cutErrors.slice(1);
  const relevantOnsets = onsetErrors.slice(1);
  const cutMae = relevantCuts.reduce((sum, value) => sum + value, 0) / relevantCuts.length;
  const onsetMae = relevantOnsets.reduce((sum, value) => sum + value, 0) / relevantOnsets.length;
  console.log(JSON.stringify({
    sourceDir,
    durationSeconds: Number(duration.toFixed(3)),
    recognition: {
      transcript,
      characterErrorRate: Number(
        (editDistance(normalizedTranscript, reference) / Math.max(1, reference.length)).toFixed(3)
      ),
      detectedRange: detection
        ? `${detection.surah}:${detection.ayahStart}-${detection.ayahEnd}`
        : null,
      detectionScore: detection ? Number(detection.score.toFixed(3)) : null,
    },
    boundaries: aligned.map((timing, index) => ({
      verse: timing.verseNumber,
      expectedCut: Number(expectedStarts[index].toFixed(3)),
      expectedAcousticOnset: Number(expectedOnsets[index].toFixed(3)),
      actual: Number(timing.start.toFixed(3)),
      cutError: Number(cutErrors[index].toFixed(3)),
      onsetError: Number(onsetErrors[index].toFixed(3)),
    })),
    cutMeanAbsoluteErrorSeconds: Number(cutMae.toFixed(3)),
    cutMaxAbsoluteErrorSeconds: Number(Math.max(...relevantCuts).toFixed(3)),
    onsetMeanAbsoluteErrorSeconds: Number(onsetMae.toFixed(3)),
    onsetMaxAbsoluteErrorSeconds: Number(Math.max(...relevantOnsets).toFixed(3)),
    transcriptAlignment: transcriptAligned ? {
      onsetMeanAbsoluteErrorSeconds: Number(
        (transcriptErrors.slice(1).reduce((sum, value) => sum + value, 0) /
          (transcriptErrors.length - 1)).toFixed(3)
      ),
      onsetMaxAbsoluteErrorSeconds: Number(Math.max(...transcriptErrors.slice(1)).toFixed(3)),
      boundaries: transcriptAligned.map((timing, index) => ({
        verse: timing.verseNumber,
        expectedAcousticOnset: Number(expectedOnsets[index].toFixed(3)),
        actual: Number(timing.start.toFixed(3)),
        onsetError: Number(transcriptErrors[index].toFixed(3)),
      })),
    } : null,
    pauseBaseline: {
      cutMeanAbsoluteErrorSeconds: Number(
        (pauseErrors.slice(1).reduce((sum, value) => sum + value, 0) / (pauseErrors.length - 1)).toFixed(3)
      ),
      cutMaxAbsoluteErrorSeconds: Number(Math.max(...pauseErrors.slice(1)).toFixed(3)),
      boundaries: pauseBaseline.map((timing, index) => ({
        verse: timing.verseNumber,
        expectedCut: Number(expectedStarts[index].toFixed(3)),
        actual: Number(timing.start.toFixed(3)),
        cutError: Number(pauseErrors[index].toFixed(3)),
      })),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
