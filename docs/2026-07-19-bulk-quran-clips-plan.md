# Bulk Quran Clips: product and delivery plan

Date: 2026-07-19

## Outcome

Turn one owned or permitted 20–30 minute recitation video into 15, 20, 30, or 40 reviewable, verse-complete vertical clip drafts without forcing the creator to scrub the entire recording or render every suggestion blindly.

The feature is successful when a creator can:

1. paste a permitted YouTube link or upload a file;
2. leave the analysis running safely in the background;
3. review Quran-aware candidate clips in source order;
4. correct range, boundaries, framing, and template without opening the full editor for every clip;
5. render only approved clips and recover individual failures;
6. download clips individually or as a completed batch.

This is not an automatic publishing feature. Recognition proposes references and boundaries; the creator confirms Quran text, audio alignment, translation, and final video before export.

## Product principles

- **Verse integrity before volume.** Never cut into or out of the middle of an ayah merely to hit a duration target.
- **Canonical text, assisted recognition.** Recognition identifies a passage; Arabic and translations come from the canonical Quran data already used by AyahClip.
- **Candidates are drafts.** Do not present a speculative “viral score” as truth. Show passage, duration, source position, recognition confidence, and review warnings.
- **Review before render.** Generating 30 clips that require 30 editor visits is not useful. Batch review must eliminate, correct, and style candidates before expensive rendering.
- **One source, one durable job.** Analysis and rendering survive refreshes, intermittent connections, and individual task failures.
- **Global defaults, local exceptions.** Apply one template, caption treatment, format, and media policy to the batch, then allow per-clip overrides.
- **Private by default.** Source media and rendered clips need explicit retention periods and must never become publicly enumerable.

## User flow

### 1. Source

The creator chooses **Bulk create**, then provides:

- a local audio/video file or an owned/permitted YouTube link;
- one rights confirmation for the source;
- desired number of clips: 15, 20, 30, or 40, default 20;
- output format, default 9:16.

Clip count is the creator-facing control. Duration is an internal balancing signal only. If the soft target lands at 1:00 but the current ayah ends at 1:16, the candidate ends at 1:16. A requested count is treated as an upper target when the source does not contain enough trustworthy, complete Quran passages.

The screen states the source duration, expected processing time, retention policy, and the fact that nothing will publish automatically.

### 2. Detect

Use a named, honest progress model:

1. **Prepare source** – resolve metadata and acquire a compact audio analysis copy;
2. **Listen** – run Quran recognition in overlapping chunks;
3. **Match** – merge a continuous surah/ayah sequence and retrieve canonical text;
4. **Place cuts** – align ayah transitions and form complete candidate passages;
5. **Build previews** – fetch only the source video ranges needed for review.

The job can be closed and revisited. Show completed units, not an indeterminate “AI magic” spinner.

During analysis, rotate a restrained set of encouraging Quran ayahs and hadiths. Quran text and translation must come through the canonical Quran data path. Hadiths must be individually sourced to Sahih al-Bukhari or Sahih Muslim, show the exact collection reference, and link to the verified source. Motion communicates active window progress and respects reduced-motion preferences.

### 3. Review candidates

Use a calm two-pane results workspace on desktop and a single-column review queue on mobile.

The candidate list shows 15–25 rows in chronological order. Each row contains:

- approve checkbox;
- source thumbnail and position;
- surah and ayah range;
- Arabic first line and compact translation excerpt;
- duration;
- range confidence and boundary-review flags;
- template thumbnail;
- preview, adjust, duplicate, and remove actions.

The preview pane shows the real 9:16 renderer. Selecting a row updates it without navigating away. The primary batch action reads **Render 17 approved clips**, not “Continue”.

Batch controls:

- Approve all confident;
- deselect all flagged;
- sort by source order, duration, or review needed;
- set one template/media policy for selected rows;
- set one translation/font treatment for selected rows;
- adjust target count and regenerate candidates without re-running recognition;
- search or jump by surah/ayah.

Quick correction opens an inline boundary editor with source waveform, ayah markers, start/end handles, and a canonical range picker. The full Studio remains available for exceptional edits.

### 4. Style the batch

Reuse the approved template system rather than introducing a second style editor.

Batch media policies:

- keep source video;
- Reciter Split Fade;
- one background across all clips;
- rotate selected B-roll between clips;
- use each template’s scene sequence.

Text controls expose named presets rather than dozens of open settings: Soft glow, Crisp outline, Gold line, and Clean. Quran Arabic fonts keep only their real supported weights; synthetic bold remains prohibited.

### 5. Render and deliver

Render approved clips through a persistent queue with limited concurrency. The queue shows waiting, rendering, ready, failed, and cancelled states per clip.

The user can:

- preview and download a ready clip immediately while the rest continue;
- retry one failed clip without restarting the batch;
- cancel pending clips without deleting completed work;
- download selected clips;
- download all completed clips after the batch finishes;
- save the batch as a Library collection.

Do not build a large ZIP in memory. Stream an archive on demand or offer one-by-one downloads; large ZIP generation is a documented timeout risk in competing workflows.

