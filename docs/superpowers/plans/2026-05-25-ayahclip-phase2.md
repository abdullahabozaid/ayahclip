# AyahClip Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Quranic fonts, segment-based text display synced with audio, multi-language translations, video backgrounds, and curated reciters to AyahClip.

**Architecture:** Five independent features layered onto the existing Next.js + Zustand + Canvas app. Features 1 (fonts), 3 (translations), and 5 (reciters) are data/config changes. Feature 2 (segment playback) is the core new engine. Feature 4 (video backgrounds) adds a new background type with a render loop.

**Tech Stack:** Next.js 16 App Router, Tailwind v4, Zustand v5, Canvas API, Quran.com API v4, KFGQPC font via jsDelivr CDN

---

### Task 1: Quranic Fonts — Replace Arabic Font Options

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/lib/canvas-utils.ts`
- Modify: `src/lib/store.ts`
- Modify: `src/components/StudioSettings.tsx`

- [ ] **Step 1: Update layout.tsx — replace Google Fonts link and add @font-face**

Replace the entire Google Fonts `<link>` in `src/app/layout.tsx` with a slimmer one that only loads the fonts we keep (Noto Naskh Arabic + translation fonts), and add a `<link>` for the KFGQPC Uthmanic font CSS from jsDelivr:

```tsx
<head>
  <link
    href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&family=Cinzel:wght@400;700&family=Lora:wght@400;700&family=Playfair+Display:wght@400;700&display=swap"
    rel="stylesheet"
  />
  <link
    href="https://cdn.jsdelivr.net/npm/kfgqpc-uthmanic-script-hafs-regular@1.0.0/font/index.min.css"
    rel="stylesheet"
  />
</head>
```

If the npm package CSS does not exist at that URL, use a `<style>` tag instead with the @font-face declaration pointing to the WOFF2 file at `https://cdn.jsdelivr.net/npm/kfgqpc-uthmanic-script-hafs-regular@1.0.0/font/UthmanicHafs_v22.woff2`. Check which URL works by testing in the browser.

- [ ] **Step 2: Update ARABIC_FONTS in canvas-utils.ts**

Replace the `ARABIC_FONTS` object and `getArabicFontFamily()` fallback in `src/lib/canvas-utils.ts`:

```typescript
export const ARABIC_FONTS: Record<string, string> = {
  uthmanic: '"KFGQPC HAFS Uthmanic Script", serif',
  "noto-naskh": '"Noto Naskh Arabic", serif',
};

export function getArabicFontFamily(font: string): string {
  return ARABIC_FONTS[font] ?? '"KFGQPC HAFS Uthmanic Script", serif';
}
```

- [ ] **Step 3: Update store default**

In `src/lib/store.ts`, change line 52:
```typescript
arabicFont: "uthmanic",
```

- [ ] **Step 4: Update StudioSettings font dropdown**

In `src/components/StudioSettings.tsx`, replace the `ARABIC_FONT_OPTIONS` array (lines 11-18):

```typescript
const ARABIC_FONT_OPTIONS = [
  { value: "uthmanic", label: "Uthmanic HAFS" },
  { value: "noto-naskh", label: "Noto Naskh Arabic" },
];
```

- [ ] **Step 5: Build and verify**

Run: `npx next build`
Expected: Build succeeds. No references to removed fonts (amiri, reem-kufi, aref-ruqaa, lateef).

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/lib/canvas-utils.ts src/lib/store.ts src/components/StudioSettings.tsx
git commit -m "feat: replace Arabic fonts with Uthmanic HAFS and Noto Naskh only"
```

---

### Task 2: Reciter Curation — Audit and Map to Quran.com API

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/reciters.ts`

This task requires calling the Quran.com API to discover which reciters have segment data. The API endpoint is `GET https://api.quran.com/api/v4/resources/chapter_reciters`. Each reciter in the response has an `id` field. To verify segments exist, test `GET https://api.quran.com/api/v4/chapter_recitations/{id}/1` and check the response for non-empty `segments` arrays in the `verse_timings` entries.

- [ ] **Step 1: Update Reciter type**

In `src/types/index.ts`, add `quranComRecitationId` to the `Reciter` interface:

```typescript
export interface Reciter {
  id: string;
  name: string;
  folder: string;
  quranComRecitationId: number;
}
```

- [ ] **Step 2: Audit reciters against Quran.com API**

Run the following to get the list of available chapter reciters:

```bash
curl -s 'https://api.quran.com/api/v4/resources/chapter_reciters' | python3 -m json.tool | head -100
```

Then for candidate IDs that match our reciters by name, verify segments exist:

```bash
curl -s 'https://api.quran.com/api/v4/chapter_recitations/7/1' | python3 -c "
import json, sys
data = json.load(sys.stdin)
timings = data.get('audio_file', {}).get('verse_timings', [])
has_segments = any(t.get('segments') for t in timings)
print(f'Has segments: {has_segments}')
if timings and timings[0].get('segments'): print(f'First segment: {timings[0][\"segments\"][:3]}')
"
```

Repeat for each reciter ID to verify. Document which IDs have segments.

- [ ] **Step 3: Update reciters.ts with curated list**

