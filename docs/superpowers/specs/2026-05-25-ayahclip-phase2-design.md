# AyahClip Phase 2 Design Spec

## Goal

Elevate AyahClip from a static verse overlay tool to a polished, audio-synced recitation video creator with proper Quranic fonts, segment-based text display for long verses, multi-language translations, and video backgrounds.

## Architecture

Phase 2 adds four independent feature areas to the existing Next.js + Zustand + Canvas architecture. Each feature is self-contained and can be built/tested independently. The biggest change is the introduction of a real-time playback engine that syncs audio with text segments on the canvas, replacing the current static text rendering during playback.

## Tech Stack Additions

- KFGQPC Uthmanic Script HAFS font (WOFF2 via jsDelivr CDN)
- Quran.com API v4 `segments=true` for word-level timing data
- Quran.com API v4 translations endpoint for multi-language support
- HTML `<video>` element for video background frame rendering

---

## Feature 1: Quranic Fonts

### What Changes

Replace all current Arabic fonts with proper Uthmanic fonts only:

- **Keep:** KFGQPC Uthmanic Script HAFS (new default), Noto Naskh Arabic (secondary)
- **Remove:** Amiri, Reem Kufi, Aref Ruqaa, Lateef

### Implementation

**Font loading:**
- Add KFGQPC Uthmanic Script HAFS via `@font-face` in `src/app/layout.tsx` using jsDelivr CDN:
  ```
  https://cdn.jsdelivr.net/npm/kfgqpc-uthmanic-script-hafs-regular/font/UthmanicHafs_v22.woff2
  ```
- Keep Noto Naskh Arabic via Google Fonts (already loaded)
- Remove Google Fonts imports for Reem Kufi, Aref Ruqaa, and Lateef

**Font mapping (canvas-utils.ts):**
- Update `ARABIC_FONTS` to only contain two entries:
  - `{ id: "uthmanic", name: "Uthmanic HAFS", family: "KFGQPC HAFS Uthmanic Script" }`
  - `{ id: "noto-naskh", name: "Noto Naskh Arabic", family: '"Noto Naskh Arabic", serif' }`
- Update `getArabicFontFamily()` accordingly

**Store default:**
- Change `arabicFont` default from `"amiri"` to `"uthmanic"` in `src/lib/store.ts`

**Settings UI:**
- Update the Arabic Font dropdown in `StudioSettings.tsx` to show only the two options

**Migration:**
- Projects saved with old font IDs (`amiri`, `reem-kufi`, `aref-ruqaa`, `lateef`) should fall back to `"uthmanic"` when loaded

---

## Feature 2: Segment-Based Text Display

### Problem

Long verses (e.g., Al-Baqarah 2:282 — 128 words) display all text at once, which is unreadable at typical font sizes. The text either overflows the canvas or becomes too small to read.

### Solution

Split verse text into segments of ~5-8 words and cycle through them during audio playback with a fade crossfade transition. When not playing, show the full verse text (current behavior).

### Data Source

Quran.com API v4 provides word-level timing data:

```
GET https://api.quran.com/api/v4/chapter_recitations/{recitation_id}/{chapter_number}
```

Response includes `verse_timings` with `segments` array:
```json
{
  "verse_timings": [
    {
      "verse_key": "2:282",
      "timestamp_from": 0,
      "timestamp_to": 127430,
      "segments": [[1, 0, 630], [2, 630, 1200], ...]
    }
  ]
}
```

Each segment entry is `[word_position, start_ms, end_ms]`.

### Word-to-Segment Grouping Algorithm

1. Fetch word-level timing data for the verse
2. Fetch word-by-word text from Quran.com API: `GET /verses/by_chapter/{id}?words=true&word_fields=text_uthmani`
3. Group words into segments of 4-7 words each
4. Prefer natural break points: look for timing gaps > 300ms between words as segment boundaries
5. Each segment stores: `{ arabicText: string, translationText: string, startMs: number, endMs: number }`
6. For verses with <= 8 words total, use a single segment (no splitting)

### Playback Engine

New module: `src/lib/playback-engine.ts`

