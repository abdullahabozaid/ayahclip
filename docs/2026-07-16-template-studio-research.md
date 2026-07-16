# AyahClip Template Studio research and product direction

Date: 2026-07-16

## What the current product already has

- A real export-renderer preview in `/styles`.
- A phone-shaped 9:16 canvas with no timeline.
- Nine built-in `TEMPLATES` in `src/lib/templates.ts`.
- Saved user styles in local storage.
- Center and left-panel text composition.
- Arabic/translation typography, shadows, Arabic line plates, overlays, letterboxing, fitted media, and verse intro animation.
- Uploaded video audio extraction in the browser.
- Multi-scene background/B-roll sequences in Studio.

## Gaps that block the requested workflow

1. `/styles` opens empty for a new user and does not surface the built-in templates.
2. It is presented as a long style form rather than a guided template creator.
3. Saved styles intentionally discard colors, media, and background composition, so they are not full templates.
4. The current saved-style model cannot describe multi-scene B-roll sequences or clip-level word highlighting.
5. The import flow can already extract a video’s audio, but the “keep audio, replace visuals” path is not presented clearly.
6. The template surface still uses glyph/emoji-like action icons and has weak grouping/hierarchy.

## @ayahclip TikTok account audit

The live profile inspected on 2026-07-16 showed 1,284 followers and 155.9K likes. Recent covers consistently use:

- A black 9:16 outer canvas.
- A dark or desaturated landscape reciter/archival clip nested inside the vertical frame.
- Uthmanic Arabic centered over the visual.
- A subdued olive/gold rounded plate behind the active Arabic line.
- Small white or parchment serif English below.
- Large areas of intentional black negative space.

This is a recognizable house style and should become the **AyahClip Gold Line** template family, not be treated as the only output style.

## Recent creator demand and competitor patterns

- Recent Islamic-video editor requests repeatedly ask for simple black backgrounds, nature B-roll, polished subtitle timing, and fast mobile/CapCut-like workflows.
- Quran Caption exposes independent Arabic and translation styling, glow, outline, overlays, fade transitions, and reusable style import/export.
- Quran Captions for iOS markets automatic timing, 21+ translation languages, caption glow/outline/animation/position, and manual control.
- Deen Studio emphasizes word-by-word gold Arabic highlighting, nature backgrounds, mobile creation, and 9:16 exports.

## Typography recommendations

- Keep Uthmanic Hafs as the default Quran face. Add Amiri Quran as a deliberate editorial alternative.
- Do not simulate bold Uthmanic Arabic. Use size, contrast, a crisp outline, controlled glow, or a highlight plate.
- Use Outfit 600 for compact TikTok-readable translation presets.
- Use Lora 500 for a softer, reflective translation preset.
- Use Playfair Display sparingly for cinematic/editorial translation, not for dense small text.
- Avoid Cinzel for paragraph-like translations; reserve it for tiny surah/title treatments.

## Recommended template families

1. AyahClip Gold Line
2. Reciter Split Fade
3. Nature Reflection
4. Clean Ink
5. Translation Led
6. B-roll Rotation

## YouTube/audio product boundary

AyahClip should not download or rip audio from arbitrary YouTube videos. YouTube’s official help states that creators may download videos they uploaded through YouTube Studio, while other users’ videos are not downloadable as files through that route. The safe product workflow is:

1. Download your own upload from YouTube Studio or Google Takeout, or obtain a permitted source file directly.
2. Upload that local video to AyahClip.
3. Choose **Keep audio, replace visuals**.
4. Detect verses locally, pick a template, and replace the visual track in Studio.

## Implementation sequence after design approval

1. Upgrade the visible `/styles` surface to Templates / Template Studio.
2. Surface curated built-ins and add family metadata.
3. Add a versioned saved-template model for full visual compositions.
4. Add named caption treatments and split-fade controls.
5. Make the import choice explicit and accept common phone video containers where supported.
6. Integrate multi-scene B-roll template defaults without introducing a timeline in Template Studio.
7. Verify gallery, creator, Studio handoff, mobile layout, rendering parity, tests, lint, type-check, and production build.

## Sources

- TikTok account: https://www.tiktok.com/@ayahclip
- Quran Caption style editor: https://qurancaption.com/documentation/style-editor
- Quran Captions App Store listing: https://apps.apple.com/gb/app/quran-captions/id6761422097
- Deen Studio: https://deenstudio.app/
- YouTube Help, download your own uploads: https://support.google.com/youtube/answer/56100
- YouTube offline/download FAQ: https://support.google.com/youtube/answer/7381437
