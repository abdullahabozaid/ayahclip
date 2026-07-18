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
| Reciter breadth | Implemented, search UX pending | 56 verified recordings: 46 EveryAyah verse files plus 10 complete MP3Quran timed reads; 224/224 source probes and exact-duration browser export matrix |
| Word-level timing | Implemented for supported subset | 12 Quran.com timing-capable recitations, labelled honestly |
| Whole-verse captions | Implemented | Unsupported word-timing voices no longer inherit another reciter's timings |
| Reusable personal B-roll | Implemented | Persistent IndexedDB image/video shelf with apply and inline deletion |
| Curated stock B-roll | Implemented, expansion pending | 20 photos and 11 videos visually reviewed as people-free |
| Multi-clip B-roll timeline | Implemented | Audio-led sequence, split/reorder/trim workflow |
| Native iOS beta | Implemented, distribution signing pending | 30 unit and 8 UI tests pass, including maximum Dynamic Type, debounced draft autosave/background flush, bounded Undo/Redo, enforced import limits, and project-owned cancellable exports; arm64 Release archive contains the Share extension, privacy manifests, app icon, Quran font, and dSYMs |
| TestFlight distribution | Blocked by account configuration | The Mac has a valid Apple Distribution certificate but no AyahClip provisioning profiles or registered iPhone; a signed archive and App Store Connect record for `app.ayahclip.mobile` are still required |
| Public production readiness | Not complete | Remaining gates below |
| Security/backend baseline | Implemented, distributed WAF pending | Zero production dependency advisories; no tracked secrets; headers, local-filesystem isolation, request limits and API boundary tests documented in `docs/2026-07-18-security-backend-audit.md` |

## Delivery sequence

### 1. Desktop content and creation breadth

- Replace the EveryAyah-only folder field with a source descriptor and shared preview/export resolver before admitting another provider.
- Add source health checks, provenance, coverage, CORS, and rights evidence for every enabled recitation.
- Build searchable English/Arabic reciter selection with recent, favourite, place, style, and timing-capability organization after the resolver is proven.
- Expand curated people-free B-roll by category: water, mountains, clouds, drives, architecture, night, and abstract shapes.
- Add a reviewable ingestion pipeline before exposing dynamic stock search.
- Add saved style presets for split composition, reciter portrait, rotating B-roll, image sequences, and restrained glow typography.
- Complete Arabic/English font pairing, weights, wrapping, safe-area, and export-parity tests.
- Add explicit media provenance and licensing notes where third-party sources are used.

### 2. Editor reliability

- Exercise every toolbar, inspector, timeline, keyboard, upload, restore, and export path. Native autosave and Undo/Redo now have direct model/UI coverage; desktop history remains part of this gate.
- Test long Surahs, long translations, right-to-left text, missing translations, network loss, storage quota, corrupt files, and unsupported codecs.
- Verify preview/export parity at TikTok, Reels, Shorts, and landscape sizes.
- Add performance budgets for initial load, timeline scrubbing, preview playback, and export.

### 3. Mobile creation and sharing

- Audit every native page and interaction at small and large Dynamic Type sizes.
- Finish import, edit, export, save-to-library, and platform share flows for TikTok, Instagram Reels, and YouTube Shorts.
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
