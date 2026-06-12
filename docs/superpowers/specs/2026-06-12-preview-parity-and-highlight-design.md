# Preview/Export Parity + Arabic Line Highlight — Design

Date: 2026-06-12
Status: approved direction; Part A first, Part B second.

## Problem

1. **Preview is not accurate to export.** StudioPreview renders at 0.75× logical scale
   (canvas `r.w*2 × r.h*2` with `ctx.scale(2,2)`, scale param `r.w/480 = 0.75`), while
   FullscreenPreview and both export paths render at native export resolution
   (1080×1920 for 9:16, scale `size.w/480 = 2.25`). Canvas text measurement is
   scale-dependent, so line breaks, the Arabic→translation gap, and vertical positions
   differ between what the user sees and what gets exported. The user has confirmed the
   downloaded video looks materially different from the preview.
2. **No highlight option.** The user wants a continuous rounded highlight bar behind
   each line of Arabic text, with configurable color, corner roundness, and padding,
   that animates in (right-to-left reveal + fade) together with the ayah intro.

Constraint from user: do NOT reuse the existing StudioPreview rendering arrangement as
a model — rebuild the preview rendering path fresh. Accuracy is the top priority.
Existing project rule: all render paths must pass identical options to `drawVerseText`
(see memory: preview-must-match-export). Quranic text integrity must not change — no
modifications to text shaping/measurement/line-breaking logic beyond unifying the scale
they run at.

## Part A — Single shared frame renderer at export resolution

### Architecture

New module: `src/lib/frame-renderer.ts`.

- `buildFrameOptions(state): FrameOptions` — pure function that derives the complete
  set of drawing options (everything currently assembled inline in export.ts,
  StudioPreview.tsx, and FullscreenPreview.tsx) from store state once. One source of
  truth; the three call sites can no longer drift.
- `renderFrame(ctx, frame: FrameInput)` — draws one complete video frame
  (background, overlay, letterbox, verse text via `drawVerseText`, intro animation
  state) at **export resolution** (`FORMAT_SIZES[videoFormat]`, e.g. 1080×1920) with
  `scale = size.w / 480`. `FrameInput` carries: current verse + display text,
  translation, introProgress, emphasis/word-highlight indices, background
  image/video element, and `FrameOptions`.

All three consumers call `renderFrame`:

| Consumer | Canvas | Display |
| --- | --- | --- |
| `export.ts` (both realtime + fast paths) | 1080×1920 offscreen | encoded to video |
| `StudioPreview.tsx` | 1080×1920 | CSS-scaled to fit panel, inside DeviceFrame |
| `FullscreenPreview.tsx` | 1080×1920 | CSS-scaled to fill screen, optional DeviceFrame |

Because every consumer draws the identical pixel buffer, preview accuracy is exact by
construction: the preview IS the export frame, downscaled by the browser for display.

### StudioPreview rewrite

- Canvas element fixed at export resolution; `style.width/height` (or CSS
  `max-width/height` + `aspect-ratio`) fits it into the available panel space.
  No `ctx.scale(2,2)`, no `r.w/480` scale, no FORMAT_RATIOS-based drawing math.
- Preview sits inside the existing `DeviceFrame` (device picker from `devices.ts`),
  with TikTok/Reels chrome + safe-zone overlay options retained.
- Playback loop (requestAnimationFrame, audio sync, word highlight index, intro
  timing) is kept conceptually but feeds `renderFrame` instead of bespoke draw code.

### FullscreenPreview rewrite

Same change: drop its own option assembly, call `buildFrameOptions` + `renderFrame`.

### Performance note

1080×1920 per frame is heavier than 720×1280 but well within 60fps canvas budget on
target hardware (Apple Silicon / modern phones). If profiling shows jank, the
mitigation is rendering preview at exactly 0.5× export resolution with the SAME scale
factor passed to text measurement via an explicit `measureScale` separation — but this
is a fallback only; default is full export resolution.

### Verification

- Pixel-diff test: capture a preview frame and an export frame at the same timestamp
  for the same project; they must be identical (allowing only video-codec compression
  on the encoded output).
- Manual check on iPhone Safari and desktop: line breaks, Arabic→translation gap, and
  vertical position match the downloaded video.

## Part B — Arabic line highlight

### Settings (added to `StyleSettings`, store defaults, persistence, StylePanel UI)

- `highlightEnabled: boolean` (default false)
- `highlightColor: string` (color picker; default gold to match Midnight Mihrab)
- `highlightOpacity: number` 0–1 (slider; default 1)
- `highlightRadius: number` 0–1 normalized roundness (slider; 1 = full pill)
- `highlightPadding: number` — how far the bar extends beyond the text, as a
  multiplier of Arabic font size (slider; controls both horizontal overhang and
  vertical thickness symmetrically)

### Rendering (inside `drawVerseText` in canvas-utils.ts)

- For each laid-out **Arabic** line (both plain-text and QCF word paths), compute the
  line's measured width and baseline box, expand by padding, and fill one continuous
  rounded rect (`ctx.roundRect`) behind the line **before** drawing its glyphs.
  Per-line, not per-word: one continuous bar across the whole line.
- Highlight is drawn inside the same `paintText` pass so the existing intro-animation
  offscreen compositing (fade/blur/slide/scale) applies to bar + text together.
- Text layout, shaping, and measurement are untouched — the bar is purely painted
  behind existing glyph positions. Waqf marks and verse numbers render exactly as
  before.
- English/translation: out of scope (Arabic only, per user).

### Animation

- When an ayah intro is active, the bar reveals **right-to-left** (Arabic reading
  direction): clip each line's bar to `width × easedIntroProgress` anchored at the
  bar's right edge, while the whole composition fades in via the existing intro alpha.
  When `introStyle === "none"`, the bar simply appears with the text.
- Driven solely by the existing `introProgress` parameter — identical in preview and
  export with zero extra plumbing.

### Verification

- Preview vs export frame of a highlighted multi-line verse: identical.
- Multi-line verses: each line gets its own correctly-sized bar.
- Verse number medallion and waqf marks visually unchanged.

## Out of scope

- Translation highlight, per-word karaoke highlight (possible later — word timings
  already exist in playback-engine).
- Any change to text shaping, line breaking, or font loading.

## Order of work

1. Part A: frame-renderer extraction + StudioPreview/FullscreenPreview rewrite + export wiring + parity verification.
2. Part B: highlight settings, rendering, animation, UI.