Replace the entire contents of `src/lib/reciters.ts` with only the reciters that have verified segment data. Each entry now includes `quranComRecitationId`. Example format (actual list depends on API audit results):

```typescript
import { Reciter } from "@/types";

export const reciters: Reciter[] = [
  { id: "alafasy", name: "Mishary Rashid Alafasy", folder: "Alafasy_128kbps", quranComRecitationId: 7 },
  { id: "husary", name: "Mahmoud Khalil Al-Husary", folder: "Husary_128kbps", quranComRecitationId: 5 },
  // ... only reciters with verified segment data from Step 2
];
```

The `quranComRecitationId` values come from the API audit in step 2. Match by reciter name between our list and the Quran.com API response.

- [ ] **Step 4: Build and verify**

Run: `npx next build`
Expected: Build succeeds. The Reciter type now requires `quranComRecitationId`.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/reciters.ts
git commit -m "feat: curate reciters to those with Quran.com segment data"
```

---

### Task 3: Multi-Language Translations — Types, Data, Store, and API

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/translations.ts`
- Modify: `src/lib/store.ts`
- Modify: `src/components/StudioSettings.tsx`
- Modify: `src/app/surah/[id]/page.tsx`
- Modify: `src/app/studio/page.tsx`

- [ ] **Step 1: Add TranslationLanguage type**

In `src/types/index.ts`, add after the `Reciter` interface:

```typescript
export interface TranslationLanguage {
  id: string;
  name: string;
  nativeName: string;
  resourceId: number;
  direction: "ltr" | "rtl";
}
```

Also update the `Project` settings interface — add `translationLanguage: string;` after `translationFont`:

```typescript
settings: {
  // ... existing fields ...
  translationFont: string;
  translationLanguage: string;
  textColor: string;
  // ... rest ...
};
```

And update the `StudioSettings` interface to add `translationLanguage: string;` after `translationFont`:

```typescript
export interface StudioSettings {
  // ... existing fields ...
  translationFont: string;
  translationLanguage: string;
  textColor: string;
  // ... rest ...
}
```

- [ ] **Step 2: Create translations.ts**

Create `src/lib/translations.ts`:

```typescript
import { TranslationLanguage } from "@/types";

export const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { id: "en", name: "English", nativeName: "English", resourceId: 20, direction: "ltr" },
  { id: "fr", name: "French", nativeName: "Français", resourceId: 31, direction: "ltr" },
  { id: "tr", name: "Turkish", nativeName: "Türkçe", resourceId: 77, direction: "ltr" },
  { id: "ur", name: "Urdu", nativeName: "اردو", resourceId: 54, direction: "rtl" },
  { id: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", resourceId: 33, direction: "ltr" },
  { id: "es", name: "Spanish", nativeName: "Español", resourceId: 28, direction: "ltr" },
];

export function getTranslationLanguage(id: string): TranslationLanguage {
  return TRANSLATION_LANGUAGES.find((l) => l.id === id) ?? TRANSLATION_LANGUAGES[0];
}
```

- [ ] **Step 3: Update store.ts**

In `src/lib/store.ts`, add to the `AppState` interface (after `translationFont: string;`):

```typescript
translationLanguage: string;
```

Add the setter to the interface:

```typescript
setTranslationLanguage: (lang: string) => void;
```

Add the default value (after `translationFont: "serif",`):

```typescript
translationLanguage: "en",
```

Add the setter implementation:

```typescript
setTranslationLanguage: (lang) => set({ translationLanguage: lang }),
```

- [ ] **Step 4: Update StudioSettings.tsx — add language dropdown**

In `src/components/StudioSettings.tsx`, add import at the top:

```typescript
import { TRANSLATION_LANGUAGES } from "@/lib/translations";
```

Rename the "English Translation" label to just "Translation". Below the translation toggle (and before the translation size slider), add a language dropdown when translation is enabled. Inside the existing `{store.translationEnabled && ( <> ... </> )}` block, add as the first child:

```tsx
<div>
  <label className="mb-2 block text-xs text-gray-500">Language</label>
  <select
    value={store.translationLanguage}
    onChange={(e) => store.setTranslationLanguage(e.target.value)}
    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
  >
    {TRANSLATION_LANGUAGES.map((lang) => (
      <option key={lang.id} value={lang.id} className="bg-[#1a1a1a]">
        {lang.name}
      </option>
    ))}
  </select>
</div>
```

- [ ] **Step 5: Update surah/[id]/page.tsx to re-fetch on language change**

In `src/app/surah/[id]/page.tsx`, add imports:

```typescript
import { getTranslationLanguage } from "@/lib/translations";
```

Add a store selector:

```typescript
const translationLanguage = useAppStore((s) => s.translationLanguage);
```

Update the `useEffect` that fetches verses to use the selected language's `resourceId`:

```typescript
useEffect(() => {
  clearSelection();
  const lang = getTranslationLanguage(translationLanguage);
  Promise.all([fetchSurahs(), fetchVerses(surahId, lang.resourceId)]).then(
    ([surahs, fetchedVerses]) => {
      const found = surahs.find((s) => s.id === surahId);
      if (found) {
        setSurah(found);
        setSurahStore(found);
      }
      setVerses(fetchedVerses);
      setVersesStore(fetchedVerses);
      setLoading(false);
    }
  );
}, [surahId, translationLanguage]);
```

