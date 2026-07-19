// Client-only Quran ASR (FastConformer Arabic CTC, ONNX, in-browser).
// Import this lazily (await import("@/lib/asr")) from a client event handler —
// it pulls onnxruntime-web + @huggingface/transformers and must never run in SSR.
// Adapted from yazinsai/offline-tarteel (web/frontend mel.ts / session.ts / model-cache.ts).

import * as ort from "onnxruntime-web/wasm";
import {
  mel_filter_bank,
  spectrogram,
  window_function,
} from "@huggingface/transformers";

const ORT_VERSION = "1.26.0";
// The ~131 MB model is served through the reviewed same-origin Route Handler,
// which owns upstream allow-listing, range requests, and cache headers. A
// self-hosted operator may override it with a reviewed CORS-enabled URL.
const MODEL_URL =
  process.env.NEXT_PUBLIC_ASR_MODEL_URL || "/api/asr-model";
const VOCAB_URL = "/asr-vocab.json";

// ---- mel feature params (must match the model's NeMo recipe exactly) ----
const SAMPLE_RATE = 16000;
const N_FFT = 512;
const HOP_LENGTH = 160;
const WIN_LENGTH = 400;
const N_MELS = 80;
const PREEMPH = 0.97;
const DITHER = 1e-5;
const LOG_GUARD = 1e-5;

function recognitionAbortError(): Error {
  const error = new Error("Recognition cancelled");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw recognitionAbortError();
}

async function yieldForCancellation(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  throwIfAborted(signal);
}

let _melFilters: number[][] | null = null;
let _window: Float64Array | null = null;

function getMelFilters(): number[][] {
  if (!_melFilters) {
    _melFilters = mel_filter_bank(
      N_FFT / 2 + 1,
      N_MELS,
      0,
      8000,
      SAMPLE_RATE,
      "slaney",
      "htk"
    );
  }
  return _melFilters;
}

function getWindow(): Float64Array {
  if (!_window) _window = window_function(WIN_LENGTH, "hann", { periodic: true });
  return _window;
}

async function computeMel(
  audio: Float32Array,
  signal?: AbortSignal,
): Promise<{ features: Float32Array; timeFrames: number }> {
  throwIfAborted(signal);
  const dithered = new Float32Array(audio.length);
  // NeMo's feature recipe expects a tiny dither, but Math.random() made the
  // exact same clip produce different transcripts and boundary positions on
  // repeated runs. A fixed LCG keeps the expected noise while making alignment
  // reproducible across preview, export, browsers, and regression tests.
  let ditherState = 0x6d2b79f5;
  for (let i = 0; i < audio.length; i++) {
    ditherState = (Math.imul(ditherState, 1664525) + 1013904223) >>> 0;
    const noise = (ditherState / 4294967296) * 2 - 1;
    dithered[i] = audio[i] + DITHER * noise;
    if (i > 0 && i % 1_048_576 === 0) await yieldForCancellation(signal);
  }

  throwIfAborted(signal);
  const spec = await spectrogram(dithered, getWindow(), WIN_LENGTH, HOP_LENGTH, {
    fft_length: N_FFT,
    power: 2.0,
    center: false,
    pad_mode: "reflect",
    onesided: true,
    preemphasis: PREEMPH,
    mel_filters: getMelFilters(),
    mel_floor: 1e-10,
    // log_mel omitted (undefined) → no built-in log; we apply ln(mel + guard) below.
    transpose: false,
  });
  throwIfAborted(signal);

  const data = spec.data as Float32Array;
  const timeFrames = spec.dims[1];
  const logged = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) logged[i] = Math.log(data[i] + LOG_GUARD);

  // per-mel-bin mean/std normalisation
  for (let m = 0; m < N_MELS; m++) {
    let sum = 0;
    for (let t = 0; t < timeFrames; t++) sum += logged[m * timeFrames + t];
    const mean = sum / timeFrames;
    let sumSq = 0;
    for (let t = 0; t < timeFrames; t++) {
      const d = logged[m * timeFrames + t] - mean;
      sumSq += d * d;
    }
    const std = Math.sqrt(sumSq / timeFrames) || 1e-10;
    for (let t = 0; t < timeFrames; t++) {
      logged[m * timeFrames + t] = (logged[m * timeFrames + t] - mean) / std;
    }
    if (m > 0 && m % 8 === 0) await yieldForCancellation(signal);
  }

  return { features: logged, timeFrames };
}