## Candidate-generation rules

1. Run recognition across 3–5 minute audio windows with 20–30 seconds of overlap.
2. Merge overlapping recognition results by Quran sequence, time overlap, and confidence.
3. Keep recognition confidence separate from timing confidence.
4. Align ayah boundaries transactionally; never replace known-good timing with an incomplete pass.
5. Build candidate passages only from complete ayahs.
6. Prefer natural pauses, complete thematic spans, and target-duration fit.
7. Penalize repeated phrases, low-confidence ranges, clipped audio, surah changes, and contaminated speech.
8. Preserve distinct low-confidence alternatives for creator review instead of silently choosing one.
9. Generate no more than the chosen 15/20/30/40 draft target. Show an honest lower result when the source does not contain enough confident, complete passages.
10. Never silently omit a long section: show coverage on a source timeline and label unrecognized gaps.

Recommended candidate score components:

- passage-range confidence: 30%;
- boundary confidence and pause quality: 25%;
- complete-passage quality: 20%;
- target-duration fit: 15%;
- usable visual continuity: 10%.

The score is an internal ranking aid. The UI should expose its factual components, not claim a predicted virality percentage.

## Technical architecture

The current beta runs recognition in sequential overlapping browser windows so one long source never enters the single-pass model. It keeps the existing local recognition privacy model and is suitable for desktop validation. Durable background jobs and server rendering remain necessary before unattended phone processing and multi-clip rendering can be called production-ready.

### Services

- **Job API:** creates a signed, non-enumerable bulk job and returns a job capability token.
- **Source worker:** resolves metadata, downloads a compact audio analysis asset, and fetches bounded video ranges only when needed.
- **Recognition worker:** runs ONNX inference server-side in overlapping chunks and persists raw emissions plus merged candidates.
- **Candidate worker:** retrieves canonical Quran text, aligns boundaries, scores complete passages, and creates preview manifests.
- **Render worker:** renders approved snapshots with concurrency 1–2 per VPS until resource measurements justify more.
- **Object storage:** stores source proxies, candidate previews, and outputs with short-lived signed URLs and lifecycle deletion.
- **Job store:** persists state transitions, progress, retries, clip snapshots, errors, and idempotency keys.

### Suggested durable data model

- `bulk_jobs`: source reference, status, target count/duration, rights attestation, progress, retention deadline, owner capability hash;
- `source_assets`: audio proxy, optional source video, metadata, byte size, duration, checksum;
- `recognition_windows`: time range, transcript/emissions reference, passage candidates, confidence, worker version;
- `bulk_candidates`: source range, surah/ayah range, boundary diagnostics, approval state, template snapshot, override snapshot;
- `render_tasks`: candidate id, immutable render snapshot, status, attempts, output reference, fixed error code;
- `bulk_events`: privacy-safe operational events for diagnosis and queue timing.

Every state-changing request carries an idempotency key. Retrying analysis or rendering must not create duplicate jobs or outputs.

### Storage and privacy

- Start with S3-compatible object storage such as Cloudflare R2 or a private S3 bucket; do not place bulk media in the public Next.js filesystem.
- Encrypt transport, use private buckets, and expose only expiring signed URLs.
- Default source/proxy retention: 24 hours after job completion.
- Default rendered-output retention: 7 days during beta, clearly disclosed.
- Let the creator delete the job and all associated media immediately.
- Do not log source URLs, Quran transcripts, filenames, or signed asset URLs in product telemetry.

### Queue choice

For the first beta, use Postgres-backed jobs claimed with `FOR UPDATE SKIP LOCKED` and a dedicated worker process. This avoids adding Redis before throughput requires it while still providing durability and concurrency control. Move to BullMQ/Redis only when measured queue volume or priority scheduling justifies the extra service.

## API outline

- `POST /api/bulk/jobs` – validate source, rights, limits, and create job;
- `GET /api/bulk/jobs/:id` – job, progress, candidates, and task summary;
- `POST /api/bulk/jobs/:id/cancel` – cancel pending work;
- `PATCH /api/bulk/jobs/:id/settings` – update target count/duration before candidate lock;
- `PATCH /api/bulk/jobs/:id/candidates/:candidateId` – approve, adjust passage/times, or apply overrides;
- `POST /api/bulk/jobs/:id/apply-template` – apply a versioned template snapshot to selected candidates;
- `POST /api/bulk/jobs/:id/render` – enqueue immutable snapshots for approved candidates;
- `POST /api/bulk/jobs/:id/render/:taskId/retry` – retry one failed task;
- `GET /api/bulk/jobs/:id/download` – stream selected completed outputs or return signed individual URLs;
- `DELETE /api/bulk/jobs/:id` – revoke access and delete retained assets.

## Rollout

### Phase 0 – import speed and measurement

- guarded fast source acquisition for short/medium YouTube sources;
- retain bounded streaming fallback for long/large sources;
- record privacy-safe probe, source-download, trim, and response timings;
- measure on the current VPS before expanding limits.

