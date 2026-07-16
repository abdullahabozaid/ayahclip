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

- Mushaf QCF, Uthmanic Hafs, and Amiri Quran stay at their native Regular face. Scheherazade New and Noto Naskh Arabic may use their real 400/500/600/700 faces. Never fake a heavy Arabic weight.
- The browser specimen, canvas preview, and exported frame must use the same native face; do not advertise a synthetic weight in CSS. Export waits for the selected Quran face rather than silently capturing a fallback.
- Template gallery previews are settled, comparable frames. Motion belongs in the editor Replay action. The default Reciter Split Fade Short specimen fits its reading panel in two Arabic lines without asking the creator to repair the preset.
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

## Precision composition controls

- The canvas is directly manipulable, but every direct gesture has an exact inspector value and reset action.
- Split compositions expose separate controls for **Text region** and **Media region**. Media has fit, zoom, direct drag, horizontal offset, vertical offset, and a center action that preserves zoom. The creator must be able to place a face or subject at the center, edge, or any custom position without guessing.
- The split mask is not a fixed preset. Expose an explicit Solid/Fade edge mode plus solid-panel width, fade width, direction, panel color, and panel opacity. Defaults may be tasteful, but the creator owns the composition.
- Background color is a first-class mode, not a few swatches. Let the creator choose Solid or Gradient, edit colors, control gradient angle, move color stops, reverse them, and reset to the template default.
- Advanced controls use compact rows with a visible numeric value. Do not hide essential placement behind unlabeled swatches.
- Canvas gestures must distinguish text movement from media focal-point movement with an explicit canvas-tool selector. Never make the whole canvas ambiguously drag two different things.

## Quran typography controls

- Offer named, verified Quran rendering modes: **Mushaf (QCF page glyphs)** for Quran.com page-faithful glyphs, **Uthmanic Hafs** for a flowing digital line, **Amiri Quran** as an editorial face, **Scheherazade New** for traditional weighted Naskh, and **Noto Naskh Arabic** for compact weighted social captions.
- The selected Arabic rendering mode must actually change preview and export. QCF glyph data must not silently override a non-QCF font choice.
- Show a real short/medium/long Quran sample with harakat, waqf marks, and an ayah end mark. A font option is only shippable after canvas and exported-frame mark-integrity checks.
- Arabic uses real font faces at their supported weights. Never synthesize bold. Emphasis comes from size, color, outline, glow, or a line plate.

## Responsive rules

- Desktop: three-column creative workspace with canvas dominant.
- Tablet: canvas and inspector, family rail becomes chips.
- Mobile: canvas first; inspector sections stack; sticky bottom actions for Save and Use template.

## Recognition and alignment rules

- Import recognition exposes four real stages: **Prepare**, **Listen**, **Match**, and **Align**. Studio alignment exposes **Prepare**, **Listen**, and **Place cuts**.
- Show model-download percentage when available, the current local action, cancel, and a short on-device privacy note. Do not use generic AI icons, magic language, fake confidence percentages, or indefinite “analysing” copy.
- Treat Quran-range confidence and boundary confidence separately. The result names the suggested surah and ayah range, alignment method, and only the ayah transitions that require listening.
- Retrieve short or repeated ayahs through both whole-surah and individual-verse candidate paths. Tied phrases remain low-confidence creator choices, never silent automatic metadata.
- Hold recognition releases to zero false automatic ranges and at least 97% expected-range recall in the maintained real-audio candidate set; evaluate boundary timing independently.
- Manual range controls remain available in every outcome. Require explicit Quran-range confirmation before the creator can continue.
- Alignment is transactional and reversible. Existing timing edits remain untouched until a full result succeeds; cancellation and errors explain the recovery path.
- Use “Align by recitation” and “Rebuild from pauses” instead of implementation jargon.

## Implementation constraints

- Continue using the real export renderer for every preview.
- Retain `/styles` URL compatibility while changing the visible label to Templates.
- Do not add a third-party YouTube downloader. Support local files the user owns or has permission to use.
