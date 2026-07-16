# Layouts

## Public application shell

`src/app/layout.tsx` loads the product fonts, global CSS, `SiteNav`, page content, and `SiteFooter`. Public pages use a centered max-width container over the near-black Midnight Mihrab background.

## Focused studio shell

The `/studio` route hides the public navigation and footer. Studio supplies its own full-bleed editor chrome and timeline.

## Current `/styles` layout

- Gallery mode: public shell, `max-w-6xl`, title/action row, then a responsive 2/3/4-column grid of tall 9:16 cards.
- Editor mode: public shell, `max-w-5xl`, action header, sticky 320px phone preview on the left and an undifferentiated vertical controls column on the right.
- Full-screen mode: black modal overlay with an 85vh phone canvas and sample/replay controls.

## Target Template Studio layout

- No timeline.
- Desktop: a compact left rail for template families, a centered phone canvas, and a structured right inspector. The canvas is the dominant object.
- Mobile/tablet: phone canvas first, then horizontal template family chips and collapsible inspector sections. Primary save/use actions stay reachable.
- Gallery: curated built-in templates first, user templates second, with clear previews and filter chips rather than an empty initial state.