### Phase 1 – analysis-only prototype

- local file and permitted YouTube input up to 30 minutes;
- server audio proxy and chunked recognition;
- 15–20 Quran-aware candidates;
- persistent job progress and review-only results;
- no bulk rendering yet.

Exit gate: a maintained real-recitation corpus has zero false automatic Quran ranges, at least 97% expected-range recall, correct chronological merging, and no mid-ayah candidate boundaries.

### Phase 2 – review and batch styling

- candidate list/preview workspace;
- range and timing correction;
- selection, confidence filters, source coverage timeline;
- global template plus per-clip overrides;
- mobile review flow tested on physical iPhone and Android hardware.

Exit gate: a creator can reduce 20–25 suggestions to 15 approved clips without opening full Studio more than twice in the median test journey.

### Phase 3 – durable rendering

- persistent render queue;
- individual retry/cancel;
- streamed delivery and Library collections;
- lifecycle deletion, quotas, observability, and abuse controls.

Exit gate: a 20-clip batch survives refresh, one intentionally failed task, and worker restart without losing completed outputs or creating duplicates.

### Phase 4 – beta economics and polish

- source-minute and render-minute quotas;
- processing-time estimates based on real queue history;
- email/push completion notification only with explicit consent;
- retention controls and account-backed cross-device jobs;
- pricing based on measured compute/storage rather than arbitrary clip counts.

## Beta limits

- source duration: 30 minutes;
- requested clips: 15, 20, 30, or 40;
- candidates: up to the requested count, limited by trustworthy complete passages;
- clip duration: no hard creator-facing bucket; complete ayahs override the soft balancing target;
- output: 9:16, 1080×1920 where the selected source supports it;
- one active analysis job per anonymous session;
- one active render batch per session;
- no automatic social publishing.

## Failure states that must be designed

- unsupported/private/restricted source;
- source changes or disappears after metadata probe;
- recognition model unavailable;
- partial Quran match or competing passage matches;
- speech/noise outside recitation;
- recognized gap in the source timeline;
- Arabic font unavailable at render time;
- source proxy expired before approval;
- browser closes during analysis or rendering;
- worker restart;
- one render fails while other clips complete;
- insufficient storage or quota;
- creator deletes a job during processing.

Each failure preserves confirmed work and offers the narrowest recovery action. No generic “Something went wrong” state is acceptable.

## Research signals behind the plan

Recent creator discussions repeatedly report that generic tools produce many candidates but only a handful are usable, that clip selections can feel random, and that final caption, boundary, and framing control matters more than an opaque score. Creators commonly describe automatic clipping as a useful first draft rather than a publish-ready result.

Competitor documentation confirms the value of a separate results/review surface, selection mode, chronological sorting, per-clip editing, and bulk delivery. It also exposes an operational warning relevant to AyahClip: large archive exports can time out, so completed clips should remain independently downloadable even when a batch download is offered.

Relevant current sources:

- https://www.reddit.com/r/opusclip/comments/1uavudm/tired_of_getting_30_clips_from_opus_clip_and_only/
- https://www.reddit.com/r/ContentCreators/comments/1sugj9g/which_auto_clip_maker_ai_gives_you_the_most/
- https://www.reddit.com/r/ContentCreators/comments/1s0qqfv/whats_the_best_tool_to_automatically_create_short/
- https://www.reddit.com/r/contentcreation/comments/1tvqx0x/has_anyone_tried_both_vizard_and_znippet_for/
- https://help.opus.pro/docs/article/get-clips-faq-1
- https://help.opus.pro/docs/article/bulk-download
- https://help.opus.pro/docs/article/create-zaps-google-drive
- https://help.opus.pro/docs/article/opussearch

## Design brief for confirmation

- **Feature:** a five-stage Bulk Create flow—Source, Detect, Review, Style, Render—for volume Quran creators working mainly on phones and occasionally on desktop.
- **Primary action:** turn a long source into a trustworthy set of approved, verse-complete clip drafts, then render only those drafts.
- **Visual lane:** restrained Midnight Mihrab product UI, used late at night in focused editing sessions; CapCut supplies familiar timeline and batch-selection conventions, Linear supplies state clarity, and OpusClip supplies the results-page category pattern. AyahClip remains quieter, more Quran-specific, and less score-driven.
- **Scope:** a production-ready responsive flow, not a single screen. Phase 1 should ship durable analysis and review before bulk rendering.
- **Layout:** source setup is a compact form; detection is a resumable job view; review is list-plus-real-preview; styling uses global defaults with selected-row overrides; rendering is a recoverable queue.
- **Required states:** first use, active analysis, background/revisit, partial match, ambiguous match, ready to review, empty candidate result, approved set, rendering, partial success, individual failure, cancelled, expired, deleted.
- **Interaction model:** familiar checkboxes, filters, source-order sorting, inline range correction, sticky batch action, and one clear path into full Studio for exceptions.

Implementation of the new UI should begin only after this brief and its phase order are confirmed.
