# Plan 007: Let Bulk Create survive leaving the page

> **Executor instructions**: This plan documents a root-caused architectural
> constraint and the options to address it. The cheap wins (Phase 1) are safe to
> implement and verify. The server-side worker (Phase 2) is a product decision
> with real cost/privacy trade-offs — do NOT build it without owner sign-off.

## Status

- **Priority**: P2 (real user complaint; partial wins are cheap, full fix is large)
- **Effort**: Phase 1 = M, Phase 2 = XL
- **Risk**: Phase 1 = MED (touches the large BulkCreateWorkspace), Phase 2 = HIGH
- **Depends on**: none
- **Category**: architecture / direction
- **Planned at**: commit (post-720p-fix), 2026-07-20

## Why this matters

Users report Bulk Create "does not work in the background — you have to be
physically on the page." That is accurate and inherent to the current design:
two of the three heavy stages run entirely in the browser on the page's main
thread, so navigating away or closing the tab stops them.

## Root cause (investigated, with evidence)

Stage-by-stage, where each runs:

| Stage | Runs | Evidence |
|---|---|---|
| 1. Download (yt-dlp) | **SERVER** (survives) | `social-download-jobs.ts:552` fire-and-forget `orchestrateJob`; jobs held in-process, file kept `READY_TTL_MS=15min` |
| 1b. Download progress poll | CLIENT | `social-import.ts:92-112` 1s poll loop |
| 2. ASR recognition + alignment | **CLIENT, main thread** | `asr.ts` runs FastConformer ONNX via `onnxruntime-web/wasm` + `@huggingface/transformers`; loop in `bulk-recognition.ts:75-108`, driven by `BulkCreateWorkspace.tsx:454`. No `new Worker` anywhere in `src/`. |
| 3. Checkpoint / resume | CLIENT (IndexedDB) | `bulk-jobs.ts` idb-keyval; per-window checkpoint `BulkCreateWorkspace.tsx:462-469` persists `detectedAyahs`/`nextWindowIndex` |
| 4. MP4 render | **CLIENT, main thread** | `export.ts` canvas + `VideoEncoder`/`mp4-muxer`; loop `BulkCreateWorkspace.tsx:685-755` |
| Server ASR/render worker | **DOES NOT EXIST** | only api routes are download, asr-model (streams the model to the browser), library, pexels, social-caption, save-export, telemetry, support, qcf-font |

**The reason bulk needs the page open:** recognition (stage 2) and rendering
(stage 4) are 100% client-side JS. Closing the tab destroys the JS context and
they stop. Only the yt-dlp download is server-side.

What is lost when you leave, by stage:
- **Download running:** server job keeps going and holds the file 15 min, BUT the
  client stops polling, so on return it never picks the file up and the file is
  swept. (A raw tab-close does not fire the cancel DELETE — that only fires on an
  explicit Cancel click, `social-import.ts:141-143`.)
- **Analysis running:** the in-flight 4-min window is lost; every completed
  window is checkpointed to IndexedDB, so at most ~4 min of work is lost. Resume
  is supported by the data model (`analyse()` reads `nextWindowIndex`) but is
  **manual** — the user must reopen the batch and re-trigger; the mount effect
  does not auto-continue (`BulkCreateWorkspace.tsx:209-231, 277-303`).
- **Results ready:** fully persisted; survives reload.
- **Rendering:** finished clips are saved to IndexedDB as they complete; the
  in-progress clip and all queued clips are lost and re-run on return.

## Phase 1 — cheap wins (safe, no server compute)

Each is independently shippable. Verify by driving the bulk flow in a browser
(import a short YouTube section, start analysis, navigate away, return).

1. **Auto-resume analysis on return.** The checkpoint already exists; wire the
   batch-open path so that opening a batch whose stage is `analysing` (or whose
   `nextWindowIndex < window count`) automatically continues from
   `nextWindowIndex` instead of requiring a manual re-trigger. In scope:
   `BulkCreateWorkspace.tsx` restore/open effect. STOP if the source audio blob
   is missing from IndexedDB (`openBatch` already errors there) — do not silently
   restart from zero.

2. **Re-attach to an in-flight download on return.** Persist the active
   `jobId` (it already lives in a survivable server job for 15 min) so that
   returning to the page re-polls the same job and consumes the finished file,
   instead of orphaning it. In scope: `social-import.ts` (accept an existing
   jobId), `BulkCreateWorkspace.tsx` importLink (persist jobId to the bulk job
   before awaiting).

3. **Warn before leaving mid-work.** A `beforeunload` guard while analysis or
   rendering is active, so an accidental navigation prompts instead of silently
   discarding progress. Small and safe; the only existing `beforeunload` is in
   TemplateStudio, follow that pattern.

4. **(Optional) Move the ASR loop into a Web Worker.** Survives background-tab
   main-thread throttling and keeps the UI responsive; does NOT survive full
   navigation. Larger change; only worth it if users keep the tab open but
   backgrounded.

## Phase 2 — true background (server-side worker) — OWNER DECISION REQUIRED

To let analysis and rendering continue with the tab closed, they must move to
the VPS:
- A **server recognition worker** running ONNX under Node (onnxruntime-node),
  fed by a persistent job queue mirroring the existing `social-download-jobs.ts`
  per-process pattern (but the current job Map is in-memory single-container —
  it would need real persistence).
- A **server render worker** (headless ffmpeg / server-side WebCodecs
  equivalent) producing the MP4s.
- The client would submit + poll, exactly like today's download flow.

Trade-offs the owner must weigh before this is built:
- **Cost:** server CPU/GPU for ASR + encoding, plus storage and bandwidth.
- **Privacy:** today recognition runs in-browser and user media "never leaves
  the device" (`quran-recognition.ts:92-95`); server ASR requires uploading the
  source audio, which changes that promise and the privacy copy.
- **Scope:** the entire recognition + export pipeline currently assumes a
  browser (`onnxruntime-web/wasm`, `mp4-muxer`, `canvas`, `MediaRecorder`).

Do not start Phase 2 without an explicit decision on cost + the privacy change.

## Done criteria (Phase 1 only)

- [ ] Returning to an interrupted batch auto-continues analysis from the last
      checkpoint (manual re-trigger no longer required)
- [ ] A download that finishes while the user is away is consumed on return, not
      orphaned
- [ ] Navigating away mid-analysis/render prompts a confirmation
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` green; `npm run test:ci:e2e` green
- [ ] `plans/README.md` status row updated

## Maintenance notes

- The download fix shipped 2026-07-20 (portrait-video resolution cap) is
  unrelated to this plan but lives in the same subsystem — see
  `social-download-jobs.ts` YOUTUBE_FORMAT_SORT.
- Reviewer should scrutinize Phase 1.1 for the "source audio missing" edge case
  and Phase 1.2 for not double-consuming a job that the client also still holds.
