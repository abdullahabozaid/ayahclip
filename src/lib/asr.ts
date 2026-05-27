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
// The ~131 MB model. By default it's served same-origin from public/asr/, but
// that file is gitignored and too large for some static hosts (e.g. Vercel's
// per-file limit), so production can point at CORS-enabled external storage
// (S3/R2/CDN) via NEXT_PUBLIC_ASR_MODEL_URL. Either way it's cached in IndexedDB
// after first load, so it's fetched once per browser.
const MODEL_URL =
  process.env.NEXT_PUBLIC_ASR_MODEL_URL || "/asr/fastconformer_ar_ctc_q8.onnx";
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
  audio: Float32Array
): Promise<{ features: Float32Array; timeFrames: number }> {
  const dithered = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    dithered[i] = audio[i] + DITHER * (Math.random() * 2 - 1);
  }

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

async function loadModelBuffer(onProgress?: Progress): Promise<ArrayBuffer> {
  const cached = await cacheGet(MODEL_KEY);
  if (cached) return cached;

  const res = await fetch(MODEL_URL);
  const total = parseInt(res.headers.get("content-length") || "0");
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
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
  await cacheSet(MODEL_KEY, buf.buffer);
  return buf.buffer;
}

// ---- session + vocab singletons ----
let session: ort.InferenceSession | null = null;
let vocab: Map<number, string> | null = null;
let blankId = 1024;

async function ensureReady(onProgress?: Progress): Promise<void> {
  if (session && vocab) return;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

  const [modelBuf, vocabJson] = await Promise.all([
    loadModelBuffer(onProgress),
    fetch(VOCAB_URL).then((r) => r.json() as Promise<Record<string, string>>),
  ]);

  vocab = new Map();
  for (const [id, tok] of Object.entries(vocabJson)) {
    const n = parseInt(id);
    vocab.set(n, tok);
    if (tok === "<blank>") blankId = n;
  }

  session = await ort.InferenceSession.create(modelBuf, {
    executionProviders: ["wasm"],
  });
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

/** Transcribe 16 kHz mono Float32 audio to Arabic text + word onsets. Loads/caches the model on first use. */
export async function transcribe(
  audio16k: Float32Array,
  onProgress?: Progress
): Promise<Transcription> {
  await ensureReady(onProgress);
  const { features, timeFrames } = await computeMel(audio16k);

  const input = new ort.Tensor("float32", features, [1, N_MELS, timeFrames]);
  const length = new ort.Tensor("int64", BigInt64Array.from([BigInt(timeFrames)]), [1]);
  const names = session!.inputNames;
  const results = await session!.run({ [names[0]]: input, [names[1]]: length });
  const out = results[session!.outputNames[0]];
  const [, timeSteps, vocabSize] = out.dims as number[];
  const durationSec = audio16k.length / SAMPLE_RATE;
  const frameDur = timeSteps > 0 ? durationSec / timeSteps : 0;
  return decodeCTC(out.data as Float32Array, timeSteps, vocabSize, frameDur);
}
