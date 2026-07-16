import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  mel_filter_bank,
  spectrogram,
  window_function,
} from "@huggingface/transformers";
import * as ort from "onnxruntime-web/wasm";

export const NODE_ASR_SAMPLE_RATE = 16_000;
const N_FFT = 512;
const HOP_LENGTH = 160;
const WIN_LENGTH = 400;
const N_MELS = 80;
const PREEMPH = 0.97;
const DITHER = 1e-5;
const LOG_GUARD = 1e-5;

export interface NodeAsrEmissions {
  logProbs: Float32Array;
  T: number;
  V: number;
  frameDur: number;
  timeOffset?: number;
  blankId: number;
  vocab: Record<string, string>;
  transcription: {
    text: string;
    wordStarts: number[];
    charTimes: number[];
  };
}

export function decodeAudioFile(path: string): Float32Array {
  const raw = execFileSync("ffmpeg", [
    "-v", "error", "-i", path, "-f", "f32le", "-acodec", "pcm_f32le",
    "-ac", "1", "-ar", String(NODE_ASR_SAMPLE_RATE), "pipe:1",
  ], { maxBuffer: 256 * 1024 * 1024 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
}

async function computeMel(audio: Float32Array) {
  const filters = mel_filter_bank(
    N_FFT / 2 + 1,
    N_MELS,
    0,
    8000,
    NODE_ASR_SAMPLE_RATE,
    "slaney",
    "htk",
  );
  const window = window_function(WIN_LENGTH, "hann", { periodic: true });
  const dithered = new Float32Array(audio.length);
  let ditherState = 0x6d2b79f5;
  for (let index = 0; index < audio.length; index++) {
    ditherState = (Math.imul(ditherState, 1664525) + 1013904223) >>> 0;
    const noise = (ditherState / 4294967296) * 2 - 1;
    dithered[index] = audio[index] + DITHER * noise;
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
  for (let index = 0; index < data.length; index++) {
    features[index] = Math.log(data[index] + LOG_GUARD);
  }
  for (let mel = 0; mel < N_MELS; mel++) {
    let sum = 0;
    for (let time = 0; time < timeFrames; time++) sum += features[mel * timeFrames + time];
    const mean = sum / timeFrames;
    let sumSquares = 0;
    for (let time = 0; time < timeFrames; time++) {
      const delta = features[mel * timeFrames + time] - mean;
      sumSquares += delta * delta;
    }
    const standardDeviation = Math.sqrt(sumSquares / timeFrames) || 1e-10;
    for (let time = 0; time < timeFrames; time++) {
      features[mel * timeFrames + time] =
        (features[mel * timeFrames + time] - mean) / standardDeviation;
    }
  }
  return { features, timeFrames };
}

function logSoftmax(data: Float32Array, timeSteps: number, vocabSize: number): Float32Array {
  const output = new Float32Array(timeSteps * vocabSize);
  for (let time = 0; time < timeSteps; time++) {
    const base = time * vocabSize;
    let maximum = -Infinity;
    for (let token = 0; token < vocabSize; token++) {
      maximum = Math.max(maximum, data[base + token]);
    }
    let sum = 0;
    for (let token = 0; token < vocabSize; token++) {
      sum += Math.exp(data[base + token] - maximum);
    }
    const logSum = maximum + Math.log(sum);
    for (let token = 0; token < vocabSize; token++) {
      output[base + token] = data[base + token] - logSum;
    }
  }
  return output;
}

function greedyDecode(
  data: Float32Array,
  timeSteps: number,
  vocabSize: number,
  vocab: Record<string, string>,
  frameDuration: number,
  blankId: number,
) {
  const entries: { char: string; time: number }[] = [];
  let previous = -1;
  for (let time = 0; time < timeSteps; time++) {
    const base = time * vocabSize;
    let best = 0;
    for (let token = 1; token < vocabSize; token++) {
      if (data[base + token] > data[base + best]) best = token;
    }
    if (best !== previous && best !== blankId) {
      for (const char of vocab[String(best)] ?? "") {
        const rendered = char === "▁" ? " " : char;
        if (rendered === " " &&
          (entries.length === 0 || entries[entries.length - 1].char === " ")) continue;
        entries.push({ char: rendered, time: time * frameDuration });
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

export async function createNodeAsrRunner(projectRoot = resolve(".")) {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = pathToFileURL(
    join(projectRoot, "node_modules/onnxruntime-web/dist") + "/",
  ).href;
  const model = readFileSync(join(projectRoot, "public/asr/fastconformer_ar_ctc_q8.onnx"));
  const session = await ort.InferenceSession.create(
    model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength),
    { executionProviders: ["wasm"] },
  );
  const vocab = JSON.parse(
    readFileSync(join(projectRoot, "public/asr-vocab.json"), "utf8"),
  ) as Record<string, string>;
  const blankEntry = Object.entries(vocab).find(([, token]) => token === "<blank>");
  if (!blankEntry) throw new Error("ASR vocabulary has no <blank> token");
  const blankId = Number(blankEntry[0]);

  return {
    async recognize(audio: Float32Array, timeOffset = 0): Promise<NodeAsrEmissions> {
      if (audio.length < NODE_ASR_SAMPLE_RATE / 2) {
        throw new Error("Recognition audio must be at least 0.5 seconds");
      }
      const { features, timeFrames } = await computeMel(audio);
      const input = new ort.Tensor("float32", features, [1, N_MELS, timeFrames]);
      const length = new ort.Tensor(
        "int64",
        BigInt64Array.from([BigInt(timeFrames)]),
        [1],
      );
      const outputMap = await session.run({
        [session.inputNames[0]]: input,
        [session.inputNames[1]]: length,
      });
      const output = outputMap[session.outputNames[0]];
      const [, timeSteps, vocabSize] = output.dims as number[];
      const frameDuration = (audio.length / NODE_ASR_SAMPLE_RATE) / timeSteps;
      const decoded = greedyDecode(
        output.data as Float32Array,
        timeSteps,
        vocabSize,
        vocab,
        frameDuration,
        blankId,
      );
      return {
        logProbs: logSoftmax(output.data as Float32Array, timeSteps, vocabSize),
        T: timeSteps,
        V: vocabSize,
        frameDur: frameDuration,
        timeOffset,
        blankId,
        vocab,
        transcription: {
          text: decoded.text,
          wordStarts: [],
          charTimes: decoded.charTimes.map((time) => time + timeOffset),
        },
      };
    },
  };
}

export function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}
