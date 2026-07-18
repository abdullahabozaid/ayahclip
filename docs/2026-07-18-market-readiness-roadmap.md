# AyahClip market-readiness roadmap

Date: 2026-07-18

This is the working contract for the full product overhaul. “Implemented” means the code exists and has direct automated or visual evidence. It does not mean the entire product is ready for a public launch.

## Product principles

- Preserve Quranic accuracy above visual novelty.
- Keep the editor calm, legible, and task-focused: compact controls, a correctly sized preview, and progressive disclosure instead of a dense CapCut clone.
- Use the Midnight Mihrab design system in `DESIGN.md`; avoid oversized display copy inside working surfaces.
- Make capability differences explicit. Word-synchronised reciters and whole-verse reciters must never look equivalent when they are not.
- Curated stock media must be people-free. Arbitrary third-party search results are not safe enough to carry that promise.
- User uploads remain local unless the UI explicitly says they are being sent to a server.

## Current evidence

| Area | Status | Evidence |
| --- | --- | --- |
| Desktop editor shell | Implemented, continuing polish | Compact preview/inspector/timeline architecture and browser QA |
| Quran navigation | Implemented, polished | Long Surahs use passage-first selection; individual ayahs stay bounded; mobile preview precedes the grid |
| Reciter breadth | Implemented, search UX pending | 62 verified recordings: 46 EveryAyah verse files plus 16 complete MP3Quran timed reads; 248/248 source probes and exact-duration browser export matrix |
| Word-level timing | Implemented for supported subset | 12 Quran.com timing-capable recitations, labelled honestly |
| Whole-verse captions | Implemented | Unsupported word-timing voices no longer inherit another reciter's timings |
| Reusable personal B-roll | Implemented | Persistent IndexedDB image/video shelf with apply and inline deletion |
| Curated stock B-roll | Implemented, continuing curation | 20 Pexels photos and 16 Pexels videos; the motion set now covers water, waterfall, coast, clouds, mountains, trails, dark drives, night sky, architecture, forest and abstract footage. Every admitted video records its immutable Pexels source ID, direct source page, file size and semantic tags; sampled-frame review found no visible people. Two legacy 98–144 MB renditions were replaced with 720p variants, and a 147 MB trail candidate was rejected before admission. |
| Multi-clip B-roll timeline | Implemented | Audio-led sequence, split/reorder/trim workflow |
| Native iOS beta | Implemented, distribution signing pending | 33 unit and 8 UI tests pass, including maximum Dynamic Type, debounced draft autosave/background flush, bounded Undo/Redo, enforced import limits, ordered multi-movie Share Sheet delivery, direct and caption-wrapped TikTok/Instagram/YouTube post validation, and project-owned cancellable exports; arm64 Release archive contains the Share extension, privacy manifests, app icon, Quran font, and dSYMs |
| TestFlight distribution | Blocked by account configuration | The Mac has a valid Apple Distribution certificate but no AyahClip provisioning profiles or registered iPhone; a signed archive and App Store Connect record for `app.ayahclip.mobile` are still required |
| Public production readiness | Not complete | Remaining gates below |
| Security/backend baseline | Implemented, distributed WAF pending | Zero production dependency advisories; no tracked secrets; headers, local-filesystem isolation, request limits and API boundary tests documented in `docs/2026-07-18-security-backend-audit.md` |
| Operator analytics | Implemented for account-free beta | Authenticated local report aggregates production Runtime Logs into activation, successful exports, return-visit proxy, funnel, assistance, device/browser/source, and fixed failure metrics without publishing journey IDs or adding a public admin surface; true account retention remains intentionally unavailable without accounts |
| Account-free browser isolation | Implemented | Three simultaneous production browser contexts retain distinct personal B-roll shelves; the test explicitly does not claim future authenticated tenant isolation |
| Web performance and sustained export | Implemented, real-device gate pending | Three deployed Chrome journeys pass import, ingestion, Studio transition, playback, timeline-seek and exact-MP4 budgets; a 512 MB-heap Chrome fixture exports a verified 181-second MP4 |
| Offline local-media export | Implemented | After Studio is loaded, forced network loss does not prevent an imported local WAV from rendering to a verified MP4; network-backed sources remain explicitly out of scope |
| Damaged and unsupported import recovery | Implemented | The deployed Import screen rejects corrupt WAV and non-media input, keeps creation disabled, and accepts a valid replacement without requiring a reload |
| Text edge-case export | Implemented | Al-Baqarah 2:282 wraps into a valid 9:16 MP4, Urdu translation canvas calls remain RTL, and absent translation data exports Arabic without placeholder text |
| Typography and glow fidelity | Implemented | Five Arabic modes share one weight contract; fixed-weight Quran faces never synthesize bold; strict export verifies both Quran and selected self-hosted translation faces; Outfit is selectable in both editors; Lora plus white glow is proven in an exact MP4. See `docs/2026-07-18-typography-rendering-audit.md`. |
| Social format parity | Implemented | The live preview canvas and exact MP4 are verified at the same canonical dimensions for 9:16 (1080×1920), 16:9 (1920×1080), 1:1 (1080×1080), and 4:5 (1080×1350). |
| Timeline edit safety | Implemented for core desktop commands | Production Chrome proves keyboard play/pause, one-second seeking, caption splitting, undo, redo, selected-ayah deletion, restoration, and the invariant that the final ayah cannot be deleted. |
| Constrained-network first load | Implemented | At 150 ms latency and roughly 1.6 Mbps download, production exposes a usable Import workflow and populated 114-Surah selector in 3.23 seconds against a 12-second gate |

