# Components

## Shared application chrome

- `src/components/SiteNav.tsx`: sticky, translucent Midnight Mihrab navigation. Desktop uses an inline link row and gold `New clip` CTA. Mobile keeps the CTA visible and moves route links into a dropdown. It is intentionally hidden in `/studio`.
- `src/components/SiteFooter.tsx`: centered product note, development-support link, and source-license credits. It is intentionally hidden in `/studio`.
- `src/components/NewClipLink.tsx`: resets/starts the clip flow before routing.

## Template surface

- `src/app/styles/page.tsx`: client-side template/style gallery, phone preview, editor inspector, sample-verse switching, full-screen preview, save/duplicate/delete/apply actions.
- `StylePreview` inside `src/app/styles/page.tsx`: renders the real export canvas at 9:16 using `drawScene`; this must remain the preview source of truth.
- `Row`, `ToggleRow`, and `ColorRow` inside `src/app/styles/page.tsx`: current small inspector primitives. They should become reusable, accessible controls if implementation proceeds.

## Studio consumers

- `src/components/StylePanel.tsx`: applies built-in and saved visual presets inside Studio.
- `src/components/StudioPreview.tsx`: live render surface, including background sequences and fitted media.
- `src/components/BackgroundPanel.tsx`: background selection, media fit, and multi-scene B-roll controls.

## Visual system primitives

- `.panel`, `.panel-inset`, `.field`, `.btn-gold`, `.btn-ghost`, `.card-lift`, `.font-display`, `.font-arabic` in `src/app/globals.css`.
- Icons are inline SVG where available. The template surface still contains emoji-like glyph controls and should be normalized to the inline SVG system.
