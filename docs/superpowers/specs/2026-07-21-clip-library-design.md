# Clip Library — design spec

Date: 2026-07-21. Status: approved direction, pending spec review.

## Goal

Turn `/styles` into a **Clip Library**: a browsable gallery of ready-made,
full-recitation example clips in different styles. Each clip:

- shows a **live preview** of its real opening verse (the existing `drawScene`
  canvas preview, not a static image),
- can be **Downloaded** — rendered to a real MP4 in the browser on demand,
- can be **Customized** — opened in the studio with everything preloaded
  (verses, reciter, style, B-roll), where the creator can change the reciter,
  the verses, the B-roll, and every other option, then export.

This is what the owner described: "full example clips they can download with
full recitations in different styles — basically a clip library," with the
ability to "change the reciter, have B-roll, have all the options."

## Why this is a small step, not a rebuild

Template previews are already live canvas renders via `drawScene`
(`TemplatePreview.tsx`), the same renderer as export. The gaps are exactly:

1. templates carry style only — **no verse selection**,
2. reciter is a clip-level field — **not carried by a template**,
3. templates carry the B-roll *shape* — **not actual media**.

The design adds a thin "clip" layer on top of the existing, unchanged template
model to fill those three gaps.

## Data model

A **library clip** is a new type that COMPOSES the existing style model rather
than modifying it (keeps `StyleSettings`/`TemplateDefinition` clean, avoids
conflict with the in-progress templates work):

```ts
// src/lib/library-clips.ts
export interface LibraryClipBroll {
  source: "preset" | "stock";   // shareable media only — never user blobs
  id: string;                   // resolves via backgrounds.ts / stock-library.ts
}

export interface LibraryClip {
  id: string;
  title: string;                // plain copy, e.g. "Ar-Rahman 13-16"
  description: string;          // plain copy
  featured?: boolean;
  tags?: string[];              // e.g. ["golden", "nature", "alafasy"]
  // WHAT is recited:
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  // WHO recites it:
  reciterId: string;            // an existing reciters.ts id
  // HOW it looks — reuse the existing template look:
  styleTemplateId: string;      // an existing TemplateDefinition id (style + extras)
  // Optional concrete B-roll (overrides the template's shape with real media):
  broll?: LibraryClipBroll[];
}
```

Notes:
- Reusing `styleTemplateId` means every existing template look is available and
  the library clip does not duplicate `StyleSettings`.
- `broll` uses preset/stock references because user-uploaded blobs
  (IndexedDB, `broll-library.ts`) cannot ship inside a shareable built-in.
- No new persistence: verses, `reciterId`, and `backgroundScenes` already
  persist in `Project.settings`. The clip is a curated built-in catalog only.

## The curated catalog (built-in)

~12 flagship `LibraryClip`s in `src/lib/library-clips.ts` spanning
style × famous passage × reciter, e.g.:

- Ar-Rahman 13-16 · Golden Highlight · Alafasy · nature B-roll
- Al-Mulk 1-2 · Clean Caption · Sudais · calm background
- Al-Fatihah 1-7 · Elegant Serif · Husary · minimal
- Ayat al-Kursi (2:255) · Bold Naskh · Minshawi · mosque B-roll
- … (mix of short/long passages, several reciters, each existing style)

All B-roll uses shareable preset/stock media. Passages chosen for broad appeal
and correct, verifiable text.

## UI — `/styles` becomes the Clip Library

- Page header + copy updated (plain language, per the copy rule).
- Grid of clip cards (reuse the existing card + gallery layout). Each card:
  - live `drawScene` preview of the clip's opening verse (pass the real verse
    as the `sample`, which the gallery does not currently do — a small change
    to `TemplateCard`/`TemplatePreview` to accept a real verse),
  - title + reciter + passage label,
  - **Download** button → on-demand render,
  - **Customize** button → load into studio.
- Filter chips by tag/style/reciter (reuse existing family-tab pattern).
- Existing "create your own template" / My templates entry points remain.

## Download flow (on-demand render)

Reuse the export path with zero new render code:

1. Resolve the `LibraryClip` → fetch its verses (`fetchVerses`), resolve the
   reciter, apply the style template's settings + extras, resolve B-roll refs
   to `Background`s / `backgroundScenes`.
2. Build the same options object `clip-export.ts` builds and call
   `exportVideoWithInfo` (the existing fast WebCodecs path).
3. Save the resulting file (existing download affordance).

A lightweight progress state on the card during render (spinner + %), mirroring
the bulk render card pattern.

## Customize flow (load into studio)

Extend the apply path so a whole clip can be hydrated, then navigate to
`/studio`:

1. Set the Quran selection: `surah` + `selectedVerseNumbers` = ayahStart..End.
2. Set the reciter: `setReciterId(clip.reciterId)` (skip if the user is somehow
   in imported mode — library clips are always reciter mode).
3. Apply the style: `applyTemplate(styleTemplate, { replaceMedia: true })`.
4. Resolve `broll` → `backgroundScenes` + enable the sequence.
5. `router.push("/studio")`.

In the studio the creator then has the reciter picker, B-roll editor, verse
editor, and every style option already wired — nothing new needed there.

## Wiring changes (small, guarded)

- `apply-template.ts` — OPTIONAL: add a guarded `reciterId` application to
  `TemplateExtras` so style templates can *also* carry a default reciter. Not
  strictly required for library clips (the Customize flow sets the reciter
  directly), but cheap and useful. Guarded so plain templates are unaffected.
- New `src/lib/library-clips.ts` — the catalog + a `hydrateLibraryClip` helper
  (resolves verses/reciter/style/broll into a render-ready options object and
  into store state for Customize).
- `TemplateCard` / `TemplatePreview` — accept a real sample verse so cards show
  the clip's actual opening ayah.
- `/styles` page — render `LibraryClip`s with Download + Customize.

## Invariants respected

- **Preview == export**: previews and downloads both go through `drawScene` /
  the existing export path. No second render path.
- **Quran text integrity**: passages use verified corpus text via `fetchVerses`;
  the QCF slice fail-safe (just fixed) applies.
- **Plain copy**: all new UI copy is plain and basic (no flowery words).
- **24px baseline**: library clips reuse existing templates, which already
  satisfy the preset font-size invariant.
- **No user blobs in built-ins**: B-roll is preset/stock only.

## Testing

- Unit: `hydrateLibraryClip` maps a `LibraryClip` → correct verse range,
  reciter, style settings, and resolved B-roll (pure logic).
- Unit: catalog integrity — every `LibraryClip` references a real reciter id, a
  real style template id, valid surah/ayah range, and resolvable B-roll ids.
- The download path reuses covered export code; add a smoke test that
  `hydrateLibraryClip` produces a valid `ExportOptions`-shaped object.
- Manual: Download one clip end-to-end (real MP4) and Customize one clip
  (studio preloaded, swap reciter, re-export).

## Out of scope (for now)

- Pre-rendered/hosted MP4 files (chose on-demand render).
- User-created library clips / sharing (catalog is curated built-ins first).
- Carrying user-uploaded B-roll inside shareable clips.
- The broader overhaul items (security cap, perf, god-component splits) — a
  separate track; the critical QCF integrity bug is already fixed.

## Decisions already made

- Template becomes a downloadable **example clip** (a "clip library").
- Delivery: **on-demand render** (recipe → render now), not hosted files.
- Location: **evolve `/styles`** into the Clip Library.
- Sequence: **QCF integrity fix first (done)**, then this.
