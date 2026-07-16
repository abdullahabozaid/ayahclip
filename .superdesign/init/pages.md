# Pages

## `/styles` current state

The route currently opens as **My Styles**. A new user sees an empty state and a `+ New style` button, even though nine built-in templates exist elsewhere in the codebase. Cards show real-renderer previews and actions for use, edit, duplicate, full screen, and delete.

The creator is already a useful no-timeline phone canvas, but it reads as a long settings form. It supports Arabic size/line height/position, text color/shadow, verse numbers, verse intro, translation settings, highlight bars, and overlay darkness. Saved styles intentionally omit background and color composition, which conflicts with the requested reusable-template model.

## `/styles` target state

Rename the visible product surface to **Templates** and turn it into a gallery plus **Template Studio**:

1. Curated templates are visible immediately and grouped into AyahClip, Reciter, Nature, Minimal, and B-roll families.
2. Clicking a template opens the same real-renderer phone canvas, with named inspector sections: Layout, Arabic, Translation, Treatment, Media, Motion.
3. Quick treatment chips expose useful presets such as Soft glow, Crisp outline, Gold line, and Clean.
4. Saving creates a reusable full composition, while transient uploaded blob media remains clip-specific and is clearly labelled.
5. `Use template` applies it to the current/new studio project.

## `/import` target clarification

Keep the existing local media import. For a video upload, make the choice explicit:

- Keep original video + audio.
- Keep audio, replace visuals in Studio.

Do not build a downloader for other people’s YouTube videos. Link users to YouTube Studio/Google Takeout for videos they uploaded and ask them to upload the permitted file locally.