```typescript
interface TextSegment {
  arabicText: string;
  translationText: string;
  startMs: number;
  endMs: number;
}

interface PlaybackState {
  currentSegmentIndex: number;
  segments: TextSegment[];
  isTransitioning: boolean;
  transitionProgress: number; // 0-1, used for fade
}
```

During playback:
1. Start audio playback (existing EveryAyah audio)
2. Poll `audio.currentTime` via `requestAnimationFrame`
3. Compare current time against segment boundaries
4. When crossing into a new segment, trigger a 300ms fade crossfade:
   - Draw current segment text with decreasing opacity
   - Draw next segment text with increasing opacity
5. When verse audio ends, advance to next verse (existing behavior)

### Canvas Rendering Changes

- `drawVerseText()` remains unchanged in signature but callers pass segment text instead of full verse text during playback
- New function `drawTransition()` in canvas-utils.ts handles the crossfade between two text strings
- StudioPreview.tsx switches from static rendering to a `requestAnimationFrame` loop during playback
- When not playing, static rendering continues as before

### Translation Segment Alignment

When translation is enabled, the translation text must also be segmented to match Arabic segments. Approach:

1. Fetch word-by-word translation from Quran.com API: `GET /verses/by_chapter/{id}?words=true&word_fields=translation`
2. Each Arabic word maps to a translation word/phrase
3. Group translation words using the same segment boundaries as Arabic

If word-level translation is not available for a language, fall back to showing the full translation text in the last segment.

---

## Feature 3: Multi-Language Translations

### Supported Languages

| Language | Direction | Quran.com resource_id | Translator |
|----------|-----------|----------------------|------------|
| English | LTR | 20 | Sahih International |
| French | LTR | 31 | Muhammad Hamidullah |
| Turkish | LTR | 77 | Diyanet Isleri |
| Urdu | RTL | 54 | Fateh Muhammad Jalandhry |
| Indonesian | LTR | 33 | Ministry of Religious Affairs |
| Spanish | LTR | 28 | Julio Cortes |

### Implementation

**New type:**
```typescript
interface TranslationLanguage {
  id: string;
  name: string;
  resourceId: number;
  direction: "ltr" | "rtl";
}
```

**Constants:** Define `TRANSLATION_LANGUAGES` array in `src/lib/translations.ts`

**Store changes:**
- Add `translationLanguage: string` (default: `"en"`) to Zustand store
- Add `setTranslationLanguage` action

**API changes:**
- `fetchVerses()` already accepts `translationId` parameter — use the `resourceId` from the selected language
- Re-fetch verses when translation language changes

**UI changes:**
- Add "Translation Language" dropdown in StudioSettings Typography section, shown when "English Translation" toggle is on (rename to just "Translation")
- Dropdown shows language names: English, French, Turkish, Urdu, Indonesian, Spanish

**Canvas rendering:**
- Translation text direction is always LTR except for Urdu (RTL)
- Update `drawVerseText()` to accept a `translationDirection` parameter
- For RTL translations, use `ctx.direction = "rtl"` before rendering translation text

**Project persistence:**
- Add `translationLanguage` to the Project settings interface

---

## Feature 4: Video Backgrounds

### Sources

**Preset library:**
- 10-15 curated ambient video loops
- Organized by category: Nature, Islamic, Abstract, Night
- Each clip: 10-20 seconds, looping, 720p, WebM/MP4, 2-5MB
- Host video files in `/public/videos/presets/` for simplicity (no external CDN dependency). Total ~30-50MB which is acceptable for a web app that creates videos.
- Manifest file: `src/lib/video-presets.ts` containing relative paths, thumbnail paths, names, categories
- Thumbnails: static screenshots of each video stored in `/public/videos/thumbnails/` as JPEGs

**User upload:**
- File input accepting `video/mp4, video/webm`
- Store as blob URL (same pattern as image upload)
- Max file size: 50MB (client-side check)

### Background Type Extension

Update the `BackgroundType` union:
```typescript
export type BackgroundType = "image" | "gradient" | "solid" | "video";
```

