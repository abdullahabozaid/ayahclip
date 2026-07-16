# Timeline Editor — CapCut-style Redesign (Phase 3)

**Date:** 2026-07-16 · **Status:** building · **Device target:** phone / touch-first

## Goal

Make the imported-audio timeline editor feel like CapCut: a fixed-center playhead with a
scrolling timeline, a legible two-color waveform that shows the detected pauses, comfortable
touch targets with snap feedback, and a clean SVG icon language — without cargo-culting a
full multi-track NLE.

## What the research said to ADOPT (ranked) and what to AVOID

Adopt: fixed-center playhead + scrolling timeline · two-color waveform (played/unplayed) from
cached peaks with visible pauses · snap boundaries to silences + zero-crossings with snap-line +
haptic · roll-edit shared boundary handles · 44px hit targets + grab animation + live time
readout · playhead-anchored zoom + fit / zoom-to-verse · contextual bottom toolbar (single-select)
· scrub-with-audio + iOS variable-gain fine scrub · keyboard set · loop-region band.

Avoid (wrong for a verse editor): multi-track / ripple edits (verses tile one continuous file —
edits are ROLL edits, no gaps) · multi-select · minimap · beat detection · frame-grid snapping ·
JKL shuttle / keyframes / transitions.

Spiritual reference: **Descript's wordbar** — a semantic segment lane over a waveform precision
surface — not a mini-Premiere.

## Current-state pain (from the code map)

- Waveform is flat peak-only, one off-token color, **no played/unplayed**, **detected pauses
  invisible** (`pausesRef` exists but is only an invisible snap target). Re-scans all samples
  every resize/zoom (no cached peaks). Minimap duplicates the peak loop.
- **Emoji-as-icons** everywhere (🔁 ✂ ⧉ ↻ ⇤ ⇥ ✕ ×) mixed with proper SVGs — the biggest
  "utilitarian not premium" tell.
- Moving playhead, percentage-of-duration positioning (precision changes with zoom implicitly).
- 10px trim handles, no grab animation, no haptic, no snap line.
- Zoom recenters on playhead via buttons/Cmd-wheel only — **no pinch**, no fit, no zoom-to-verse.
- **No whole-verse delete or adjacent-verse merge in the timeline view** (only duplicate).
- Two different "split" meanings (boundary S vs caption Shift+S) — a UX hazard.
- Off-token waveform + active-block colors; error banner uses raw amber/red.

## Build plan — model-agnostic first, then the architecture

Ordered so early increments survive the later playhead rewrite. Each increment: implement →
`tsc`/`eslint`/`vitest` → browser-verify → commit.

**Increment 1 — Waveform (model-agnostic, highest visible impact).**
Cache min/max peaks per pixel bucket at decode. Draw two-color (gold played left of playhead,
muted `--parchment`-derived unplayed right). Draw detected pauses as faint vertical bands so the
silence gaps that define verse boundaries are visible. Kill the duplicate minimap peak loop by
sharing the cached peaks. Colors on tokens.

**Increment 2 — Icon language + touch targets (model-agnostic, visual).**
Replace every emoji with an inline SVG matching the existing icon set. Enlarge trim-handle hit
areas to ~44px (invisible padding over a thin visual grip), add a grab scale/brighten animation,
and a live time-readout bubble during edge drags. Active-block colors onto tokens.

**Increment 3 — Timeline functions (model-agnostic).**
Add whole-verse **delete** and adjacent-verse **merge** to the timeline inspector (reuse the
store's `deleteImportedVerse`; add a merge op to `timing-ops.ts`). Disambiguate the two "split"
labels.

**Increment 4 — Fixed-center playhead + scrolling timeline (architecture).**
Switch to a pixels-per-second model. Playhead is a fixed vertical line at viewport center;
content scrolls under it. `scrollLeft ↔ currentTime`. Scrub = drag timeline horizontally. Zoom
= change pps anchored on the playhead (centered time fixed). Pinch-to-zoom. This reworks scrub +
handle-drag hit-testing against the new coordinate system.

**Increment 5 — Snap feedback + fine scrub + fit/zoom-to-verse.**
Snap-line flash + `navigator.vibrate` haptic tick + magnetic pull with hysteresis on boundary
drags. Snap targets: silence centers, zero-crossings, neighbor boundaries. iOS-style
variable-gain fine scrub (drag away from the track → finer). One-tap "fit" and "zoom to selected
verse".

**Increment 6 — Contextual bottom toolbar + keyboard.**
Single-selection contextual action row (Split / Trim / Duplicate / Delete / Loop). Keyboard:
Space, ←/→ nudge, S split, L loop, Cmd-Z/Shift-Cmd-Z, Delete.

## Refactor note

TimelineEditor is 1528 lines; extract as we touch each area: `useImportedBuffer`, `<Waveform>`,
`useTimingsHistory` (dup of VerseCardEditor), `usePlayhead`, drag state machine, timing mutations
(→ `timing-ops.ts`). Don't rewrite wholesale; refactor the seams we edit.
