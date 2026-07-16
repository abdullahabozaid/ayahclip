# AyahClip post-pull review

Date: 2026-07-16
Reviewed revision: `575ee16` (`main`, identical to `origin/main`)
Comparison base: `249db46`

## Verification

- `git pull --ff-only origin main`: already up to date.
- `npm test`: 23 files, 151 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed, all 20 routes generated.
- `npm audit --omit=dev`: reports two moderate PostCSS advisories through Next.js. The suggested forced fix would downgrade Next.js to 9.3.3 and must not be used.

## What changed and is worth keeping

The work since `249db46` fixes several real correctness problems rather than only changing visuals:

- Export now treats duplicated verse timings as distinct clip rows and honors word ranges and split timing in both audio paths.
- Preview/export timing parity is covered by dedicated tests.
- Library bulk actions only affect visible clips, duplicate IDs are rejected, metadata writes are atomic, and a failed library save is surfaced to the user.
- Project settings that previously disappeared after reload now round-trip.
- A fresh project clears transient active-word and emphasis state.
- Re-importing revokes the previous blob URL.
- Imported timings pass through one normalization chokepoint.
- The hidden dock timeline is unmounted while the fullscreen editor is active, preventing duplicate decoding and divergent local undo histories.
- The timeline now has cached waveform peaks, visible pause guides, played/unplayed color, a fixed-centre playhead, fit/focus zoom, undo/redo, clearer SVG controls, snapping feedback, and whole-verse deletion.

This is a meaningful improvement over the comparison base. The code is currently buildable and the core timing/export fixes have useful regression coverage.

## Remaining work, ordered by priority

### P0: timeline interaction correctness on phones

1. **Fix the minimap lifecycle or remove it.** The minimap canvas only draws when `decoded` changes, but it is not mounted until `zoom > 1`. On the normal path decoding completes at 1×, then zooming mounts a blank canvas without rerunning the draw effect. The Phase 3 specification also explicitly lists a minimap under features to avoid.

2. **Finish touch input rather than calling the editor touch-first.** Timeline handles are 20px wide and the split removal button is 24px, below the documented 36px project minimum and the Phase 3 target of 44px. Pointer interactions do not handle `pointercancel` or use pointer capture, so an interrupted touch can leave listeners or drag history in a bad state.

3. **Add pinch-to-zoom and fine scrubbing.** Both were committed in the Phase 3 build plan but are absent. The current `touch-pan-x` setup delegates horizontal touch panning to the browser and does not provide the planned variable-gain precision behavior.

4. **Make destructive editing reversible.** Whole-verse delete intentionally clears the timeline history, so it cannot be undone even though the product principle says destructive actions are reversible by default. Store selection and timing state together in a unified history entry, or provide a visible undo action after deletion.

5. **Add UI-level timeline tests.** The 125 tests cover pure timing/export/store logic, but none exercise fixed-centre scroll mapping, minimap rendering, zoom anchoring, pointer cancellation, keyboard deletion, or undo/redo. These are the exact areas most likely to regress.

### P1: Phase 3 spec gaps and maintainability

1. **Split `TimelineEditor.tsx`.** It grew to 1,728 lines despite the Phase 3 spec explicitly requiring extraction of the imported-buffer hook, waveform, timing history, playhead, drag state machine, and timing mutations. This is now the largest component in the application and makes interaction bugs harder to isolate.

2. **Move more edits into `timing-ops.ts`.** Only normalization is shared today. Delete, duplicate, split, trim, boundary edits, and adjacent merge still live in component closures. Pure operations would make them testable and let `VerseCardEditor` and `TimelineEditor` share behavior.

3. **Implement or remove promises from the spec.** Adjacent-verse merge, zero-crossing snap targets, magnetic hysteresis, loop-band visualization, and the specified contextual bottom toolbar were not completed. The delivered keyboard map also uses `L` for the left boundary rather than loop, diverging from the written plan.

4. **Fix keyboard and popover accessibility.** Segment bodies and handles are pointer-only `div` elements. The minimap is also pointer-only. The shortcuts surface uses `role="dialog"` without focus movement, Escape handling, or focus restoration. Add semantic controls and visible focus states.

5. **Stop vertical wheel gestures from moving two surfaces.** The editor converts vertical wheel delta into horizontal timeline movement without preventing the page's default vertical scroll. This can make trackpad editing move both the timeline and the surrounding studio.

### P1: import and reliability gaps

1. **Support common phone video inputs.** The import and background pickers only advertise MP4/WebM. iPhone `.mov` and several browser-reported QuickTime MIME types are not accepted even though phone upload is a primary workflow.

