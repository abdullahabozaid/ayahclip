# Template Studio implementation contract

Date: 2026-07-16

This document turns the Template Studio research into a concrete engineering contract and records the implementation evidence for the approved Superdesign direction.

## Product requirements

The finished feature must prove all of the following:

1. New users see useful curated templates immediately.
2. The visible navigation label is **Templates** while `/styles` remains a compatible URL.
3. A creator can build and preview a reusable template on a 9:16 phone canvas without a timeline.
4. The phone canvas uses the real export renderer.
5. A template can include typography, color, text treatment, layout, media treatment, motion, and optional B-roll sequence defaults.
6. Editing a built-in creates a user copy; built-ins are immutable.
7. User templates survive reloads.
8. Transient `blob:` or `data:` media is never serialized as if it were durable.
9. Applying a template is reversible and does not silently destroy a user’s uploaded media.
10. Imported video offers an explicit **Keep audio, replace visuals** route.
11. Arbitrary YouTube downloading is not added. The UI points owners to YouTube Studio/Google Takeout, then accepts the permitted local file.
12. Desktop, tablet, and phone layouts remain usable and touch targets are at least 40px.

## Versioned template model

The implementation should introduce a separate model instead of overloading the existing layout-only `SavedStyle` record.

```ts
type TemplateFamily =
  | "featured"
  | "ayahclip"
  | "reciter"
  | "nature"
  | "minimal"
  | "broll";

type TemplateMediaPolicy =
  | "preserve-current-media"
  | "use-template-media";

interface TemplateVisualSettings extends StyleSettings {
  safeAreaTarget?: "none" | "tiktok" | "reels";
  safePadding?: number;
  wordHighlight?: boolean;
  emphasisStyle?: "color" | "underline";
  emphasisColor?: string;
  clipFadeMs?: number;
  audioFadeIn?: boolean;
  backgroundSequenceEnabled?: boolean;
  backgroundScenes?: BackgroundScene[];
}

interface TemplateMediaSlot {
  id: "background" | `scene:${string}`;
  accepts: "image" | "video" | "image-or-video";
  label: string;
}

interface SavedTemplate {
  schemaVersion: 1;
  id: string;
  source: "built-in" | "user";
  name: string;
  description: string;
  family: TemplateFamily;
  mediaPolicy: TemplateMediaPolicy;
  settings: TemplateVisualSettings;
  mediaSlots: TemplateMediaSlot[];
  createdAt: number;
  updatedAt: number;
}
```

## Storage and migration

- New key: `ayahclip:saved-templates:v1`.
- Keep reading `ayahclip:saved-styles` during a one-time migration.
- A legacy saved style becomes a user template with `mediaPolicy: "preserve-current-media"`.
- Do not delete the legacy key until the new record has been written successfully.
- Malformed records are skipped individually rather than making the whole gallery empty.
- Built-ins remain source-controlled and are merged with stored user templates at read time.

## Media safety rules

### Durable backgrounds

Solid colors, gradients, and approved durable asset URLs may be stored directly.

### Local uploaded media

`blob:` and `data:` values are session-local or unsuitable for local-storage records. On save:

1. Replace the serialized background with a dark media-slot placeholder.
2. Add a `TemplateMediaSlot` describing what the user must supply.
3. Preserve fit, transform, backdrop, split layout, overlay, and timing settings.
4. Show “Add your media” in the template preview/editor.

### Applying templates

- `preserve-current-media`: apply caption/layout/treatment settings but leave the current background, background sequence, fit, and transforms untouched.
- `use-template-media`: apply durable template media and sequence defaults. If the template has media slots, keep the current compatible media where possible and prompt for only the missing slots.
- Generate fresh background-scene IDs when a template is instantiated.

## Built-in families

### 1. AyahClip Gold Line

- `family: "ayahclip"`
- black 9:16 outer composition
- contained, darkened landscape reciter or archival media
- Uthmanic Arabic at normal weight
- muted olive/brass active-line plate
- Lora or Playfair translation, small and warm-white
- subtle clip-start fade

### 2. Reciter Split Fade

- `family: "reciter"`
- black left reading panel
- reciter media visible from center to right
- soft horizontal transition between panel and media
- Arabic and English left-aligned
- Outfit 600 English for compact readability

### 3. Nature Reflection

- `family: "nature"`
- full-frame nature media slot
- strong neutral overlay
- centered Quran Arabic
- restrained white glow treatment
- Lora 500 translation

### 4. Clean Ink

- `family: "minimal"`
- solid near-black background
- crisp parchment Arabic
- minimal translation
- no plate and no decorative motion

### 5. Translation Led

- `family: "minimal"`
- readable English is the main visual hierarchy
- smaller Arabic retained for Quran context
- high contrast and safe-area-aware positioning

### 6. B-roll Rotation

- `family: "broll"`
- three media slots by default
- 4–6 seconds per scene
- 0.5–0.7 second crossfades
- stable caption treatment across all scenes
- Template Studio still has no timeline; scene order and duration are simple cards/fields in the Media inspector.

## Named text treatments

The creator should expose useful choices before raw controls:

- **Clean**: no glow, small dark shadow.
- **Soft glow**: warm-white text, tight dark outline/shadow, modest blur.
- **Crisp outline**: stronger near-black edge for bright footage.
- **Gold line**: muted olive/brass plate behind Arabic lines.

Advanced controls may then expose color, blur, offsets, plate opacity, radius, padding, and height.

## Required renderer change for Split Fade

The existing `textLayout: "left-panel"` places text correctly but does not fully model a left black-to-media fade. Add an optional composition field such as:

```ts
interface MediaReveal {
  enabled: boolean;
  side: "left" | "right";
  solidUntil: number; // 0..1 of canvas width
  fadeUntil: number;  // 0..1 of canvas width
  color: string;
}
```

