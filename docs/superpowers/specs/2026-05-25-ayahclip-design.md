# AyahClip — Design Spec

## Overview
AyahClip is a browser-based Quran recitation clipping tool for social media. Users select verses, pick a reciter, customize visuals (backgrounds, fonts, subtitles), and export short-form videos for TikTok, Instagram Reels, and YouTube Shorts — all client-side.

## Architecture

### Tech Stack
- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS
- **State:** Zustand
- **Video:** HTML Canvas + MediaRecorder API
- **Audio:** Web Audio API
- **APIs:** Quran.com API v4 (text + translations), EveryAyah (audio per ayah)

### Routes
| Route | Purpose |
|-------|---------|
| `/` | Home — hero, search, popular recitations, all 114 surahs grid |
| `/surah/[id]` | Verse browser — Arabic + translation, verse selection, "Open Studio" |
| `/studio` | Editor — live preview canvas, settings panel, export |

### State (Zustand)
- `selectedSurah`: surah metadata
- `selectedVerses`: array of verse numbers
- `reciter`: selected reciter ID
- `videoFormat`: '16:9' | '9:16' | '1:1' | '4:5'
- `arabicFontSize`: number (px)
- `translationEnabled`: boolean
- `translationLanguage`: string (default 'en')
- `translationFontSize`: number (px)
- `translationFont`: string
- `textColor`: hex string
- `overlayOpacity`: number (0-100)
- `background`: { type: 'image' | 'video' | 'gradient' | 'solid', value: string }

## Pages

### Home (`/`)
- Dark theme, Islamic aesthetic
- Logo + "AyahClip" branding (placeholder)
- Search bar (filters surahs by name, number, or translation)
- Popular recitations carousel (curated presets)
- 3-column grid of all 114 surahs showing: number, Arabic name, English name, verse count, revelation type (Meccan/Medinan)

### Surah Page (`/surah/[id]`)
- Header: surah name (Arabic + English), verse count, revelation type
- Back button to home
- "Select All" toggle
- Each verse card: checkbox, verse number, Arabic text (Uthmani script), English translation
- Floating bottom bar appears when verses selected: "[N] verses selected — Open Studio"

### Studio (`/studio`)
Split layout — preview on left, settings on right.

**Preview Panel:**
- Live canvas showing current verse with selected styling
- Background + dark overlay + Arabic text + translation subtitle
- Navigation: prev/next verse, verse counter (e.g. "3 / 7")
- Play/preview button (plays audio with verse progression)

**Settings Panel:**
- Reciter dropdown (populated from EveryAyah reciter list)
- Video format selector: 16:9, 9:16, 1:1, 4:5
- Arabic text size slider (24-120px)
- Translation toggle + language selector (English, French, Spanish, Turkish, Urdu, Indonesian, etc.)
- Translation text size slider (16-64px)
- Translation font selector (serif/sans options)
- Text color picker
- Dark overlay opacity slider (0-100%)
- Background picker: preset images, video thumbnails, solid colors, gradient presets
- "Export Video" button

## Data Sources

### Quran Text & Translations
- **API:** api.quran.com/api/v4
- Endpoints: `/chapters` (surah list), `/verses/by_chapter/{id}` (verses with text)
- Translations: English (Sahih International), French, Spanish, Turkish, Urdu, Indonesian, etc.
- Arabic script: Uthmani (`text_uthmani` field)

### Audio
- **API:** EveryAyah.com
- Pattern: `https://everyayah.com/data/{reciter_folder}/{surah_padded}{ayah_padded}.mp3`
- Reciters: Mishary Rashid Alafasy, Abdul Rahman Al-Sudais, Maher Al-Muaiqly, Yasser Al-Dossari, Saad Al-Ghamdi, and more

## Video Export (Client-Side)
1. For each selected verse:
   - Draw background on canvas (image/video frame/gradient)
   - Apply dark overlay at configured opacity
   - Render Arabic text (centered, configured font size)
   - Render translation text below (if enabled)
2. Use MediaRecorder API to capture canvas stream + audio
3. Sync verse transitions to audio duration per ayah
4. Output as WebM (or MP4 via browser codec if available)
5. Trigger download

## Accessibility
- Full keyboard navigation
- ARIA labels on all interactive elements
- Screen reader support for verse text
- High contrast mode support
- Focus indicators
- Responsive: works on desktop, tablet (mobile app later)

## MVP Scope (Phase 1)
1. Home page with all 114 surahs + search
2. Surah page with verse selection
3. Studio with live preview
4. Reciter selection (5-10 popular reciters)
5. English translation (Sahih International)
6. 4 video formats
7. 5-10 preset background images
8. Solid color and gradient backgrounds
9. Font size controls, text color, overlay opacity
10. Client-side video export

## Future Phases
- Phase 2: Multi-language translations, more fonts, video backgrounds, word-level subtitle highlighting
- Phase 3: Advanced editor (drag-and-drop positioning), template presets, sharing
- Phase 4: Mobile app (React Native), user accounts, saved projects
