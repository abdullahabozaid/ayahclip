# AyahClip

A browser-based tool that turns Quran recitation into short vertical videos for TikTok, Reels, and YouTube Shorts. Detection, editing, rendering, and export run client-side; the self-hosted resolver imports bounded sections from permitted public links.

## Register

**product** — the design serves the editing workflow, not the marketing.

## Users

Muslims creating recitation clips for social media. Mostly mobile-first (phone uploads, phone exports). Range from devotional casual users to volume producers. Common contexts: late-night editing after Maghrib, between classes on phones, weekends batching content.

Two modes:
- **Reciter mode**: pick verses + an online reciter (EveryAyah / Quran.com). Fast path.
- **Imported mode**: upload your own recitation, the tool auto-detects verses + timings on the timeline. Power path — needs the editing surface that this polish touches.
- **Bulk Create**: import up to 30 minutes, request 15/20/30/40 drafts, checkpoint recognition window by window, review only verse-complete candidates, apply one built-in or saved preset, and render approved clips through a recoverable sequential queue.

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

`src/components/TimelineEditor.tsx` is the imported-audio CapCut-style timeline; `src/app/surah/[id]/page.tsx` is the verse picker; and `src/components/bulk/BulkCreateWorkspace.tsx` is the volume workflow. Bulk results use source-frame previews, Quran references and text, approval controls, per-clip render state, and individual or batch delivery. Sources, analysis checkpoints, candidates, decisions, presets, tasks, and completed files survive refresh in browser storage.
