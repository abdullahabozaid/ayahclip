# AyahClip

A browser-based tool that turns Quran recitation into short vertical videos for TikTok, Reels, and YouTube Shorts. Detection, editing, rendering, and export run client-side; the self-hosted resolver imports bounded sections from permitted public links.

## Register

**product** — the design serves the editing workflow, not the marketing.

## Users

Muslims creating recitation clips for social media. Mostly mobile-first (phone uploads, phone exports). Range from devotional casual users to volume producers. Common contexts: late-night editing after Maghrib, between classes on phones, weekends batching content.

Two modes:
- **Reciter mode**: pick verses + an online reciter (EveryAyah / Quran.com). Fast path.
- **Imported mode**: upload your own recitation or import a bounded permitted link. Quran recognition starts automatically for imported links and local clips of at least ten seconds, and can identify a source that begins or ends midway through an ayah; only the recited words are carried into the editable captions. Shorter files retain the one-tap manual recognition action rather than loading the full model for weak evidence.
- **Bulk Create**: import up to 30 minutes and immediately begin a checkpointed analysis. Creators can balance complete ayahs around 30/45/60/90 seconds, require exactly one to four ayahs per clip, or keep each uninterrupted passage together (including all seven ayahs of Al-Fatihah). Partial edge ayahs and incomplete exact-count remainders are withheld instead of being presented as upload-ready drafts.

## Brand and tone

**Midnight Mihrab** — reverent dark luxury. Ink-navy base, gilded brass-gold accent, deep emerald secondary, warm parchment text. Classical roman display (Marcellus), modern body (Outfit), and verified Quran Arabic modes for Mushaf QCF, Uthmanic Hafs, Amiri Quran, true-weight Scheherazade New, and true-weight Noto Naskh Arabic.

Tone: quiet, sacred, precise. No hype, no growth-hacking, no startup playfulness. Closer to a luthier's workshop than a SaaS dashboard.

## Strategic principles

1. **Quran text integrity is sacred.** Mis-rendered Arabic (waqf marks wrapping, dropped diacritics, fallback fonts) is a fatal bug. Any rendering change must verify Hafs marks survive.
2. **Editing is a focused activity**, not a dashboard. The studio is full-bleed; chrome stays out of the way.
3. **Show, don't make-them-play.** Where a feature can be verified visually before playback (segment labels, fit modes, intro effects), prefer that.
4. **Touch is a first-class input**, not an afterthought. Drag handles, buttons, and tap targets must work with thumbs.
5. **Reversible by default.** Every destructive action (delete verse, remove split, trim) is undoable via the same UI affordance.

## Anti-references

- CapCut's busy multi-toolbar look (function lives, polish doesn't)
- Generic AI/ML dashboards (dark + neon + glassmorphism)
- Religious tools that look like 2010 forum software (clip-art gold, calligraphy backgrounds)
- The mainstream "white background + emerald accent + Inter everywhere" Muslim-tech aesthetic

## Current production surfaces

`src/components/TimelineEditor.tsx` is the imported-audio CapCut-style timeline; `src/app/surah/[id]/page.tsx` is the verse picker; and `src/components/bulk/BulkCreateWorkspace.tsx` is the volume workflow. Bulk runs live as persistent square collection tiles. Opening one shows a focused clip-by-clip review with source-frame previews, Quran references and text, approval controls, per-clip render state, and individual or batch delivery. Studio preserves the originating collection and supplies previous/next clip navigation.

When acoustic word onsets are available from alignment, Bulk Create may split an unusually long ayah into synchronized caption pages while preserving one continuous ayah audio interval. Arabic fit is authoritative: the creator chooses a two, three, or four-line ceiling and English follows the same time split. AyahClip does not invent word timing when the alignment model has not supplied it.

Permitted YouTube sections default to a fast 480p/30fps mobile draft path; HD up to 720p is an explicit choice. Only the selected range is resolved. Bulk creators also choose whether to retain the source video or use the selected preset background before analysis begins.

Sources, analysis checkpoints, candidates, decisions, presets, tasks, completed files, and multiple collections survive refresh in browser storage. The reciter picker starts with a researched twelve-voice popular set; search and the full long-tail catalog remain one deliberate tap away.

Template Studio is an editor, not a preset showcase. Every exposed value must reach both the preview and export renderer. Saving a built-in look creates one device-local custom template, rewrites the editor URL to that saved record, and all later saves update the same record. My templates is a first-class destination, storage failures are explicit, and unsaved navigation is protected. Golden Line includes independent color, opacity, thickness, horizontal reach, and corner-roundness controls; the inspector also covers all reusable typography, glow, layout, media-frame, playback, letterbox, B-roll transition, and entrance settings supported by the template model.
