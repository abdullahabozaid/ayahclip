# AyahClip

A fully browser-based tool that turns Quran recitation into vertical
social-media video clips. Pick verses and a reciter (or import your own
audio/video), style the composition, and export an MP4 — detection, editing,
rendering, and export all run client-side.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

## Environment variables

See [`.env.example`](.env.example). Both are optional for basic use:

| Variable | Purpose |
|---|---|
| `PEXELS_API_KEY` | Enables the stock photo/video background library. Free key at <https://www.pexels.com/api/>. Server-side only — never exposed to the client. |
| `NEXT_PUBLIC_ASR_MODEL_URL` | Optional absolute URL to the ASR model (see below). Leave blank to serve it same-origin from `public/asr/`. |

The app runs without either: backgrounds fall back to presets/gradients, and
the verse auto-detection ("Deep align") is only needed for imported audio.

## The Arabic ASR model (~131 MB)

Imported-audio verse detection ("Deep align") uses a FastConformer Arabic CTC
model (ONNX, adapted from [yazinsai/offline-tarteel](https://github.com/yazinsai/offline-tarteel),
licensed CC-BY-4.0). The `.onnx` file is **gitignored** — it is not in the repo.

- **Local / same-origin (default):** place the file at
  `public/asr/fastconformer_ar_ctc_q8.onnx`. It's served from your own origin
  and cached in IndexedDB after the first load.
- **External hosting:** for hosts with a per-file static limit (e.g. Vercel),
  upload the model to CORS-enabled storage (S3, Cloudflare R2, a CDN) and set
  `NEXT_PUBLIC_ASR_MODEL_URL` to its absolute URL. The bucket **must** send an
  `Access-Control-Allow-Origin` header that allows your site's origin.

The vocab (`public/asr-vocab.json`) and the onnxruntime-web WASM (loaded from
the jsDelivr CDN) need no extra setup. Inference is single-threaded, so no
`COOP`/`COEP` headers (SharedArrayBuffer) are required.

## Building & deploying

```bash
npm run build   # production build (also type-checks)
npm run start   # serve the production build
npm test        # synthetic verse-detection + forced-alignment checks
```

Deploy notes:

- Any Next.js host works. If you bundle the model in `public/asr/`, confirm the
  host allows a ~131 MB static file; otherwise use `NEXT_PUBLIC_ASR_MODEL_URL`.
- Set `PEXELS_API_KEY` in the host's environment for the stock library.
- Export uses WebCodecs (faster-than-real-time H.264/AAC) where supported, with
  a `MediaRecorder` fallback — no server-side rendering or transcoding.

## Attributions

Quran text & translations: [Quran.com](https://quran.com) · Reciter audio:
[EveryAyah](https://everyayah.com) · Stock media: [Pexels](https://www.pexels.com) ·
ASR model: FastConformer (CC-BY-4.0).