2. **Harden large imports.** Audio decoding, waveform analysis, ASR resampling, and export are client-side and can create large simultaneous buffers. Add explicit duration/file-size guidance, cancellation, progress, and memory recovery before marketing long-video import.

3. **Make ASR failure modes deterministic.** The 131 MB model path has user messaging, but needs offline/cache handling, retry/cancel behavior, and browser capability checks. Keep pause detection as the clearly explained fallback.

### P1: release engineering

1. **Add CI.** There is no `.github/workflows` configuration. Run lint, TypeScript, tests, and build on every pull request.

2. **Track the PostCSS advisory without using `npm audit fix --force`.** It is currently nested under Next.js and the automatic command proposes a destructive downgrade. Upgrade only to a verified patched Next.js release after checking the bundled dependency and the Next 16 migration notes.

3. **Add browser smoke tests for the critical path.** At minimum: choose/import verses, auto-detect, adjust a boundary, split a long ayah, save/reload, export, play the result, and verify Arabic/translation text parity.

4. **Add observability and recovery.** Market-ready client rendering needs actionable export/import error reports, crash-safe project persistence, and a way for users to copy a diagnostic bundle without exposing recitation media.

### P2: product completion

1. **Template creator and preset system.** The current styles surface and saved styles are not yet the Canva-like, phone-canvas-only template workflow requested for AyahClip. Presets should store visual composition separately from Quran/audio content and be reusable in both imported and reciter modes.

2. **Lawful audio-only video workflow.** Make the existing local video upload explicitly support “keep audio, replace visuals.” Do not add a YouTube downloader or circumvention path. Guide creators to upload media they own or are permitted to reuse, then extract audio locally and replace the image/video layer.

3. **Finish real content/library behavior.** Recheck library calendar/grouping behavior, empty states, mobile bulk actions, and persistence with actual exported clips rather than only metadata fixtures.

## Recommended execution order

1. Fix the blank minimap issue, pointer cancellation, touch hit targets, and reversible deletion.
2. Extract timeline hooks/operations and add interaction tests before adding more tools.
3. Support MOV/QuickTime imports and harden long-file cancellation/memory behavior.
4. Add CI and browser smoke coverage.
5. Build the canvas-only template creator and reusable preset data model.
6. Run a full mobile browser QA pass, then production security/performance checks.

## Ship assessment

The branch is materially better and safe to continue from. It is not yet market-ready for a touch-first public launch because the most complex new surface has no UI tests, does not meet its own touch-target requirements, contains an observable minimap regression, and remains concentrated in a 1,728-line component. Address the P0 items before adding more timeline functionality.

## Resolution addendum

Implemented after this audit on 2026-07-16:

- Removed the minimap and its stale lifecycle entirely.
- Increased timeline boundary and split-removal targets to 44px.
- Added pointer capture plus `pointercancel` cleanup for track panning and timing drags.
- Added pinch-to-zoom and a reduced-gain Precision drag mode for fine scrubbing.
- Unified timing, selected-verse, and active-index snapshots so whole-verse deletion can be undone and redone safely.
- Prevented vertical wheel gestures over the timeline from also scrolling the surrounding page.
- Added imported-timeline deletion regression tests.
- Added GitHub Actions verification for lint, TypeScript, Vitest, and production build.
- Extracted deep-cloned, bounded timeline history snapshots into a pure module with dedicated regression coverage.
- Added a privacy-safe `/diagnostics` report that allow-lists coarse compatibility state, excludes source content, handles blocked clipboard access, and exposes a manual-copy fallback.
- Added five committed Chromium smoke tests covering import formats, template-to-editor navigation, canvas-preset save/reuse, ordered B-roll slots, diagnostics privacy/recovery, browser errors, and phone-width overflow; CI installs Chromium and runs them against the production build.
- Replaced the former styles form with a gallery plus canvas-only Template Studio. The creator supports direct text placement, safe-area controls, full visual-composition persistence, immutable built-ins, media placeholders, and simple ordered B-roll controls without exposing a timeline.
- Added the lawful local-video route **Keep audio, replace visuals**, with YouTube Studio/Google Takeout guidance for creators using media they own or are permitted to reuse.
- Applying a template with media slots now carries an ordered request into Studio, opens the relevant settings automatically, and fills existing placeholder scenes rather than creating duplicate scenes.

Still open before a broad public launch: further decomposition of the oversized timeline renderer/interaction surface and deeper long-import memory recovery beyond the new limits/cancellation. These are maintainability and resilience follow-ups, not blockers for the completed template workflow.