- [ ] **Step 6: Update studio/page.tsx to re-fetch verses on language change**

In `src/app/studio/page.tsx`, add imports:

```typescript
import { fetchVerses } from "@/lib/api";
import { getTranslationLanguage } from "@/lib/translations";
```

Add a new `useEffect` to re-fetch verses when language changes:

```typescript
useEffect(() => {
  if (!surah) return;
  const lang = getTranslationLanguage(store.translationLanguage);
  fetchVerses(surah.id, lang.resourceId).then((newVerses) => {
    store.setVerses(newVerses);
  });
}, [store.translationLanguage]);
```

Also add `translationLanguage: state.translationLanguage` to the `saveProject` settings object, and add `store.translationLanguage` to the auto-save useEffect dependency array.

- [ ] **Step 7: Build and verify**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/lib/translations.ts src/lib/store.ts src/components/StudioSettings.tsx src/app/surah/\[id\]/page.tsx src/app/studio/page.tsx
git commit -m "feat: add multi-language translation support (FR, TR, UR, ID, ES)"
```

---

### Task 4: Timing Data API — Fetch Word-Level Segments from Quran.com

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add timing data types and fetch function**

In `src/lib/api.ts`, add these types and function after the existing exports:

```typescript
export interface WordTiming {
  wordPosition: number;
  startMs: number;
  endMs: number;
}

export interface VerseTiming {
  verseKey: string;
  timestampFrom: number;
  timestampTo: number;
  wordTimings: WordTiming[];
}

export async function fetchChapterTimings(
  recitationId: number,
  chapterNumber: number
): Promise<VerseTiming[]> {
  const res = await fetch(
    `${QURAN_API}/chapter_recitations/${recitationId}/${chapterNumber}`
  );
  const data = await res.json();
  const audioFile = data.audio_file;
  if (!audioFile?.verse_timings) return [];

  return audioFile.verse_timings.map((vt: any) => ({
    verseKey: vt.verse_key,
    timestampFrom: vt.timestamp_from,
    timestampTo: vt.timestamp_to,
    wordTimings: (vt.segments || [])
      .filter((s: any[]) => s.length >= 3 && s[1] !== null && s[2] !== null)
      .map((s: any[]) => ({
        wordPosition: s[0],
        startMs: s[1],
        endMs: s[2],
      })),
  }));
}
```

- [ ] **Step 2: Add word-by-word text fetch function**

Also in `src/lib/api.ts`, add a function to fetch word-by-word text for a specific verse:

```typescript
export interface WordData {
  position: number;
  textUthmani: string;
  translation: string | null;
}

export async function fetchWordsByVerse(
  chapterNumber: number,
  verseNumber: number,
  translationResourceId: number = 20
): Promise<WordData[]> {
  const res = await fetch(
    `${QURAN_API}/verses/by_key/${chapterNumber}:${verseNumber}?language=en&words=true&word_fields=text_uthmani&translation_fields=text&translations=${translationResourceId}&per_page=300`
  );
  const data = await res.json();
  const verse = data.verse;
  if (!verse?.words) return [];

  return verse.words
    .filter((w: any) => w.char_type_name === "word")
    .map((w: any) => ({
      position: w.position,
      textUthmani: w.text_uthmani,
      translation: w.translation?.text ?? null,
    }));
}
```

- [ ] **Step 3: Build and verify**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add word-level timing and word-by-word text API functions"
```

---

### Task 5: Playback Engine — Segment Grouping and State Management

**Files:**
- Create: `src/lib/playback-engine.ts`

- [ ] **Step 1: Create the playback engine module**

Create `src/lib/playback-engine.ts`:

```typescript
import { WordTiming, WordData, fetchChapterTimings, fetchWordsByVerse } from "./api";

export interface TextSegment {
  arabicText: string;
  translationText: string;
  startMs: number;
  endMs: number;
}

const MIN_SEGMENT_WORDS = 4;
const MAX_SEGMENT_WORDS = 7;
const GAP_THRESHOLD_MS = 300;

export function groupWordsIntoSegments(
  words: WordData[],
  timings: WordTiming[]
): TextSegment[] {
  if (words.length <= 8) {
    const startMs = timings.length > 0 ? timings[0].startMs : 0;
    const endMs = timings.length > 0 ? timings[timings.length - 1].endMs : 0;
    return [
      {
        arabicText: words.map((w) => w.textUthmani).join(" "),
        translationText: words
          .map((w) => w.translation)
          .filter(Boolean)
          .join(" "),
        startMs,
        endMs,
      },
    ];
  }

  const segments: TextSegment[] = [];
  let currentWords: WordData[] = [];
  let currentTimings: WordTiming[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const timing = timings.find((t) => t.wordPosition === word.position);
    currentWords.push(word);
    if (timing) currentTimings.push(timing);

    const atMaxWords = currentWords.length >= MAX_SEGMENT_WORDS;
    const atMinWords = currentWords.length >= MIN_SEGMENT_WORDS;

    let hasGap = false;
    if (atMinWords && i < words.length - 1) {
      const nextTiming = timings.find(
        (t) => t.wordPosition === words[i + 1].position
      );
      if (timing && nextTiming) {
        hasGap = nextTiming.startMs - timing.endMs > GAP_THRESHOLD_MS;
      }
    }

    const isLastWord = i === words.length - 1;

    if (atMaxWords || hasGap || isLastWord) {
      const startMs =
        currentTimings.length > 0 ? currentTimings[0].startMs : 0;
      const endMs =
        currentTimings.length > 0
          ? currentTimings[currentTimings.length - 1].endMs
          : 0;

      segments.push({
        arabicText: currentWords.map((w) => w.textUthmani).join(" "),
        translationText: currentWords
          .map((w) => w.translation)
          .filter(Boolean)
          .join(" "),
        startMs,
        endMs,
      });

      currentWords = [];
      currentTimings = [];
    }
  }

  return segments;
}

export async function loadVerseSegments(
  recitationId: number,
  chapterNumber: number,
  verseNumber: number,
  translationResourceId: number = 20
): Promise<TextSegment[]> {
  const [timingsAll, words] = await Promise.all([
    fetchChapterTimings(recitationId, chapterNumber),
    fetchWordsByVerse(chapterNumber, verseNumber, translationResourceId),
  ]);

  const verseTiming = timingsAll.find(
    (vt) => vt.verseKey === `${chapterNumber}:${verseNumber}`
  );

  if (
    !verseTiming ||
    verseTiming.wordTimings.length === 0 ||
    words.length === 0
  ) {
    return [];
  }

  return groupWordsIntoSegments(words, verseTiming.wordTimings);
}

export function findCurrentSegmentIndex(
  segments: TextSegment[],
  currentTimeMs: number
): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (currentTimeMs >= segments[i].startMs) {
      return i;
    }
  }
  return 0;
}
```

- [ ] **Step 2: Build and verify**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/playback-engine.ts
git commit -m "feat: add playback engine with word-to-segment grouping"
```

---

### Task 6: Canvas Transition and Video Frame Rendering

**Files:**
- Modify: `src/lib/canvas-utils.ts`

- [ ] **Step 1: Add drawTransition function**

In `src/lib/canvas-utils.ts`, add a new function after the `drawVerseText()` function:

```typescript
export function drawTransition(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  outgoingText: {
    arabic: string;
    translation: string;
    verseNumber: number;
  } | null,
  incomingText: {
    arabic: string;
    translation: string;
    verseNumber: number;
  },
  progress: number,
  options: DrawVerseOptions,
  scale: number = 1
) {
  if (outgoingText && progress < 1) {
    ctx.globalAlpha = 1 - progress;
    drawVerseText(
      ctx,
      w,
      h,
      outgoingText.arabic,
      outgoingText.verseNumber,
      outgoingText.translation || undefined,
      options,
      scale
    );
  }

  ctx.globalAlpha = outgoingText ? progress : 1;
  drawVerseText(
    ctx,
    w,
    h,
    incomingText.arabic,
    incomingText.verseNumber,
    incomingText.translation || undefined,
    options,
    scale
  );

  ctx.globalAlpha = 1;
}
```

- [ ] **Step 2: Add drawVideoFrame function**

Also in `src/lib/canvas-utils.ts`, add a function to draw a video frame as background (same scaling logic as `drawBgImage` but for `<video>` elements):

```typescript
export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  w: number,
  h: number
) {
  const videoScale = Math.max(w / video.videoWidth, h / video.videoHeight);
  const sw = video.videoWidth * videoScale;
  const sh = video.videoHeight * videoScale;
  ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh);
}
```

- [ ] **Step 3: Build and verify**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/canvas-utils.ts
git commit -m "feat: add canvas transition and video frame rendering functions"
```

---

### Task 7: Store — Add Playback Segment State

**Files:**
- Modify: `src/lib/store.ts`

The StudioPreview will write the current playback segment to the store so that FullscreenPreview can read it.

- [ ] **Step 1: Add playback segment fields to store**

In `src/lib/store.ts`, add to the `AppState` interface:

```typescript
playbackSegmentArabic: string | null;
playbackSegmentTranslation: string | null;
setPlaybackSegment: (arabic: string | null, translation: string | null) => void;
```

Add defaults:

```typescript
playbackSegmentArabic: null,
playbackSegmentTranslation: null,
```

Add setter:

```typescript
setPlaybackSegment: (arabic, translation) =>
  set({ playbackSegmentArabic: arabic, playbackSegmentTranslation: translation }),
```