When `type === "video"`, the `value` field contains the video URL (preset CDN URL or blob URL).

### Canvas Rendering

**New rendering approach for video backgrounds:**

1. Create a hidden `<video>` element: `muted`, `loop`, `playsInline`
2. Set `video.src` to the background video URL
3. When video is loaded, start a `requestAnimationFrame` loop:
   - `ctx.drawImage(videoElement, 0, 0, canvasWidth, canvasHeight)` — draws current video frame
   - Apply overlay opacity
   - Draw verse text on top
4. The render loop runs continuously while a video background is active

**Integration with segment playback:**
- When both video background and segment playback are active, a single `requestAnimationFrame` loop handles both: drawing the video frame and updating text segments based on audio time

**Export:**
- During export, the video background `<video>` element provides frames to the export canvas
- The existing `requestAnimationFrame`-based export loop draws video frame + text for each animation frame
- Video loops automatically if the recitation is longer than the clip

### UI Changes

**BackgroundPicker.tsx:**
- Add a fourth tab: "Video" alongside Presets, Stock Photos, Upload
- Video tab shows: preset video grid (with thumbnail previews) + upload button
- Preset grid organized by category with small labels
- Clicking a preset sets background to `{ type: "video", value: cdnUrl, label: name }`
- Upload creates a blob URL: `{ type: "video", value: blobUrl, label: "Custom Video" }`

**StudioPreview.tsx:**
- When `background.type === "video"`, switch from static canvas rendering to `requestAnimationFrame` loop
- Show a small "play" indicator on the video background so users know it's animated

---

## Feature 5: Reciter Curation

### Approach

Only show reciters that have verified word-level segment data on Quran.com API. This ensures every reciter supports the segment-based text display feature.

### Implementation

1. Add a `quranComRecitationId` field to the `Reciter` type:
   ```typescript
   interface Reciter {
     id: string;
     name: string;
     folder: string;
     quranComRecitationId: number;
   }
   ```

2. Audit all 25 current reciters against the Quran.com API:
   - Fetch `GET https://api.quran.com/api/v4/resources/chapter_reciters` to get available reciters
   - For each, test `GET /chapter_recitations/{id}/1` to verify segments are present
   - Only keep reciters that return segment data

3. Update `src/lib/reciters.ts` with the curated list + `quranComRecitationId` mapping

4. The timing data fetch uses `quranComRecitationId` to call the Quran.com API

---

## State & Data Flow Summary

```
User selects surah + verses → Store
User picks reciter → Store
User starts playback →
  1. Fetch word timing from Quran.com API (using quranComRecitationId)
  2. Fetch word-by-word text from Quran.com API
  3. Group words into segments
  4. Play audio from EveryAyah
  5. requestAnimationFrame loop:
     - Draw video background frame (if video bg)
     - Draw overlay
     - Check audio.currentTime vs segment boundaries
     - Draw current segment text (with fade transition if changing)
```

## Files Changed (Summary)

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `TranslationLanguage`, update `Reciter`, `BackgroundType`, `Project` |
| `src/lib/canvas-utils.ts` | Update font mappings, add `drawTransition()` |
| `src/lib/reciters.ts` | Curate list, add `quranComRecitationId` |
| `src/lib/api.ts` | Add timing data fetch, word-by-word text fetch |
| `src/lib/translations.ts` | New: language definitions |
| `src/lib/playback-engine.ts` | New: segment grouping, playback state management |
| `src/lib/video-presets.ts` | New: preset video manifest |
| `src/lib/store.ts` | Add `translationLanguage`, update font default |
| `src/components/StudioPreview.tsx` | requestAnimationFrame loop, segment rendering |
| `src/components/FullscreenPreview.tsx` | Same playback changes |
| `src/components/StudioSettings.tsx` | Language dropdown, font options, video tab |
| `src/components/BackgroundPicker.tsx` | Video tab with presets + upload |
| `src/lib/export.ts` | Video bg frame rendering, segment text during export |
| `src/app/layout.tsx` | KFGQPC font @font-face, remove old fonts |