It must be consumed by the shared canvas renderer so Studio preview and export remain identical. For the requested preset, black is solid from the left edge to roughly 42% and fades to transparent by roughly 62%.

## Import workflow

For uploaded video, replace the current checkbox with a clear two-choice control:

- **Keep video and audio**: existing behavior, background video uses `contain` and remains lip-synced.
- **Keep audio, replace visuals**: extract audio locally, do not install the uploaded video as the project background, then open Studio with Templates highlighted as the recommended next step.

Accept common browser-supported phone containers and let ffmpeg handle fallback extraction. The source copy should say “video you own or have permission to use.”

Provide a compact YouTube help note:

> Using your own YouTube upload? Download it from YouTube Studio or Google Takeout, then upload the file here.

## Test matrix

### Unit tests

- Version-1 template records round-trip through storage.
- A malformed stored template is ignored without hiding valid templates.
- Legacy saved styles migrate once and use `preserve-current-media`.
- `blob:` and `data:` media become slots and are absent from serialized JSON.
- Durable gradient/solid backgrounds remain unchanged.
- Applying preserve-current leaves current background, sequence, fit, backdrop, and transform unchanged.
- Applying template media creates fresh scene IDs.
- Split-fade composition is included in render parity checks.

### Component/browser checks

- Built-ins appear on first visit with no local storage.
- Family filters work and do not change the canvas unexpectedly.
- Short, Medium, and Long sample verses render without clipping.
- Save, duplicate, rename, delete, and use-template flows work.
- Editing a built-in never mutates its source record.
- Mobile sticky actions do not cover the canvas or inspector.
- Keyboard focus is visible; icon buttons have accessible names/tooltips.
- Import choice creates the correct media state for both paths.

### Project verification

- `npm test`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- Browser verification at desktop, tablet, and phone viewport sizes.

## Verified baseline before implementation

Re-run on 2026-07-16 against `575ee16`:

- Vitest: 15 files passed, 125 tests passed.
- ESLint: passed.
- TypeScript `--noEmit`: passed.
- Next.js 16.2.6 production build: passed; all 18 static pages generated.

This is the baseline the Template Studio work must preserve or improve.

## Implementation verification

Completed on 2026-07-16 after the approved preset-gallery and focused-editor designs were combined:

- Vitest: 23 files passed, 151 tests passed.
- ESLint: passed.
- TypeScript `--noEmit`: passed.
- Next.js 16.2.6 production build: passed; 20 routes generated, including `/styles/editor` and `/diagnostics`.
- Live Chrome QA: template previews render with the production canvas renderer; layout, typography, treatment, B-roll, replay, full-screen, save-copy, persistence, apply-to-Studio, desktop, and 390×844 mobile flows verified.
- Two live-QA defects were fixed: hidden gallery canvases caused by stacking order and a desktop editor canvas displaced by the inspector's intrinsic height.
- Chrome's local-file permission blocked the automated upload handoff before AyahClip received the fixture; the import branch remains covered by code review and the app's existing media pipeline checks.
- Timeline follow-through removed the broken minimap, enlarged edit targets to 44px, added pointer capture and cancellation cleanup, made whole-verse deletion undoable with unified timing/selection/index snapshots, and prevented dual page/timeline wheel scrolling.
- Timeline precision follow-through added two-finger pinch zoom, a persistent Precision drag mode (plus Shift/Alt temporary precision), responsive 36px zoom controls, and phone-width toolbar fitting.
- Pinch and precision-drag calculations now live in a small pure helper with boundary and gain regression coverage instead of being buried in the timeline component.
- The full import path was verified live with real EveryAyah audio and a video-with-audio fixture: local decode, verse setup, replace-visuals template routing, waveform playback, split/undo, and keep-video lip-sync all succeeded.
- Import hardening now gives a 20-minute/250 MB recommendation, rejects files above 750 MB before allocating decode buffers, exposes cancellation during processing, and terminates ffmpeg extraction cleanly.
- GitHub Actions now runs lint, TypeScript, Vitest, and the production build on pushes to `main` and pull requests.
- Timeline history cloning/bounding now lives in a tested pure module, reducing mutation risk around split points, word ranges, selection, and the active index.
- Troubleshooting now has a privacy-safe diagnostics report with clipboard timeout handling and a selectable manual fallback; live browser QA verified both the blocked-clipboard recovery state and zero console errors.
- The canvas-only creator now supports direct vertical text placement by pointer and keyboard, platform safe-area targets, adjustable padding, restrained background presets, deliberate media placeholders, and ordered B-roll media slots without introducing a timeline.
- Applying a media-slot template now opens Studio settings automatically, preserves the request through verse selection, replaces placeholder scenes in order, and advances to the next requested visual instead of appending stray scenes.
- Live browser QA verified the complete new-template → verse selection → Studio handoff and confirmed that filling B-roll slot 1 advances to slot 2 while preserving exactly three scenes.
- Playwright now runs five Chromium market-readiness checks against the production build, including a 390×844 overflow audit and a saved canvas preset with ordered B-roll slots; all five pass locally and are wired into CI.

## Files expected to change after approval

- `src/app/styles/page.tsx`
- `src/app/import/page.tsx`
- `src/components/SiteNav.tsx`
- `src/components/StylePanel.tsx`
- `src/components/templates/*`
- `src/lib/templates.ts`
- `src/lib/saved-templates.ts`
- `src/lib/style.ts`
- `src/lib/store.ts`
- `src/lib/render-core.ts`
- `src/lib/canvas-utils.ts`
- `src/types/index.ts`
- relevant tests under `src/lib/__tests__/`
