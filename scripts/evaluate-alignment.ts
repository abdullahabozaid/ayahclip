// Real-audio regression harness for AyahClip's browser ASR + CTC aligner.
//
// Usage:
//   npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/alafasy
//   npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/alafasy-mid-ayah --crop-first 18
//   npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/holdout-hudhaify --phone --music-snr 12
//   npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/holdout-ayyoub --intro-seconds 2 --recognition-offset 2.289
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

function numericFlag(name: string, fallback = 0): number {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function rootMeanSquare(audio: Float32Array): number {
  if (audio.length === 0) return 0;
  let sum = 0;
  for (const sample of audio) sum += sample * sample;
  return Math.sqrt(sum / audio.length);
}

/** Deterministic low-level tonal bed: exercises mixed non-speech audio without
 * vendoring or redistributing copyrighted music. */
function mixSyntheticMusic(audio: Float32Array, snrDb: number): Float32Array {
  const signalRms = rootMeanSquare(audio);
  if (signalRms === 0) return audio;
  const raw = new Float32Array(audio.length);
  for (let index = 0; index < raw.length; index++) {
    const time = index / SAMPLE_RATE;
    const pulse = 0.72 + 0.28 * Math.sin(2 * Math.PI * 0.42 * time);
    raw[index] = pulse * (
      0.55 * Math.sin(2 * Math.PI * 196 * time) +
      0.3 * Math.sin(2 * Math.PI * 293.66 * time) +
      0.15 * Math.sin(2 * Math.PI * 392 * time)
    );
  }
  const gain = signalRms / (Math.max(1e-9, rootMeanSquare(raw)) * 10 ** (snrDb / 20));
  const mixed = new Float32Array(audio.length);
  for (let index = 0; index < mixed.length; index++) {
    mixed[index] = Math.max(-1, Math.min(1, audio[index] + raw[index] * gain));
  }
  return mixed;
}

/** Reproducible narrow-band/noisy phone capture approximation. The boundaries
 * remain sample-exact, so this is useful as a regression stressor rather than
 * pretending to replace a future real handset corpus. */
function simulatePhoneCapture(audio: Float32Array): Float32Array {
  const filtered = new Float32Array(audio.length);
  const lowPassAlpha = 1 - Math.exp((-2 * Math.PI * 3400) / SAMPLE_RATE);
  const highPassAlpha = Math.exp((-2 * Math.PI * 120) / SAMPLE_RATE);
  let low = 0;
  let previousInput = 0;
  let high = 0;
  let noiseState = 0x91e10da5;
  const noiseGain = Math.max(0.0008, rootMeanSquare(audio) / 10 ** (26 / 20));
  for (let index = 0; index < audio.length; index++) {
    low += lowPassAlpha * (audio[index] - low);
    high = highPassAlpha * (high + low - previousInput);
    previousInput = low;
    noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
    const noise = ((noiseState / 4294967296) * 2 - 1) * noiseGain;
    filtered[index] = Math.tanh((high + noise) * 1.18);
  }
  return filtered;
}

function syntheticIntro(seconds: number): Float32Array {
  const result = new Float32Array(Math.round(Math.max(0, seconds) * SAMPLE_RATE));
  for (let index = 0; index < result.length; index++) {
    const time = index / SAMPLE_RATE;
    const fade = Math.min(1, time / 0.15, (seconds - time) / 0.15);
    result[index] = Math.max(0, fade) * 0.035 * (
      Math.sin(2 * Math.PI * 220 * time) + 0.45 * Math.sin(2 * Math.PI * 330 * time)
    );
  }
  return result;
}

function trimToSpeech(audio: Float32Array): Float32Array {
  const windowSize = Math.max(1, Math.floor(SAMPLE_RATE * 0.03));
  const windowCount = Math.floor(audio.length / windowSize);
  if (windowCount === 0) return audio;
  const rms = new Float32Array(windowCount);
  let peak = 0;
  for (let window = 0; window < windowCount; window++) {
    let sum = 0;
    const base = window * windowSize;
    for (let index = 0; index < windowSize; index++) {
      const sample = audio[base + index];
      sum += sample * sample;
    }
    rms[window] = Math.sqrt(sum / windowSize);
    peak = Math.max(peak, rms[window]);
  }
  if (peak === 0) return audio;
  const threshold = peak * 0.08;
  let first = 0;
  let last = windowCount - 1;
  while (first < windowCount && rms[first] < threshold) first++;
  while (last > first && rms[last] < threshold) last--;
  return audio.slice(first * windowSize, Math.min(audio.length, (last + 1) * windowSize));
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
  const trimSilence = process.argv.includes("--trim-silence");
  const phoneCapture = process.argv.includes("--phone");
  const musicSnrDb = numericFlag("--music-snr");
  const introSeconds = Math.max(0, numericFlag("--intro-seconds"));
  const recognitionOffset = Math.max(0, numericFlag("--recognition-offset"));
  const cropFirstIndex = process.argv.indexOf("--crop-first");
  const cropFirstSeconds = cropFirstIndex >= 0
    ? Math.max(0, Number(process.argv[cropFirstIndex + 1]) || 0)
    : 0;
  const files = readdirSync(sourceDir)
    .filter((name) => /^\d{6}\.mp3$/.test(name))
    .sort();
  if (files.length < 2) throw new Error(`Need at least two verse MP3s in ${sourceDir}`);

  const surahs = new Set(files.map((name) => Number(name.slice(0, 3))));
  if (surahs.size !== 1) throw new Error("All benchmark files must be from one surah");
  const surah = [...surahs][0];
  const verseNumbers = files.map((name) => Number(name.slice(3, 6)));
  const decodedParts = files.map((name) => decodeMp3(join(sourceDir, name)));
  if (cropFirstSeconds > 0) {
    const cropSamples = Math.floor(cropFirstSeconds * SAMPLE_RATE);
    if (cropSamples >= decodedParts[0].length - SAMPLE_RATE) {
      throw new Error("--crop-first must leave at least one second of the first ayah");
    }
    decodedParts[0] = decodedParts[0].slice(cropSamples);
  }
  const parts = trimSilence ? decodedParts.map(trimToSpeech) : decodedParts;
  const intro = syntheticIntro(introSeconds);
  const expectedStarts: number[] = [];
  let samples = intro.length;
  for (const part of parts) {
    expectedStarts.push(samples / SAMPLE_RATE);
    samples += part.length;
  }
  let audio = concatenate(intro.length ? [intro, ...parts] : parts);
  if (phoneCapture) audio = simulatePhoneCapture(audio);
  if (musicSnrDb > 0) audio = mixSyntheticMusic(audio, musicSnrDb);
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
  const recognitionAudio = recognitionOffset > 0
    ? audio.slice(Math.round(recognitionOffset * SAMPLE_RATE))
    : audio;
  const { features, timeFrames } = await computeMel(recognitionAudio);
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
  const {
    assessVerseMatch,
    getVerseWeights,
    getVersesText,
    loadCorpus,
    normalizeArabic,
    recoverLeadingVerse,
  } =
    await import("../src/lib/verse-match");
  const { forceAlignVerses, forceAlignVersesDetailed } = await import("../src/lib/forced-align");
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
  const speechSpan = findSpeechSpan(audioBuffer);
  const decoded = greedyDecode(
    output.data as Float32Array,
    T,
    V,
    vocab,
    (recognitionAudio.length / SAMPLE_RATE) / T,
  );
  if (recognitionOffset > 0) {
    decoded.charTimes = decoded.charTimes.map((time) => time + recognitionOffset);
  }
  const emissions = {
    logProbs: logSoftmax(output.data as Float32Array, T, V),
    T,
    V,
    frameDur: (recognitionAudio.length / SAMPLE_RATE) / T,
    timeOffset: recognitionOffset,
    blankId: 1024,
    vocab,
    transcription: { ...decoded, wordStarts: [] },
  };
  const silences = findSilenceCenters(audioBuffer);
  const alignment = forceAlignVersesDetailed({
    emissions,
    surah,
    verseNumbers,
    audioDuration: duration,
    audioStart: speechSpan.start,
    silences,
  });
  if (!alignment) throw new Error("Alignment returned null");
  const aligned = alignment.timings;
  const ctcOnly = forceAlignVerses({
    emissions: {
      ...emissions,
      transcription: { text: "", charTimes: [], wordStarts: [] },
    },
    surah,
    verseNumbers,
    audioDuration: duration,
    audioStart: speechSpan.start,
    silences,
  });

  const expectedOnsets = expectedStarts.map(
    (cut, index) => cut + findSpeechSpan(asAudioBuffer(parts[index])).start
  );
  const cutErrors = aligned.map((timing, index) => Math.abs(timing.start - expectedStarts[index]));
  const onsetErrors = aligned.map((timing, index) => Math.abs(timing.start - expectedOnsets[index]));
  const ctcErrors = ctcOnly?.map(
    (timing, index) => Math.abs(timing.start - expectedStarts[index])
  ) ?? [];
  const transcript = decoded.text;
  const normalizedTranscript = normalizeArabic(transcript);
  const reference = normalizeArabic(
    getVersesText(surah, verseNumbers[0], verseNumbers[verseNumbers.length - 1]).text
  );
  const assessment = assessVerseMatch(transcript);
  const recovery = assessment.match
    ? recoverLeadingVerse(assessment.match, decoded.charTimes[0], speechSpan.start)
    : null;
  const detection = recovery?.match ?? null;
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
    mode: trimSilence ? "run-on (per-verse silence removed)" : "natural pauses",
    stress: {
      phoneCapture,
      musicSnrDb: musicSnrDb > 0 ? musicSnrDb : null,
      introSeconds,
      recognitionOffset,
    },
    croppedFirstAyahSeconds: cropFirstSeconds,
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
      detectionMargin: Number(assessment.margin.toFixed(3)),
      detectionConfidence: assessment.confidence,
      recoveredLeadingVerse: recovery?.recovered ?? false,
      leadingUnrecognizedSeconds: recovery
        ? Number(recovery.leadingUnrecognizedSeconds.toFixed(3))
        : 0,
      firstCharacterTime: decoded.charTimes[0] === undefined
        ? null
        : Number(decoded.charTimes[0].toFixed(3)),
    },
    alignment: {
      method: alignment.method,
      transcriptSimilarity: alignment.transcriptSimilarity === null
        ? null
        : Number(alignment.transcriptSimilarity.toFixed(3)),
      methodAgreementSeconds: alignment.methodAgreementSeconds === null
        ? null
        : Number(alignment.methodAgreementSeconds.toFixed(3)),
      reviewBoundaries: alignment.boundaryDiagnostics
        .slice(1)
        .filter((diagnostic) => diagnostic.confidence !== "high")
        .map((diagnostic) => ({
          verse: diagnostic.verseNumber,
          confidence: diagnostic.confidence,
          agreementSeconds: diagnostic.agreementSeconds === null
            ? null
            : Number(diagnostic.agreementSeconds.toFixed(3)),
        })),
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
    ctcOnly: ctcOnly ? {
      cutMeanAbsoluteErrorSeconds: Number(
        (ctcErrors.slice(1).reduce((sum, value) => sum + value, 0) /
          (ctcErrors.length - 1)).toFixed(3)
      ),
      cutMaxAbsoluteErrorSeconds: Number(Math.max(...ctcErrors.slice(1)).toFixed(3)),
    } : null,
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