- [ ] **Step 2: Build and verify**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat: add playback segment state to store"
```

---

### Task 8: StudioPreview — Integrate Segment Playback

**Files:**
- Modify: `src/components/StudioPreview.tsx`

This is the most complex task. The StudioPreview needs to:
1. Load segment data when playback starts
2. Track which segment is active based on `audio.currentTime`
3. Display segment text instead of full verse during playback
4. Write active segment to store for FullscreenPreview to read

- [ ] **Step 1: Add imports and segment state**

In `src/components/StudioPreview.tsx`, update imports:

```typescript
import { useRef, useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { preloadVerseAudios } from "@/lib/audio";
import { getTranslationLanguage } from "@/lib/translations";
import {
  TextSegment,
  loadVerseSegments,
  findCurrentSegmentIndex,
} from "@/lib/playback-engine";
import {
  drawBackground,
  drawBgImage,
  drawVerseText,
  drawVideoFrame,
  drawLetterboxBars,
  getLetterboxContentArea,
} from "@/lib/canvas-utils";
```

Add state for segments after the existing state declarations:

```typescript
const [verseSegments, setVerseSegments] = useState<
  Map<number, TextSegment[]>
>(new Map());
const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
const prevSegmentRef = useRef<number>(-1);
const animFrameRef = useRef<number>(0);
```

- [ ] **Step 2: Update handlePlay to load segments and run animation loop**

Replace the existing `handlePlay` function with one that also loads segment data and starts an animation loop during playback. See the full replacement code in the spec. Key changes:

1. After loading audio, fetch segment data for each selected verse using `loadVerseSegments(reciter.quranComRecitationId, ...)`
2. During the per-verse playback loop, start a `requestAnimationFrame` loop that calls `findCurrentSegmentIndex()` based on `audio.currentTime * 1000`
3. When segment index changes, update `activeSegmentIndex` state and call `useAppStore.getState().setPlaybackSegment()`
4. When playback stops, call `useAppStore.getState().setPlaybackSegment(null, null)` and `cancelAnimationFrame(animFrameRef.current)`

```typescript
const handlePlay = async () => {
  if (isPlaying) {
    stoppedRef.current = true;
    currentAudioRef.current?.pause();
    cancelAnimationFrame(animFrameRef.current);
    useAppStore.getState().setPlaybackSegment(null, null);
    setIsPlaying(false);
    return;
  }

  stoppedRef.current = false;
  setIsPlaying(true);
  let map = audioMap;

  if (map.size === 0) {
    setAudioLoading(true);
    map = await preloadVerseAudios(
      reciterFolder,
      store.surah!.id,
      store.selectedVerseNumbers
    );
    setAudioMap(map);
    setAudioLoading(false);
  }

  const reciter = reciters.find((r) => r.id === store.reciterId);
  if (!reciter) {
    setIsPlaying(false);
    return;
  }

  const lang = getTranslationLanguage(
    useAppStore.getState().translationLanguage
  );
  let segMap = verseSegments;
  if (segMap.size === 0) {
    const newMap = new Map<number, TextSegment[]>();
    for (const verse of selectedVerses) {
      const segs = await loadVerseSegments(
        reciter.quranComRecitationId,
        store.surah!.id,
        verse.verse_number,
        lang.resourceId
      );
      if (segs.length > 0) newMap.set(verse.verse_number, segs);
    }
    setVerseSegments(newMap);
    segMap = newMap;
  }

  const startIndex = useAppStore.getState().currentVerseIndex;
  for (let i = startIndex; i < selectedVerses.length; i++) {
    if (stoppedRef.current) break;

    const verse = selectedVerses[i];
    const audio = map.get(verse.verse_number);
    if (!audio) continue;

    useAppStore.getState().setCurrentVerseIndex(i);
    currentAudioRef.current = audio;
    audio.currentTime = 0;
    prevSegmentRef.current = -1;

    const segments = segMap.get(verse.verse_number);

    if (segments && segments.length > 0) {
      setActiveSegmentIndex(0);
      useAppStore
        .getState()
        .setPlaybackSegment(
          segments[0].arabicText,
          segments[0].translationText
        );
    }

    await new Promise<void>((resolve) => {
      audio.onended = () => {
        cancelAnimationFrame(animFrameRef.current);
        resolve();
      };

      audio.play().catch(() => resolve());

      if (segments && segments.length > 1) {
        const animate = () => {
          if (stoppedRef.current) return;
          const timeMs = audio.currentTime * 1000;
          const idx = findCurrentSegmentIndex(segments, timeMs);

          if (idx !== prevSegmentRef.current) {
            prevSegmentRef.current = idx;
            setActiveSegmentIndex(idx);
            useAppStore
              .getState()
              .setPlaybackSegment(
                segments[idx].arabicText,
                segments[idx].translationText
              );
          }

          animFrameRef.current = requestAnimationFrame(animate);
        };
        animFrameRef.current = requestAnimationFrame(animate);
      }
    });
  }

  useAppStore.getState().setPlaybackSegment(null, null);
  stoppedRef.current = false;
  setIsPlaying(false);
  setVerseSegments(new Map());
};
```

- [ ] **Step 3: Update canvas rendering to use segments during playback**

In the `useEffect` that renders to canvas, update the `drawContent` function. Before the `drawVerseText` calls (both letterbox and non-letterbox branches), determine the display text:

```typescript
const segments = verseSegments.get(currentVerse?.verse_number ?? 0);
const useSegments = isPlaying && segments && segments.length > 1;
const displayArabic = useSegments
  ? segments[activeSegmentIndex]?.arabicText ?? currentVerse.text_uthmani
  : currentVerse.text_uthmani;
const displayTranslation = useSegments
  ? segments[activeSegmentIndex]?.translationText ?? currentVerse.translation
  : currentVerse.translation;
```

Then pass `displayArabic` and `displayTranslation` to `drawVerseText()` in place of `currentVerse.text_uthmani` and `currentVerse.translation`.

Add `isPlaying`, `activeSegmentIndex`, `verseSegments` to the useEffect dependency array.

- [ ] **Step 4: Add cleanup**

```typescript
useEffect(() => {
  return () => {
    cancelAnimationFrame(animFrameRef.current);
  };
}, []);
```

- [ ] **Step 5: Build and verify**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/StudioPreview.tsx
git commit -m "feat: integrate segment-based playback in StudioPreview"
```

---

### Task 9: FullscreenPreview — Segment Display Support

**Files:**
- Modify: `src/components/FullscreenPreview.tsx`

- [ ] **Step 1: Update FullscreenPreview to read segment from store**

In `src/components/FullscreenPreview.tsx`, update the `renderFrame` callback. At the start of `renderFrame`, determine display text:

```typescript
const displayArabic =
  store.playbackSegmentArabic ?? currentVerse.text_uthmani;
const displayTranslation =
  store.playbackSegmentTranslation ?? currentVerse.translation;
```

Use `displayArabic` and `displayTranslation` in both the letterbox and non-letterbox `drawVerseText` calls, replacing `currentVerse.text_uthmani` and `currentVerse.translation`.

Update the `useCallback` dependency array to include `store.playbackSegmentArabic` and `store.playbackSegmentTranslation`.

- [ ] **Step 2: Build and verify**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/FullscreenPreview.tsx
git commit -m "feat: display playback segments in FullscreenPreview"
```

---

### Task 10: Video Backgrounds — Types, Presets, and BackgroundPicker UI

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/video-presets.ts`
- Modify: `src/components/BackgroundPicker.tsx`

- [ ] **Step 1: Update BackgroundType**

In `src/types/index.ts`, change the `BackgroundType`:

```typescript
export type BackgroundType = "image" | "gradient" | "solid" | "video";
```

- [ ] **Step 2: Create video presets manifest**

Create `src/lib/video-presets.ts`:

```typescript
export interface VideoPreset {
  id: string;
  name: string;
  category: "nature" | "islamic" | "abstract" | "night";
  videoUrl: string;
  thumbnailUrl: string;
}

export const VIDEO_PRESETS: VideoPreset[] = [
  {
    id: "rain",
    name: "Rain on Window",
    category: "nature",
    videoUrl: "/videos/presets/rain.mp4",
    thumbnailUrl: "/videos/thumbnails/rain.jpg",
  },
  {
    id: "clouds",
    name: "Clouds",
    category: "nature",
    videoUrl: "/videos/presets/clouds.mp4",
    thumbnailUrl: "/videos/thumbnails/clouds.jpg",
  },
  {
    id: "ocean",
    name: "Ocean Waves",
    category: "nature",
    videoUrl: "/videos/presets/ocean.mp4",
    thumbnailUrl: "/videos/thumbnails/ocean.jpg",
  },
  {
    id: "forest",
    name: "Forest Canopy",
    category: "nature",
    videoUrl: "/videos/presets/forest.mp4",
    thumbnailUrl: "/videos/thumbnails/forest.jpg",
  },
  {
    id: "mosque",
    name: "Mosque Interior",
    category: "islamic",
    videoUrl: "/videos/presets/mosque.mp4",
    thumbnailUrl: "/videos/thumbnails/mosque.jpg",
  },
  {
    id: "lanterns",
    name: "Lanterns",
    category: "islamic",
    videoUrl: "/videos/presets/lanterns.mp4",
    thumbnailUrl: "/videos/thumbnails/lanterns.jpg",
  },
  {
    id: "geometric",
    name: "Geometric Patterns",
    category: "islamic",
    videoUrl: "/videos/presets/geometric.mp4",
    thumbnailUrl: "/videos/thumbnails/geometric.jpg",
  },
  {
    id: "bokeh",
    name: "Bokeh Lights",
    category: "abstract",
    videoUrl: "/videos/presets/bokeh.mp4",
    thumbnailUrl: "/videos/thumbnails/bokeh.jpg",
  },
  {
    id: "particles",
    name: "Slow Particles",
    category: "abstract",
    videoUrl: "/videos/presets/particles.mp4",
    thumbnailUrl: "/videos/thumbnails/particles.jpg",
  },
  {
    id: "aurora",
    name: "Aurora",
    category: "abstract",
    videoUrl: "/videos/presets/aurora.mp4",
    thumbnailUrl: "/videos/thumbnails/aurora.jpg",
  },
  {
    id: "starfield",
    name: "Starfield",
    category: "night",
    videoUrl: "/videos/presets/starfield.mp4",
    thumbnailUrl: "/videos/thumbnails/starfield.jpg",
  },
  {
    id: "moonlight",
    name: "Moonlit Sky",
    category: "night",
    videoUrl: "/videos/presets/moonlight.mp4",
    thumbnailUrl: "/videos/thumbnails/moonlight.jpg",
  },
];

export const VIDEO_CATEGORIES = [
  "nature",
  "islamic",
  "abstract",
  "night",
] as const;
```

Note: The actual video files need to be sourced and placed in `/public/videos/presets/` and `/public/videos/thumbnails/`. For initial development, the preset grid will show with placeholder thumbnails until the files are added.

- [ ] **Step 3: Create public directories**

```bash
mkdir -p "public/videos/presets" "public/videos/thumbnails"
```

- [ ] **Step 4: Update BackgroundPicker.tsx — add Video tab**

In `src/components/BackgroundPicker.tsx`:

Add import:

```typescript
import { VIDEO_PRESETS, VIDEO_CATEGORIES } from "@/lib/video-presets";
```

Update the `Tab` type:

```typescript
type Tab = "presets" | "pexels" | "upload" | "video";
```

Update the `tabs` array:

```typescript
const tabs: { id: Tab; label: string }[] = [
  { id: "presets", label: "Presets" },
  { id: "pexels", label: "Stock Photos" },
  { id: "video", label: "Video" },
  { id: "upload", label: "Upload" },
];
```

Add the video tab rendering after the upload tab:

```tsx
{tab === "video" && <VideoSection value={value} onChange={onChange} />}
```

Update the `UploadSection` to also accept video:

In the `UploadSection`, change the `accept` attribute:

```tsx
accept="image/*,video/mp4,video/webm"
```

Update `handleFile` to detect video files:

```typescript
const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith("video/");
  onChange({
    type: isVideo ? "video" : "image",
    value: url,
    label: file.name,
  });
};
```

Update the label text:

```tsx
<span className="text-xs text-gray-400">Click to upload image or video</span>
```

Add the `VideoSection` component in the same file:

```tsx
function VideoSection({
  value,
  onChange,
}: {
  value: Background;
  onChange: (bg: Background) => void;
}) {
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert("Video must be under 50MB");
      return;
    }
    const url = URL.createObjectURL(file);
    onChange({ type: "video", value: url, label: file.name });
  };

  return (
    <div className="space-y-3">
      {VIDEO_CATEGORIES.map((category) => {
        const presets = VIDEO_PRESETS.filter((p) => p.category === category);
        if (presets.length === 0) return null;
        return (
          <div key={category}>
            <p className="mb-2 text-xs capitalize text-gray-400">{category}</p>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() =>
                    onChange({
                      type: "video",
                      value: preset.videoUrl,
                      label: preset.name,
                    })
                  }
                  className={`overflow-hidden rounded-md border-2 transition-all ${
                    value.value === preset.videoUrl
                      ? "border-emerald-500 scale-105"
                      : "border-transparent hover:border-white/30"
                  }`}
                >
                  <div className="aspect-video bg-white/5">
                    <img
                      src={preset.thumbnailUrl}
                      alt={preset.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <p className="truncate px-1 py-0.5 text-[10px] text-gray-400">
                    {preset.name}
                  </p>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/10 p-4 transition-colors hover:border-white/20">
        <span className="text-lg text-gray-500">+</span>
        <span className="text-xs text-gray-400">
          Upload video (MP4/WebM, max 50MB)
        </span>
        <input
          type="file"
          accept="video/mp4,video/webm"
          onChange={handleVideoUpload}
          className="hidden"
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 5: Build and verify**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/video-presets.ts src/components/BackgroundPicker.tsx
git commit -m "feat: add video background tab with preset manifest and upload"
```

---

### Task 11: Video Background Canvas Rendering

**Files:**
- Modify: `src/components/StudioPreview.tsx`
- Modify: `src/components/FullscreenPreview.tsx`

- [ ] **Step 1: Add video background support to StudioPreview**

In `src/components/StudioPreview.tsx`, add a video ref:

```typescript
const videoRef = useRef<HTMLVideoElement | null>(null);
const videoAnimRef = useRef<number>(0);
```

Add a useEffect to manage the video element lifecycle:

```typescript
useEffect(() => {
  if (store.background.type !== "video") {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
      videoRef.current = null;
    }
    cancelAnimationFrame(videoAnimRef.current);
    return;
  }

  const video = document.createElement("video");
  video.src = store.background.value;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  videoRef.current = video;

  video.addEventListener("loadeddata", () => {
    video.play();
  });

  return () => {
    video.pause();
    video.src = "";
    cancelAnimationFrame(videoAnimRef.current);
  };
}, [store.background.type, store.background.value]);
```

Update the canvas rendering useEffect. In the final section where it checks `store.background.type === "image"`, add a video branch:

```typescript
if (store.background.type === "image") {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => drawContent(img);
  img.onerror = () => drawContent();
  img.src = store.background.value;
} else if (store.background.type === "video" && videoRef.current) {
  const video = videoRef.current;
  const renderLoop = () => {
    drawContent(undefined, video);
    videoAnimRef.current = requestAnimationFrame(renderLoop);
  };
  videoAnimRef.current = requestAnimationFrame(renderLoop);
  return () => cancelAnimationFrame(videoAnimRef.current);
} else {
  drawContent();
}
```

Update `drawContent` signature to accept optional video:

```typescript
const drawContent = (bgImage?: HTMLImageElement, bgVideo?: HTMLVideoElement) => {
```

Inside `drawContent`, where `bgImage` is checked, add `bgVideo` handling:

```typescript
if (bgVideo) {
  drawVideoFrame(ctx, bgVideo, /* width */, /* height */);
} else if (bgImage) {
  drawBgImage(ctx, bgImage, /* width */, /* height */);
} else {
  drawBackground(ctx, /* width */, /* height */, store.background);
}
```

Apply this pattern in both the letterbox and non-letterbox branches.

- [ ] **Step 2: Add video background support to FullscreenPreview**

Apply the same pattern to `src/components/FullscreenPreview.tsx`:

1. Add `videoRef` and `videoAnimRef` refs
2. Add useEffect for video element lifecycle
3. Update `renderFrame` to accept optional video parameter
4. Add video branch to the rendering useEffect
5. Use `drawVideoFrame` in `renderFrame` when video is provided

- [ ] **Step 3: Build and verify**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/StudioPreview.tsx src/components/FullscreenPreview.tsx
git commit -m "feat: render video backgrounds on canvas with requestAnimationFrame"
```

---

### Task 12: Export — Video Background Support

**Files:**
- Modify: `src/lib/export.ts`

- [ ] **Step 1: Update export for video backgrounds**

In `src/lib/export.ts`, add import:

```typescript
import { drawVideoFrame } from "./canvas-utils";
```

In `exportVideo()`, after loading `bgImage`, add video loading:

```typescript
let bgVideo: HTMLVideoElement | undefined;
if (options.background.type === "video") {
  bgVideo = document.createElement("video");
  bgVideo.src = options.background.value;
  bgVideo.muted = true;
  bgVideo.loop = true;
  bgVideo.playsInline = true;
  bgVideo.crossOrigin = "anonymous";
  await new Promise<void>((resolve) => {
    bgVideo!.addEventListener("loadeddata", () => {
      bgVideo!.play();
      resolve();
    });
    bgVideo!.addEventListener("error", () => resolve());
  });
}
```

Update `drawFrame` signature to accept optional `bgVideo`:

```typescript
function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  verse: Verse,
  options: ExportOptions,
  scale: number,
  bgImage?: HTMLImageElement,
  bgVideo?: HTMLVideoElement
)
```

Inside `drawFrame`, in both letterbox and non-letterbox branches, add video before image:

```typescript
if (bgVideo) {
  drawVideoFrame(ctx, bgVideo, w, h);
} else if (bgImage) {
  drawBgImage(ctx, bgImage, w, h);
} else {
  drawBackground(ctx, w, h, options.background);
}
```

(Use `content.w, content.h` in the letterbox branch.)

Update the per-verse export loop — when `bgVideo` is set, use a render loop so video frames update:

```typescript
if (bgVideo) {
  await new Promise<void>((resolve) => {
    source.onended = () => {
      cancelAnimationFrame(frameId);
      resolve();
    };
    let frameId: number;
    const renderLoop = () => {
      drawFrame(ctx, size.w, size.h, verse, options, scale, bgImage, bgVideo);
      frameId = requestAnimationFrame(renderLoop);
    };
    frameId = requestAnimationFrame(renderLoop);
  });
} else {
  drawFrame(ctx, size.w, size.h, verse, options, scale, bgImage);
  await new Promise<void>((resolve) => {
    source.onended = () => resolve();
  });
}
```

After the loop, clean up:

```typescript
if (bgVideo) {
  bgVideo.pause();
  bgVideo.src = "";
}
```

- [ ] **Step 2: Build and verify**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/export.ts
git commit -m "feat: support video backgrounds in export with frame render loop"
```

