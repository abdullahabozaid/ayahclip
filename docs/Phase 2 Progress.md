# AyahClip Phase 2 — Progress Report

## Status: Core Features Complete

All 5 planned features are implemented and tested. Several bugs were found and fixed during integration testing.

---

## What's Done

### 1. Quranic Fonts
- Replaced all Arabic fonts with **KFGQPC Uthmanic Script HAFS** (default) and **Noto Naskh Arabic** (fallback)
- Removed: Amiri, Reem Kufi, Aref Ruqaa, Lateef
- Font loaded via `@font-face` from jsDelivr CDN (`.otf` format)
- Files: `layout.tsx`, `canvas-utils.ts`, `store.ts`, `StudioSettings.tsx`

### 2. Segment-Based Text Display
- Long verses (e.g., Ayat Al-Kursi — 50 words) now display 4-7 words at a time during audio playback
- Word-level timing data fetched from `api.qurancdn.com` (QDC API with `segments=true`)
- Timestamps normalized from chapter-absolute to verse-relative for per-verse audio
- `requestAnimationFrame` loop tracks `audio.currentTime` against segment boundaries
- Works in both StudioPreview and FullscreenPreview
- Files: `api.ts`, `playback-engine.ts`, `store.ts`, `StudioPreview.tsx`, `FullscreenPreview.tsx`

### 3. Multi-Language Translations
- 6 languages: English, French, Turkish, Urdu, Indonesian, Spanish
- Language dropdown in Typography settings (only shown when Translation toggle is on)
- Verses re-fetched from Quran.com API when language changes
- Files: `translations.ts`, `types/index.ts`, `store.ts`, `StudioSettings.tsx`, `surah/[id]/page.tsx`, `studio/page.tsx`

### 4. Video Backgrounds
- 8 video presets from Pexels CDN (Nature, Islamic, Abstract categories)
- 21 curated stock photos from Pexels CDN (Nature, Islamic, Night, Abstract)
- Video rendered on canvas via hidden `<video>` element + `requestAnimationFrame`
- Works in StudioPreview, FullscreenPreview, and Export
- Custom video upload (MP4/WebM, max 50MB)
- Files: `video-presets.ts`, `stock-library.ts`, `StockLibrary.tsx`, `BackgroundPicker.tsx`, `canvas-utils.ts`, `export.ts`

### 5. Reciter Curation
- Reduced from 25 to 11 reciters, all verified to have word-level segment data on Quran.com
- Each reciter mapped with `quranComRecitationId` for timing API calls
- Files: `reciters.ts`, `types/index.ts`

---

## Bugs Found and Fixed During Testing

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Segments never loaded during playback | Wrong API endpoint (`api.quran.com` doesn't return `verse_timings`) | Switched to `api.qurancdn.com/api/qdc/audio/reciters/{id}/audio_files?chapter={n}&segments=true` |
| Segment timestamps didn't match audio | Quran.com timestamps are chapter-absolute; EveryAyah audio is per-verse (starts at 0) | Normalize by subtracting `timestamp_from` from each word timing |
| Letterbox mode shrunk text to ~9px | `letterboxScale = content.h / ratio.h` = ~0.32 in 9:16 | Removed scaling — text renders at configured size, clip region prevents overflow |
| Stock photos showed nothing | Pexels API key was placeholder `your_pexels_api_key_here` | Replaced with curated stock library using direct Pexels CDN URLs (no API key needed) |
| Video presets were 404s | Referenced local `/videos/presets/` files that didn't exist | Updated to real Pexels video CDN URLs |

---

## Default Settings Changes

| Setting | Before | After |
|---------|--------|-------|
| Arabic Font Size | 48px | 30px |
| Translation Font Size | 18px | 14px |
| Translation Font | Georgia (Serif) | Arial (Sans) |

---

## What's Remaining

### Must Fix
- [ ] Video thumbnail URLs for presets — some show blank (Pexels video thumbnail pattern differs from photo pattern)
- [ ] `surah/[id]/page.tsx` line 62 still references Amiri font for Arabic surah name header
- [ ] Old project migration — projects saved with `amiri` font ID should fall back to `uthmanic`

### Should Add
- [ ] RTL support for Urdu translations (`ctx.direction = "rtl"`)
- [ ] Crossfade transition between segments (function exists in `canvas-utils.ts` as `drawTransition()` but not wired up)
- [ ] Segment-based text in Export (currently exports full verse text, not segments)

### Nice to Have
- [ ] More video presets (more Islamic, abstract, night themes)
- [ ] Pexels video search (requires API key)
- [ ] Word-level subtitle highlighting (Phase 2 spec mentioned this)
- [ ] Progress indicator during segment/timing data loading

---

## Architecture Notes

### API Endpoints Used
- **Quran.com v4** (`api.quran.com/api/v4`): Surahs, verses, translations, word-by-word text
- **QDC Audio** (`api.qurancdn.com/api/qdc`): Chapter recitation timing data with word-level segments
- **EveryAyah** (`everyayah.com/data`): Individual verse audio files (MP3)
- **Pexels CDN** (`images.pexels.com`, `videos.pexels.com`): Stock photos and video backgrounds

### Key Data Flow for Segment Playback
```
User clicks Play →
  1. Preload verse audio from EveryAyah
  2. Fetch chapter timing data from QDC API (one call per chapter)
  3. Fetch word-by-word text from Quran.com API (per verse)
  4. Group words into 4-7 word segments based on timing gaps
  5. Start audio playback
  6. requestAnimationFrame loop: compare audio.currentTime to segment boundaries
  7. Update displayed text when segment changes
  8. Write current segment to Zustand store for FullscreenPreview to read
```

### Git Commits (Phase 2)
```
23a5ea6 fix: defaults, letterbox, stock library, and video presets
afdddc8 fix: use correct QDC API for timing data and normalize timestamps
013ccf1 feat: support video backgrounds in export with frame render loop
c5d6dcb feat: render video backgrounds on canvas with requestAnimationFrame
d6184e7 feat: add video background tab with preset manifest and upload
9d8cf8f feat: display playback segments in FullscreenPreview
05e62c0 feat: integrate segment-based playback in StudioPreview
fa4b865 feat: add canvas transition and video frame rendering functions
70e31ad feat: add playback segment state to store
e65c929 feat: add playback engine with word-to-segment grouping
9fb70b1 feat: add word-level timing and word-by-word text API functions
9bd5538 feat: add multi-language translation support (FR, TR, UR, ID, ES)
de93627 feat: curate reciters to those with Quran.com segment data
34ca282 feat: replace Arabic fonts with Uthmanic HAFS and Noto Naskh only
```
