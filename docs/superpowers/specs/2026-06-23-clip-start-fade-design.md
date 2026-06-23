# Clip-Start Fade-In — Design Spec

**Date:** 2026-06-23
**Status:** Approved, building

A synced fade-in at the very start of a clip: over the first N ms the whole frame (background video/photo + verse) eases in from black, with an optional matching audio fade-in. This is a **clip-level** effect (once, at t0), distinct from the existing **per-verse** `verseIntro` animation.

## Decisions

- **Visual:** fade the entire composed frame in from black. Default **on for new clips (~400ms)**; reopened saved clips keep their current look (no fade).
- **Audio:** optional toggle ("Fade in audio"), off by default, reuses the same duration so it's synced.
- **Parity:** all composition stays in `drawScene` (the single path); each caller computes the fade progress and passes it in.

## Data model

- Store (`src/lib/store.ts`): `clipFadeMs: number` (default **400**, range 0–1500; 0 = off) + `audioFadeIn: boolean` (default **false**), with `setClipFadeMs` / `setAudioFadeIn`.
- Project settings (`src/types/index.ts`) gain `clipFadeMs?` and `audioFadeIn?`.
- **Preserve old clips:** `restoreProject` sets `clipFadeMs = settings.clipFadeMs ?? 0` and `audioFadeIn = settings.audioFadeIn ?? false` (missing → off), while a fresh studio session keeps the store default of 400.
- `ExportOptions` (`src/lib/export.ts`) gain `clipFadeMs` + `audioFadeIn`, threaded from the store wherever export options are assembled.

## Pure logic (`src/lib/clip-fade.ts`, unit-tested)

- `clipFadeProgress(elapsedMs: number, clipFadeMs: number): number` → `clipFadeMs <= 0 ? 1 : clamp(elapsedMs / clipFadeMs, 0, 1)`. 0 = black, 1 = fully visible.
- `applyAudioFadeIn(channelData: Float32Array, sampleRate: number, fadeMs: number): void` → multiplies the first `ceil(fadeMs·sampleRate/1000)` samples by `i / n` (in place). No-op when `fadeMs <= 0`.

## Visual fade — `drawScene` (`src/lib/render-core.ts`)

- `SceneContent` gains `clipFadeProgress?: number` (default 1).
- At the very end of `drawScene`, after the scene is composed: `if (p < 1) { ctx.save(); ctx.globalAlpha = 1 - p; ctx.fillStyle = "#000"; ctx.fillRect(0,0,w,h); ctx.restore(); }`. Background + overlay + verse fade together; text rendering untouched.

## Progress per call site

- **Fast export** (`export.ts` frame plan): `clipFadeProgress(t·1000, clipFadeMs)` with `t` = output-timeline seconds (clip start = 0). Include the rounded value in the FramePlan `key` so run-length encoding keeps fade frames distinct.
- **Real-time export:** capture `clipStartMs` at the first frame; `clipFadeProgress(now - clipStartMs, clipFadeMs)`.
- **Preview** (`StudioPreview.tsx`): `clipStartedAtRef` set when playback begins from the first verse; progress = `clipFadeProgress(now - clipStartedAt, clipFadeMs)`. A paused/static preview shows progress = 1 (fully visible); the fade animates only when playing from the start.

## Audio fade

- **Fast export** (`assembleAudio`): after `OfflineAudioContext.startRendering()`, call `applyAudioFadeIn` on each channel of the rendered buffer (first N ms of the whole clip). Gated on `audioFadeIn && clipFadeMs > 0`.
- **Real-time export** (`exportRealtime`): insert one master `GainNode` between the verse sources and the destination; `gain.setValueAtTime(0, t0); linearRampToValueAtTime(1, t0 + clipFadeMs/1000)` once at clip start.
- **Preview:** in the existing rAF loop, set the active audio element's `.volume = clipFadeProgress(elapsedFromClipStart, clipFadeMs)` while in the window (works for reciter per-verse elements and the single imported element; no Web Audio refactor). Restore to 1 outside the window.

## UI (`StudioSettings.tsx`)

Next to "Verse Intro": a **"Clip start fade"** slider (0 = Off … 1500ms, step 50) and, shown when the fade is on, a **"Fade in audio"** toggle. Audio fade reuses the slider's duration.

## Testing

- Unit: `clipFadeProgress` (0 at start, 1 at/after window, 1 when disabled, clamps) and `applyAudioFadeIn` (first sample ≈ 0, ramps to ~1 at n, samples past n untouched, no-op at 0).
- Manual: preview and "Final MP4" show the same fade; a reopened old clip shows none; audio toggle ramps volume.

## Out of scope

Fade-out at clip end; per-verse fades (already covered by `verseIntro`); choosing a non-black fade color; crossfades between verses.