## Delivery sequence

### 1. Desktop content and creation breadth

- **Completed:** reciters use an explicit EveryAyah verse-file or MP3Quran chapter-cue source descriptor with shared, provenance-aware preview and export resolution.
- **Completed for the admitted catalog:** source records carry attribution/removal contacts, representative live probes verify audio and CORS, provider audits record coverage and rights evidence, and a weekly GitHub workflow retains machine-readable health reports. Keep the same admission gate for every new recording.
- Build searchable English/Arabic reciter selection with recent, favourite, place, style, and timing-capability organization after the resolver is proven.
- **Completed for the curated starter catalogue:** people-free motion coverage now includes water, waterfall, coast, mountains, trails, clouds, dark drives, architecture, night sky, forest and abstract footage. Keep future additions behind the same provenance, sampled-frame and browser-size gates.
- Add a reviewable ingestion pipeline before exposing dynamic stock search.
- Add saved style presets for split composition, reciter portrait, rotating B-roll, image sequences, and restrained glow typography.
- **Completed for the shipped font and glow system:** shared Arabic/translation options, genuine Arabic weights, strict font readiness, long-text wrapping, RTL translation, missing-translation fallback and Lora plus white-glow exact-MP4 parity are covered. Continue to test new fonts and treatments against the same gate.
- **Completed for bundled media:** every curated Pexels photo and video records its immutable source ID and exact source page; the public footer names Pexels and links its license. Apply the same record to every future third-party asset.

### 2. Editor reliability

- Continue the exhaustive toolbar and inspector matrix as the interface evolves. Core desktop timeline transport, seek, split, undo/redo, deletion, final-ayah protection, upload, restore and exact export now have direct browser evidence; native autosave and Undo/Redo retain model/UI coverage.
- **Completed for the enumerated browser edge cases:** long-Surah navigation, Al-Baqarah 2:282 wrapping/export, Urdu RTL rendering, missing translations, constrained first load, forced network loss after Studio load, storage-quota save failure, corrupt audio, unsupported input, and same-session source replacement all have direct browser evidence.
- **Completed:** preview and exact-MP4 dimensions match at 9:16, 16:9, 1:1, and 4:5; `e2e/export-format-parity.spec.ts` guards the canonical output matrix.
- **Completed for browser performance:** enforce deployed budgets for usable import, local ingestion, Studio transition, playback response, timeline seeking, and exact MP4 preview; the 512 MB-heap three-minute export fixture also passes. Keep poor-network and real-device thermal testing as separate gates; see `docs/2026-07-18-performance-budget.md`.

### 3. Mobile creation and sharing

- Audit every native page and interaction at small and large Dynamic Type sizes.
- Finish import, edit, export, save-to-library, and platform share flows for TikTok, Instagram Reels, and YouTube Shorts.
- **Completed for the reference handoff:** the Share extension and Import page accept direct URLs plus caption-wrapped TikTok, Instagram, and YouTube share text; normalize the first supported reference; reject credentials, spoofed domains, platform home/profile pages, and incomplete watch links; and store only the post reference while the creator supplies an original file they may edit. Full TikTok video and short-link forms, Instagram post/reel/share forms, and YouTube watch/Shorts/short-link forms have direct unit coverage.
- Verify cancellation, permissions, low storage, backgrounding, interrupted exports, and offline behaviour.
- Create the App Store Connect record, upload the signed build, run TestFlight smoke tests, and prepare store metadata/privacy disclosures.

### 4. Production platform

- Finalise authentication, account deletion, data export, rate limits, abuse controls, audit logs, and secrets management.
- Prove tenant isolation and concurrency behaviour with integration/load tests.
- Add observability for imports, recognition, alignment, rendering, exports, and failed jobs.
- Build admin analytics around activation, successful first export, retention, failure rates, and support operations.
- Treat gated Quranic audio datasets according to their research-only terms; do not ship or redistribute restricted recordings.

### 5. Launch gate

Public launch requires all of the following:

- Green unit, integration, browser E2E, native UI, accessibility, security, and export-parity suites.
- No critical or high-severity open defects.
- Privacy policy, terms, attribution/licensing, support, deletion, backups, and incident response in place.
- Real-device tests across supported iPhone/iPad and desktop browser ranges.
- Controlled beta feedback reviewed and launch decision recorded.

## Immediate next checkpoint

The current checkpoint is desktop capability completion: reciter breadth, reusable B-roll, curated stock safety, preset breadth, caption typography, and production UX gates. Mobile social workflows follow after this checkpoint is verified and published.
