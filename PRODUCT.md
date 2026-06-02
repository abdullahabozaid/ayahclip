# AyahClip

A browser-based tool that turns Quran recitation into short vertical videos for TikTok, Reels, and YouTube Shorts. Everything runs client-side: detection, editing, rendering, export.

## Register

**product** — the design serves the editing workflow, not the marketing.

## Users

Muslims creating recitation clips for social media. Mostly mobile-first (phone uploads, phone exports). Range from devotional casual users to volume producers. Common contexts: late-night editing after Maghrib, between classes on phones, weekends batching content.

Two modes:
- **Reciter mode**: pick verses + an online reciter (EveryAyah / Quran.com). Fast path.
- **Imported mode**: upload your own recitation, the tool auto-detects verses + timings on the timeline. Power path — needs the editing surface that this polish touches.

## Brand and tone

**Midnight Mihrab** — reverent dark luxury. Ink-navy base, gilded brass-gold accent, deep emerald secondary, warm parchment text. Classical roman display (Marcellus), modern body (Outfit), Quran Arabic in Amiri Quran (full Hafs marks preserved).

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

## Surface in focus for this pass

`src/components/TimelineEditor.tsx` (the imported-audio CapCut-style timeline) and `src/app/surah/[id]/page.tsx` (the verse picker). The recent additions (intra-verse split markers, Arabic segment preview labels) need to feel native, not bolted-on.
