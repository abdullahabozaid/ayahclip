# AyahClip Template Studio Design System

## North star

Build a focused creative tool that feels like a small, reverent Canva for Quran clips. The 9:16 phone canvas is always the visual center. Controls should help a creator make a good result quickly, not expose every implementation knob at once.

## Visual identity

Use the existing Midnight Mihrab tokens from `src/app/globals.css`: near-black ink, parchment text, and restrained brass gold. Keep surfaces editorial and opaque. Avoid neon, purple-blue AI gradients, excessive glassmorphism, huge rounded cards, and ornamental noise.

## Information architecture

Gallery mode contains:

1. Page title and one sentence of guidance.
2. Family filters: Featured, AyahClip, Reciter, Nature, Minimal, B-roll, My templates.
3. Curated built-in template grid with real 9:16 previews.
4. User templates, including a clear create card.

Editor mode contains:

1. Top bar: back, editable template name, save, use template.
2. Left family/variant rail on desktop only.
3. Center phone canvas with Short / Medium / Long sample controls.
4. Right inspector grouped into Layout, Arabic, Translation, Treatment, Media, and Motion.
5. No timeline.

## Preset families

- **AyahClip Gold Line**: dark, desaturated reciter/archival landscape inside 9:16 black; Uthmanic Arabic centered with muted olive-gold active-line plate; smaller warm serif English.
- **Reciter Split Fade**: left half black reading panel; video visible on the right; gradient transition near the center; Arabic and English left-aligned.
- **Nature Reflection**: full-height nature B-roll, strong dark overlay, centered Arabic with restrained white glow and readable translation.
- **Clean Ink**: black canvas, crisp white Arabic, minimal translation, no decorative treatment.
- **Translation Led**: large readable English with smaller Arabic context.
- **B-roll Rotation**: multiple background scenes with slow fades/cuts; caption treatment stays stable.

## Typography rules

- Quran Arabic stays in Uthmanic Hafs or Amiri Quran at normal face weight. Never fake a heavy Arabic weight.
- English defaults to Outfit 600 for concise social captions or Lora 500 for reflective/editorial translations.
- Arabic should be the primary hierarchy in Quran-first templates. Translation is normally 40–55% of the apparent Arabic size.
- Line lengths must remain readable inside TikTok safe areas. Favor 2–3 Arabic lines and 2–3 English lines per frame.

## Caption treatment rules

- “Soft glow” is a small dark outline plus controlled warm-white shadow, not a large blur.
- “Crisp outline” uses a stronger near-black stroke/shadow for bright B-roll.
- Gold highlight plates use subdued olive/brass, moderate opacity, small vertical padding, and shallow rounding.
- Text effects must never obscure harakat or verse marks.

## Interaction rules

- Make the next useful action obvious: choose template, customize, use.
- Keep advanced controls behind section disclosure.
- Save is reversible: editing a built-in always creates a user copy.
- Uploaded local media is labelled clip-specific unless it can be persisted safely.
- All icon-only actions use inline SVG, accessible labels, and tooltips.
- Minimum interactive target is 40px, preferably 44px on touch layouts.

## Responsive rules

- Desktop: three-column creative workspace with canvas dominant.
- Tablet: canvas and inspector, family rail becomes chips.
- Mobile: canvas first; inspector sections stack; sticky bottom actions for Save and Use template.

## Implementation constraints

- Continue using the real export renderer for every preview.
- Retain `/styles` URL compatibility while changing the visible label to Templates.
- Do not add a third-party YouTube downloader. Support local files the user owns or has permission to use.