// ---- IndexedDB model cache ----
const DB_NAME = "ayahclip-asr";
const STORE = "models";
const MODEL_KEY = "fastconformer-ar-ctc-q8";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheGet(key: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function cacheSet(key: string, data: ArrayBuffer): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(data, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export type Progress = (loaded: number, total: number) => void;

async function loadModelBuffer(
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  throwIfAborted(signal);
  let cached: ArrayBuffer | null = null;
  try {
    cached = await cacheGet(MODEL_KEY);
  } catch (error) {
    console.warn("Recognition model cache unavailable; continuing without it.", error);
  }
  throwIfAborted(signal);
  if (cached) return cached;

  const res = await fetch(MODEL_URL, { signal });
  if (!res.ok) throw new Error(`Recognition model request failed (${res.status})`);
  const total = parseInt(res.headers.get("content-length") || "0");
  if (!res.body) throw new Error("Recognition model response had no body");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    throwIfAborted(signal);
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  try {
    await cacheSet(MODEL_KEY, buf.buffer);
  } catch (error) {
    console.warn("Recognition model could not be cached; this session can still continue.", error);
  }
  return buf.buffer;
}

// ---- session + vocab singletons ----
let session: ort.InferenceSession | null = null;
let vocab: Map<number, string> | null = null;
let vocabRecord: Record<string, string> | null = null;
let blankId = 1024;

/**
 * Fire-and-forget warm-up: fetch/cache the model and build the inference
 * session while something else (a server download, a decode) is running, so
 * the first recognition window doesn't pay the load on the critical path.
 * Safe to call repeatedly — the session and vocab singletons dedupe.
 */
export function prewarmRecognition(): void {
  void ensureReady().catch(() => {
    // A failed warm-up is invisible: the real recognition call retries the
    // same path and surfaces its own error to the user.
  });
}

async function ensureReady(onProgress?: Progress, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (session && vocab) return;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

  const [modelBuf, vocabJson] = await Promise.all([
    loadModelBuffer(onProgress, signal),
    fetch(VOCAB_URL, { signal }).then((r) => {
      if (!r.ok) throw new Error(`Recognition vocabulary request failed (${r.status})`);
      return r.json() as Promise<Record<string, string>>;
    }),
  ]);
  throwIfAborted(signal);

  vocab = new Map();
  vocabRecord = vocabJson;
  for (const [id, tok] of Object.entries(vocabJson)) {
    const n = parseInt(id);
    vocab.set(n, tok);
    if (tok === "<blank>") blankId = n;
  }

  session = await ort.InferenceSession.create(modelBuf, {
    executionProviders: ["wasm"],
  });
  throwIfAborted(signal);
}

export interface Transcription {
  text: string;
  /** Word onset times in seconds (from CTC frame indices), one per recognised word. */
  wordStarts: number[];
  /** Frame time (seconds) for each character of `text` — used for forced alignment. */
  charTimes: number[];
}

function decodeCTC(
  logprobs: Float32Array,
  timeSteps: number,
  vocabSize: number,
  frameDur: number
): Transcription {
  const v = vocab!;
  let prev = -1;
  let started = false;
  const wordStarts: number[] = [];
  // Per-character {char, frame-time}, with ▁ rendered as a space.
  const chars: { ch: string; t: number }[] = [];

  for (let t = 0; t < timeSteps; t++) {
    let maxIdx = 0;
    let maxVal = logprobs[t * vocabSize];
    for (let k = 1; k < vocabSize; k++) {
      const val = logprobs[t * vocabSize + k];
      if (val > maxVal) {
        maxVal = val;
        maxIdx = k;
      }
    }
    if (maxIdx !== prev && maxIdx !== blankId) {
      const tok = v.get(maxIdx) ?? "";
      const time = t * frameDur;
      if (tok.startsWith("▁") || !started) wordStarts.push(time);
      for (const c of tok) chars.push({ ch: c === "▁" ? " " : c, t: time });
      started = true;
    }
    prev = maxIdx;
  }

  // Collapse runs of spaces and trim, keeping char times aligned to the output.
  const cleaned: { ch: string; t: number }[] = [];
  for (const e of chars) {
    if (e.ch === " " && (cleaned.length === 0 || cleaned[cleaned.length - 1].ch === " ")) continue;
    cleaned.push(e);
  }
  while (cleaned.length && cleaned[cleaned.length - 1].ch === " ") cleaned.pop();

  return {
    text: cleaned.map((e) => e.ch).join(""),
    wordStarts,
    charTimes: cleaned.map((e) => e.t),
  };
}

// Run the model once → raw per-frame outputs + dims. Shared by transcribe()
// (greedy decode) and computeEmissions() (forced alignment).
async function runModel(
  audio16k: Float32Array,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<{ data: Float32Array; T: number; V: number; frameDur: number }> {
  await ensureReady(onProgress, signal);
  throwIfAborted(signal);
  onProgress?.(0, 0);
  const { features, timeFrames } = await computeMel(audio16k, signal);

  const input = new ort.Tensor("float32", features, [1, N_MELS, timeFrames]);
  const length = new ort.Tensor("int64", BigInt64Array.from([BigInt(timeFrames)]), [1]);
  const names = session!.inputNames;
  const runOptions: ort.InferenceSession.RunOptions = {
    tag: "ayahclip-recognition",
    terminate: false,
  };
  const terminateRun = () => { runOptions.terminate = true; };
  signal?.addEventListener("abort", terminateRun, { once: true });
  let results: ort.InferenceSession.ReturnType;
  try {
    results = await session!.run({ [names[0]]: input, [names[1]]: length }, runOptions);
  } finally {
    signal?.removeEventListener("abort", terminateRun);
  }
  throwIfAborted(signal);
  const out = results[session!.outputNames[0]];
  const [, T, V] = out.dims as number[];
  const durationSec = audio16k.length / SAMPLE_RATE;
  const frameDur = T > 0 ? durationSec / T : 0;
  return { data: out.data as Float32Array, T, V, frameDur };
}

// Per-frame log-softmax. Idempotent if the model already outputs log-probs
// (then logsumexp over a normalized row is 0, so this is a no-op); corrective if
// it outputs raw logits. Forced alignment needs true per-frame log-probs so that
// "emit token" vs "emit blank" is compared on the same normalized scale.
async function logSoftmaxPerFrame(
  data: Float32Array,
  T: number,
  V: number,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const out = new Float32Array(T * V);
  for (let t = 0; t < T; t++) {
    const base = t * V;
    let max = -Infinity;
    for (let v = 0; v < V; v++) if (data[base + v] > max) max = data[base + v];
    let sum = 0;
    for (let v = 0; v < V; v++) sum += Math.exp(data[base + v] - max);
    const lse = max + Math.log(sum);
    for (let v = 0; v < V; v++) out[base + v] = data[base + v] - lse;
    if (t > 0 && t % 256 === 0) await yieldForCancellation(signal);
  }
  return out;
}

/** Transcribe 16 kHz mono Float32 audio to Arabic text + word onsets. Loads/caches the model on first use. */
export async function transcribe(
  audio16k: Float32Array,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<Transcription> {
  const { data, T, V, frameDur } = await runModel(audio16k, onProgress, signal);
  throwIfAborted(signal);
  return decodeCTC(data, T, V, frameDur);
}

export interface Emissions {
  /** Per-frame log-probabilities, flat [T, V] row-major. */
  logProbs: Float32Array;
  T: number;
  V: number;
  /** Seconds per frame (audioDuration / T). */
  frameDur: number;
  /** Original-file offset when this pass was run on a cropped retry window. */
  timeOffset?: number;
  blankId: number;
  /** The raw model vocab (id → token), for skeleton reduction. */
  vocab: Record<string, string>;
  /** Greedy decode from the same model pass, used as an independent aligner. */
  transcription: Transcription;
}

/**
 * Run the model and return normalized per-frame emissions for forced alignment.
 * Unlike transcribe(), this keeps the full [T, V] matrix (no greedy collapse).
 */
export async function computeEmissions(
  audio16k: Float32Array,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<Emissions> {
  const { data, T, V, frameDur } = await runModel(audio16k, onProgress, signal);
  const logProbs = await logSoftmaxPerFrame(data, T, V, signal);
  throwIfAborted(signal);
  return {
    logProbs,
    T,
    V,
    frameDur,
    blankId,
    vocab: vocabRecord!,
    transcription: decodeCTC(data, T, V, frameDur),
  };
}
