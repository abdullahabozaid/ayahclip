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

See [`.env.example`](.env.example). All are optional for basic use:

| Variable | Purpose |
|---|---|
| `PEXELS_API_KEY` | Enables the stock photo/video background library. Free key at <https://www.pexels.com/api/>. Server-side only — never exposed to the client. |
| `OPENAI_API_KEY` | Optionally enables AI-shaped framing for social captions. The exact Quran excerpt and reference are assembled by AyahClip; media never leaves the browser. Without a key, reviewed editorial options remain available. |
| `OPENAI_CAPTION_MODEL` | Optional Responses API model override. Defaults to the cost-sensitive `gpt-5.6-luna`. |
| `NEXT_PUBLIC_ASR_MODEL_URL` | Optional absolute URL to the ASR model (see below). Leave blank to serve it same-origin from `public/asr/`. |
| `NEXT_PUBLIC_SITE_URL` | Canonical production origin for Open Graph, Twitter, and canonical metadata. Defaults to `https://ayahclip.com`. |

The app runs without these keys: backgrounds fall back to curated presets,
social captions use reviewed editorial patterns, and local verse recognition
is only needed for imported audio.

## The Arabic ASR model (~131 MB)

Imported-audio **Recognise verses** and **Align by recitation** use a FastConformer Arabic CTC
model (ONNX, adapted from [yazinsai/offline-tarteel](https://github.com/yazinsai/offline-tarteel),
licensed CC-BY-4.0). The `.onnx` file is **gitignored** — it is not in the repo.
The rest of the app works without it; pause-based editable cuts remain available.

**Quickest way to get it (this repo's GitHub Release):**

```bash
mkdir -p public/asr
gh release download asr-model-v1 \
  --repo abdullahabozaid/ayahclip \
  --pattern 'fastconformer_ar_ctc_q8.onnx' \
  --dir public/asr
```

(Uses the GitHub CLI, which you're already signed into. The repo is private, so a
plain `curl` won't work — `gh` carries your auth.)

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
- Set `OPENAI_API_KEY` only if AI-shaped social caption framing is wanted. The
  endpoint is same-origin, payload-limited, rate-limited, no-store, and falls
  back to reviewed local copy when the provider is unavailable.
- Export uses WebCodecs (faster-than-real-time H.264/AAC) where supported, with
  a `MediaRecorder` fallback — no server-side rendering or transcoding.
- On public deployments, saved projects and exported-library videos stay private
  in that visitor's browser (IndexedDB). Localhost/LAN development keeps the
  existing shared disk library for multi-browser editing on one machine.
- B-roll sequences, per-scene crop/zoom, crossfades, and the left-fade reciter
  composition all render through the same canvas path used by final MP4 export.

### AyahClip VPS deployment

The production image uses Next.js standalone output and runs as an unprivileged
user. Keep a TLS reverse proxy such as Caddy in front of the container; do not
publish port 3000 directly to the internet.

```bash
cp .env.example .env
# Fill in server-only keys. Set CADDY_NETWORK to the existing Docker network
# shared with your Caddy container, then deploy an immutable git revision.
export DEPLOYMENT_VERSION="$(git rev-parse HEAD)"
export CADDY_NETWORK=caddy
docker compose -f docker-compose.production.yml up -d --build
```

Add this route to the VPS Caddy configuration after the container health check
passes:

```caddy
ayahclip.com, www.ayahclip.com {
  encode zstd gzip
  reverse_proxy ayahclip-frontend:3000
}
```

Only then change GoDaddy DNS to the VPS IPv4 address. Keep the current Vercel
deployment online until `https://ayahclip.com`, `/robots.txt`, `/sitemap.xml`,
and the production Google/readiness suites all pass through the new proxy.

## Attributions

Quran text & translations: [Quran.com](https://quran.com) · Verse audio:
[EveryAyah](https://everyayah.com) · Timed chapter audio:
[MP3Quran](https://mp3quran.net) · Stock media: [Pexels](https://www.pexels.com) ·
ASR model: FastConformer (CC-BY-4.0).

Public TikTok and Instagram post links are resolved on the self-hosted VPS with
[yt-dlp](https://github.com/yt-dlp/yt-dlp). The resolver accepts only exact
platform hosts, never playlists, caps source size and runtime, and prefers the
platform's clean H.264 playback source. Creators remain responsible for using
media they own or have permission to edit.
