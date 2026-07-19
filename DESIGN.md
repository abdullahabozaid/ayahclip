# AyahClip design tokens

Midnight Mihrab. All tokens live in `src/app/globals.css` as CSS variables and Tailwind v4 `@theme inline` aliases.

## Color (OKLCH-equivalent hex)

| Role | Hex | Token | Notes |
|---|---|---|---|
| Page ink | `#08090d` | `--ink` | Near-black with faint blue tint |
| Deep ink (wells) | `#050507` | `--ink-deep` | Black-adjacent, slightly tinted |
| Raised surface | `#10121a` | `--surface` | Dark slate |
| Nested / hover | `#171a24` | `--surface-2` | One step warmer |
| **Primary accent** | `#c9a24b` | `--gold` | Gilded brass — primary |
| Lift highlight | `#e0c074` | `--gold-soft` | Lighter gold |
| Pressed / shadow | `#a07d2c` | `--gold-deep` | Deeper gold |
| Secondary accent | `#1f6f5c` | `--emerald` | Deep emerald — used for splits, not chrome |
| Body text | `#ece7da` | `--parchment` | Warm off-white |
| Muted | `#8a8fa3` | `--muted` | Slate grey |
| Muted deep | `#5a607a` | `--muted-deep` | Dimmest text — labels, helpers |
| Hairline | `rgba(201,162,75,0.18)` | `--hairline` | Gold-tinted borders |
| Hairline soft | `rgba(236,231,218,0.08)` | `--hairline-soft` | Parchment-tinted dividers |

**Strategy**: Restrained. Tinted neutrals carry the surface, gold ≤10% of any view, emerald reserved for secondary signals (intra-verse splits).

## Typography

- **Display**: `Marcellus` (classical roman) — page titles, surah name in studio header
- **Body**: `Outfit` (geometric sans, 300/400/500/600) — UI, copy, controls
- **Quran Arabic**: selectable `Mushaf QCF`, `Uthmanic Hafs`, `Amiri Quran`, `Scheherazade New`, and `Noto Naskh Arabic`. QCF, Uthmanic Hafs, and Amiri Quran remain at their native Regular face. Scheherazade New and Noto Naskh Arabic expose real 400/500/600/700 faces for creators who need stronger social captions. Never synthesize Quran Arabic bold.
- Font specimens, canvas previews, and export must describe and use the same native face. Export waits for the selected Quran font and fails clearly instead of recording a browser fallback; transient QCF page-font failures remain retryable.
- Built-in templates open in a usable state. In particular, Reciter Split Fade fits the Short specimen to two Arabic lines by default, and gallery cards render settled frames rather than replaying entrance motion while creators scan choices.
- **Translation**: serif / sans / Cinzel / Times New Roman / Lora / Playfair Display (user-selectable).

Scale: keep ≥1.25 ratio between steps. Most labels in the studio are 10–12px (information density area), copy on browse/home is 14px+.

## Elevation

- Flat surfaces over decorative depth. `--surface` panels with `--hairline-soft` borders.
- One purposeful shadow: gold-tinted on focused gold buttons (`btn-gold:hover`). No drop shadows elsewhere.
- Backdrops: `bg-mihrab` adds a single 0.07-α gold radial glow at the top. Don't pile on more.

## Components (current primitives in globals.css)

- `.btn-gold` — primary CTA. Gradient gold, ink text, soft gold halo on hover.
- `.btn-ghost` — secondary. Hairline border, transparent fill, gold-on-hover.
- `.panel` — raised content slab. `surface` background, hairline-soft border, 16px radius.
- `.panel-inset` — recessed slab on top of a panel. `ink-deep` background.
- `.field` — inputs. `ink-deep` background, hairline border, gold focus ring.
- `.gold-rule` — single-pixel gilded divider with horizontal fade.
- `.grain` — subtle film-grain SVG noise over the whole body, opacity 0.025.

## Motion

- Standard transition: 180ms ease-out for color, border, shadow.
- Card lifts: 220ms cubic-bezier(0.22, 1, 0.36, 1).
- `prefers-reduced-motion` collapses transitions to 0.01ms.
- Never animate layout properties.

## Spacing rhythm

- Panel padding: 6 (24px) on top-level, 5 (20px) for compact, 4 (16px) for inline.
- Stacked sections: gap-4 to gap-6.
- Inline controls: gap-1.5 to gap-3.
- Tap targets on touch: minimum 40px, preferably 44px. Compact 32–36px controls are desktop-only; mobile inspector headers and primary actions use 44px targets.

## Notes on the studio surface

- Studio is `h-dvh flex flex-col` — header (sticky), preview (flex-1), timeline dock (shrink-0).
- Below `lg`, settings is an overlay drawer (88% width); at `lg+` it's an inline 360px sidebar.
- Verse timeline dock uses the same `panel` background but lives at the bottom, with `border-t hairline-soft`.
- Recent additions: emerald split markers + emerald segment-preview labels under each region of the active verse card.
- Split compositions make Solid versus Fade explicit. Media can be dragged directly, centered, and zoomed beside the preview; the inspector mirrors the same zoom plus horizontal/vertical offsets, and Center image preserves the chosen zoom.

## Template Studio

- The preview is the task focus; on phones it stays compact enough that the inspector begins within the first viewport rather than forcing a full-screen scroll past controls.
- Text/media mode and Short/Medium/Long specimens share one compact toolbar. Canvas color mode lives in Background instead of appearing twice.
- Inspector sections progressively disclose a complete renderer-backed control set. Golden Line geometry uses plain creator language: thickness, horizontal reach, and corner roundness.
- Saving must have a durable visible state: Save copy becomes Saved, the URL points to the saved record, later edits become Save changes, and Back returns to My templates. Never show success when browser storage failed.

## Recognition and alignment

- Recognition progress uses named stages: **Prepare**, **Listen**, **Match**, and **Align** on import; Studio alignment uses **Prepare**, **Listen**, and **Place cuts**.
- Never hide model download or local processing behind a generic “AI analysing” message. Show determinate download progress when bytes are available, an honest current action, cancellation, and the on-device privacy guarantee.
- Quran range and timing confidence are separate claims. Show the detected range prominently, identify the alignment method, and enumerate only the ayah transitions that need review.
- A creator must explicitly confirm the Quran range before continuing. Manual surah/from/to controls remain editable whether recognition succeeds, is ambiguous, is cancelled, or fails.
- Short or repeated ayahs must be retrieved both as whole-surah ranges and individual-verse candidates. Tied phrases stay low-confidence and are offered for creator review instead of being silently auto-applied.
- Recognition releases require zero false automatic ranges and at least 97% expected-range recall in the maintained real-audio candidate set; boundary alignment remains a separate real-audio gate.
- When text matching is ambiguous, show up to three distinct likely Quran ranges and preserve prepared cuts for the range the creator selects. Never collapse known alternatives into a generic error.
- If spoken audio before or after the recitation contaminates the whole transcript, use strong pause-bounded windows only to recover review candidates. Never promote a window-only match to an automatic range; explain that speech was separated and require the creator to choose by ear.
- A medium whole-clip match must also fall back to review when a stronger pause-bounded window points to a competing range. Rank longer reliable evidence ahead of short perfect fragments so the complete likely passage remains visible in the three-choice UI.
- Alignment is transactional: existing timing edits remain unchanged until a complete result is ready. Cancellation and failure preserve the current timeline.
- Use creator language such as “Align by recitation” and “Rebuild from pauses”; avoid unexplained implementation terms such as “Deep align”.
