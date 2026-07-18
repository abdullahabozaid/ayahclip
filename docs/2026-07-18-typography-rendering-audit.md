# Typography and caption-rendering audit

Date: 2026-07-18

## Decision

AyahClip should keep a small, purposeful font system. Quran faces are selected by rendering need, while translation faces are selected by reading role. The editor must never manufacture a heavy Quran face or silently record a fallback font into the final MP4.

## Quran Arabic roles

| Mode | Allowed weight | Product role |
| --- | --- | --- |
| Mushaf QCF | 400 | Page-faithful glyph rendering and authentic ayah marks |
| QPC Hafs Unicode | 400 | Source-matched Hafs Unicode with complete marks |
| Amiri Quran | 400 | Open literary Naskh for restrained cinematic captions |
| Scheherazade New | 400, 500, 600, 700 | Traditional Naskh when a genuinely heavier face is required |
| Noto Naskh Arabic | 400 through 700 | Compact bold social captions and dense marks |

The shipped weight contract matches the upstream font metadata. Amiri Quran publishes a Regular 400 face. Scheherazade New publishes distinct 400, 500, 600 and 700 files. Noto Naskh Arabic exposes a variable 400 to 700 weight axis.

Sources:

- [Amiri Quran metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/amiriquran/METADATA.pb)
- [Scheherazade New metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/scheherazadenew/METADATA.pb)
- [Noto Naskh Arabic metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/notonaskharabic/METADATA.pb)

Fixed-weight Quran modes use a separate ink-thickness stroke. The stroke strengthens the actual glyph without asking the browser to synthesize a font weight. A crisp dark outline and a white or dark glow are painted independently so diacritics remain open.

## Translation roles

| Face | Recommended role | Typical weight |
| --- | --- | --- |
| Outfit | Compact social captions, split-panel layouts, translation-led compositions | 500 or 600; 700 only for translation-led emphasis |
| Lora | Reflective literary translation over nature or calm B-roll | 500 |
| Playfair Display | Short editorial lines and title-like treatments | 500 or 600 |
| Georgia | Reliable system-serif fallback | 400 or 700 |
| Arial | Reliable compact system-sans fallback | 400 or 700 |
| Times New Roman | Traditional system-serif alternative | 400 or 700 |
| Cinzel | Very short display treatments, never long translation paragraphs | 500 or 600 |

Outfit is a 100 to 900 variable family, Lora exposes 400 to 700, and Playfair Display exposes 400 to 900. Playfair is classified as a display face, which is why AyahClip limits its recommendation to short text.

Sources:

- [Outfit metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/METADATA.pb)
- [Lora metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/lora/METADATA.pb)
- [Playfair Display metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/METADATA.pb)
- [Cinzel metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/METADATA.pb)

## Glow and edge treatments

- **Clean:** dark lift, 5px style blur, 2px downward offset.
- **Soft glow:** warm parchment glow, 5px style blur, no offset.
- **Crisp edge:** 1.5px dark outline plus restrained dark lift.
- **White glow shortcut:** white, 12px style blur, no offset. This is deliberately broader than Soft glow for creators matching the referenced TikTok treatment.
- **Gold line:** warm active-line marker, narrow outline, dark lift.

Glow is never used to replace a proper outline on moving footage. The outline is drawn in a shadow-free pass, followed by the Quran ink and fill. This prevents the glow from doubling around the outline or closing small Quran marks.

## Type scale

The main Studio exposes three compact social-video presets:

- Compact: Arabic 26, translation 12.
- Balanced: Arabic 30, translation 14.
- Statement: Arabic 36, translation 16.

The values are style-space units that scale to the selected export frame, not CSS body-copy sizes. Long passages use the same export measurement path to recommend a smaller reversible fit rather than clipping or changing the font behind the creator's back.

## Verified invariants

- All five Arabic modes preserve Quran marks and use only supported weights.
- Strict export fails when the selected Quran font is missing.
- Strict export now also fails when a selected self-hosted translation face is missing.
- Intentional system translation fallbacks remain allowed.
- Outfit is selectable in both the main Studio and template editor.
- Lora plus the white-glow shortcut survives preview and exact MP4 rendering.
- Al-Baqarah 2:282 wraps into a valid vertical MP4.
- Urdu translation remains right-to-left in preview and export.
- Missing translation data never paints `undefined` or `null`.

Evidence:

- `src/lib/__tests__/arabic-font-render.test.ts`
- `src/lib/__tests__/typography-options.test.ts`
- `src/lib/__tests__/text-integrity.test.ts`
- `e2e/market-readiness.spec.ts`
- `e2e/text-edge-export.spec.ts`