---

### Task 13: Integration Testing — End-to-End Verification

**Files:** No new files — this is a testing task.

- [ ] **Step 1: Start dev server and test Quranic fonts**

Run: `npm run dev`

Open `http://localhost:3000`, navigate to a surah, select verses, open studio. Verify:
- Arabic text renders in Uthmanic HAFS font (should look like the Madinah Mushaf calligraphy)
- Font dropdown only shows "Uthmanic HAFS" and "Noto Naskh Arabic"
- Switching between fonts works and canvas re-renders

- [ ] **Step 2: Test multi-language translations**

In studio settings, change Translation Language to French, Turkish, Urdu, etc. Verify:
- Verse translations update to the selected language
- Urdu text renders correctly
- Translation displays on canvas

- [ ] **Step 3: Test segment playback**

Select a long verse (e.g., Al-Baqarah 2:255 Ayatul Kursi — about 50 words). Press Preview/Play. Verify:
- Text changes during playback (segments cycle through)
- Short verses (e.g., Al-Ikhlas) show full text without segmentation
- Playback stops cleanly when pressing pause
- Full-screen preview also shows segments during playback

- [ ] **Step 4: Test video backgrounds**

In Background section, switch to Video tab. Verify:
- Preset grid displays with categories
- Upload accepts MP4/WebM files
- Canvas shows animated video background when a video is selected
- Overlay opacity applies on top of video

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for Phase 2 features"
```
