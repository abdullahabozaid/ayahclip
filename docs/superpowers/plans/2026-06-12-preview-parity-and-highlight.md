# Preview/Export Parity + Arabic Line Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the studio preview pixel-identical to the exported video by routing all three render paths through one shared scene renderer at export resolution, then add a continuous animated highlight bar behind each Arabic line.

**Architecture:** New `src/lib/render-core.ts` owns `FORMAT_SIZES`, a `SceneStyleSource` interface (field names chosen so both the Zustand store state and `ExportOptions` satisfy it structurally), QCF word slicing, and `drawScene()` — the single function that paints a complete frame (letterbox, background, overlay, verse text). `export.ts`, `StudioPreview.tsx`, and `FullscreenPreview.tsx` all call `drawScene`. StudioPreview's canvas becomes the actual export resolution (e.g. 1080×1920), CSS-downscaled — every preview pixel is an export pixel. The highlight is drawn inside `drawVerseText`'s `paintText` so all paths and the intro animation get it for free.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before writing any Next-specific code), TypeScript, Canvas 2D, Zustand. No test framework exists in this repo — each task ends with a typecheck (`npx tsc --noEmit`) and a concrete manual verification in the running dev server (http://localhost:3000).

**Spec:** `docs/superpowers/specs/2026-06-12-preview-parity-and-highlight-design.md`

**Hard rules (from project memory):**
- Quran text integrity is sacred: do NOT touch `toWrapUnits`, `measureLines`, `sanitizeArabic`, wrapping, or shaping logic.
- Verse number must keep showing on ALL split parts logic (`isLastPart` handling) exactly as-is.
- All paths must pass identical options to `drawVerseText` — that is the point of this plan; never special-case one path.

---

### Task 1: Create `src/lib/render-core.ts` (shared scene renderer)

**Files:**
- Create: `src/lib/render-core.ts`

- [ ] **Step 1: Write the file**

```typescript
import {
  Background,
  TextShadow,
  LetterboxConfig,
  QcfWord,
  Verse,
  VideoFormat,
} from "@/types";
import {
  drawBackground,
  drawBgImage,
  drawVideoFrame,
  drawVerseText,
  drawLetterboxBars,
  getLetterboxContentArea,
  rgbaFromHex,
  safeInsetFor,
  splitWords,
  SafeAreaTarget,
  MediaFit,
  FitBackdrop,
  VerseIntro,
  EmphasisStyle,
  DrawVerseOptions,
} from "./canvas-utils";

/** Output resolution per format. The ONLY size any render path may draw at. */
export const FORMAT_SIZES: Record<VideoFormat, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

/**
 * Every style/setting a frame needs. Field names deliberately match BOTH the
 * Zustand store state and ExportOptions, so either can be passed directly.
 * If you add a visual setting, add it here — there is no other channel.
 */
export interface SceneStyleSource {
  videoFormat: VideoFormat;
  arabicFont: string;
  arabicFontSize: number;
  arabicFontWeight: number;
  arabicVerseNumber: boolean;
  translationVerseNumber: boolean;
  translationEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  translationFontWeight: number;
  translationDirection?: "ltr" | "rtl";
  textColor: string;
  textShadow: TextShadow;
  lineHeight: number;
  translationLineHeight: number;
  arabicTranslationGap: number;
  textPosition: number;
  overlayOpacity: number;
  overlayColor: string;
  safeAreaTarget: SafeAreaTarget;
  safePadding: number;
  background: Background;
  backgroundFit?: MediaFit;
  fitBackdrop?: FitBackdrop;
  letterbox: LetterboxConfig;
  verseIntro?: VerseIntro;
  emphasisStyle: EmphasisStyle;
  emphasisColor: string;
  // Arabic line highlight (Task 7+). Optional so Task 1 compiles before Task 6.
  highlightEnabled?: boolean;
  highlightColor?: string;
  highlightOpacity?: number;
  highlightRadius?: number;
  highlightPadding?: number;
}

/** Per-frame content: what text is on screen right now and its animation state. */
export interface SceneContent {
  arabicText: string;
  verseNumber: number;
  translation?: string;
  isLastPart: boolean;
  qcfWords?: QcfWord[];
  arabicEmphasis?: number[];
  translationEmphasis?: number[];
  /** Live word-highlight playback overrides the stored emphasis style/color. */
  emphasisStyleOverride?: EmphasisStyle;
  emphasisColorOverride?: string;
  introProgress: number;
}

export interface SceneMedia {
  image?: HTMLImageElement;
  video?: HTMLVideoElement;
}

/**
 * Map a verse's full QCF glyph list to the currently displayed subset when a
 * partial verse (split part / mid-playback segment) is on screen. Extracted
 * verbatim from the three previous copies in StudioPreview/FullscreenPreview/export.
 */
export function sliceQcfForDisplay(
  verse: Pick<Verse, "text_uthmani" | "qcfWords">,
  displayArabic: string,
  isLastPart: boolean
): QcfWord[] | undefined {
  const fullQcf = verse.qcfWords;
  if (!fullQcf || displayArabic === verse.text_uthmani) return fullQcf;
  const allWords = splitWords(verse.text_uthmani);
  const partWords = splitWords(displayArabic);
  const justWords = fullQcf.filter((w) => w.char_type_name === "word");
  let offset = 0;
  for (let i = 0; i <= allWords.length - partWords.length; i++) {
    if (allWords.slice(i, i + partWords.length).every((w, j) => w === partWords[j])) {
      offset = i;
      break;
    }
  }
  const sliced = justWords.slice(offset, offset + partWords.length);
  if (isLastPart) {
    const endGlyph = fullQcf.find((w) => w.char_type_name === "end");
    return endGlyph ? [...sliced, endGlyph] : sliced;
  }
  return sliced;
}

/**
 * Paint one complete video frame at export resolution. The ONLY place a frame
 * is composed — preview parity with export is structural, not coincidental.
 * The ctx's canvas MUST be FORMAT_SIZES[style.videoFormat] (asserted by callers).
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  style: SceneStyleSource,
  content: SceneContent,
  media: SceneMedia = {}
) {
  const size = FORMAT_SIZES[style.videoFormat];
  const w = size.w;
  const h = size.h;
  const scale = w / 480;

  const textOpts: DrawVerseOptions = {
    arabicFont: style.arabicFont,
    arabicFontSize: style.arabicFontSize,
    translationEnabled: style.translationEnabled,
    translationFontSize: style.translationFontSize,
    translationFont: style.translationFont,
    translationDirection: style.translationDirection,
    textColor: style.textColor,
    textShadow: style.textShadow,
    lineHeight: style.lineHeight,
    translationLineHeight: style.translationLineHeight,
    arabicTranslationGap: style.arabicTranslationGap,
    verticalPosition: style.textPosition,
    safeInset: safeInsetFor(style.safeAreaTarget, style.safePadding / 100),
    arabicFontWeight: style.arabicFontWeight,
    arabicVerseNumber: style.arabicVerseNumber && content.isLastPart,
    translationVerseNumber: style.translationVerseNumber,
    translationFontWeight: style.translationFontWeight,
    arabicEmphasis: content.arabicEmphasis,
    translationEmphasis: content.translationEmphasis,
    emphasisStyle: content.emphasisStyleOverride ?? style.emphasisStyle,
    emphasisColor: content.emphasisColorOverride ?? style.emphasisColor,
    introStyle: style.verseIntro,
    introProgress: content.introProgress,
    qcfWords: content.qcfWords,
    highlightEnabled: style.highlightEnabled,
    highlightColor: style.highlightColor,
    highlightOpacity: style.highlightOpacity,
    highlightRadius: style.highlightRadius,
    highlightPadding: style.highlightPadding,
  };

  const paintRegion = (rw: number, rh: number) => {
    if (media.video) drawVideoFrame(ctx, media.video, rw, rh, style.backgroundFit, style.fitBackdrop);
    else if (media.image) drawBgImage(ctx, media.image, rw, rh, style.backgroundFit, style.fitBackdrop);
    else drawBackground(ctx, rw, rh, style.background);
    ctx.fillStyle = rgbaFromHex(style.overlayColor, style.overlayOpacity / 100);
    ctx.fillRect(0, 0, rw, rh);
    drawVerseText(
      ctx, rw, rh,
      content.arabicText, content.verseNumber, content.translation,
      textOpts, scale
    );
  };

  const useLetterbox = style.letterbox.enabled && style.videoFormat === "9:16";
  if (useLetterbox) {
    drawLetterboxBars(ctx, w, h, style.letterbox);
    const c = getLetterboxContentArea(w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(c.x, c.y, c.w, c.h);
    ctx.clip();
    ctx.translate(0, c.y);
    paintRegion(c.w, c.h);
    ctx.restore();
  } else {
    paintRegion(w, h);
  }
}
```

Note: `DrawVerseOptions` does not have the `highlight*` fields yet — they arrive in Task 6. To keep Task 1 compiling on its own, **omit the five `highlight*` lines from `textOpts` in this task** and add them back in Task 8. Same for the `highlight*` fields in `SceneStyleSource` — they are harmless to include now (they're optional and unused), so include them now.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (warnings about unused exports are fine).

- [ ] **Step 3: Commit**

```bash
git add src/lib/render-core.ts
git commit -m "feat(render): shared drawScene frame renderer at export resolution"
```

---

### Task 2: Route export through `drawScene`

**Files:**
- Modify: `src/lib/export.ts`

- [ ] **Step 1: Replace `drawFrame` body and local duplicates**

1. Delete the local `FORMAT_SIZES` constant in `export.ts` (lines 27–32) and replace its import usage: add `import { FORMAT_SIZES, drawScene, sliceQcfForDisplay, SceneContent } from "./render-core";`
2. From the `canvas-utils` import block in export.ts, remove now-unused names: `drawBackground, drawBgImage, drawVideoFrame, drawVerseText, drawLetterboxBars, getLetterboxContentArea, rgbaFromHex, safeInsetFor, splitWords` (keep `ensureFontsReady`, `SafeAreaTarget`).
3. Replace the entire `drawFrame` function (currently `export.ts:662-816`) with:

```typescript
function drawFrame(
  ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  verse: Verse,
  options: ExportOptions,
  _scale: number,
  bgImage?: HTMLImageElement,
  bgVideo?: HTMLVideoElement,
  introProgress = 1,
  displayArabic?: string,
  displayTranslation?: string | null,
  isLastPart = true
) {
  const showingFullVerse =
    displayArabic == null || displayArabic === verse.text_uthmani;
  const ve = showingFullVerse ? options.emphasis[verse.verse_key] : undefined;
  const arText = displayArabic ?? verse.text_uthmani;
  const trText =
    displayTranslation === undefined ? verse.translation : displayTranslation ?? undefined;

  const content: SceneContent = {
    arabicText: arText,
    verseNumber: verse.verse_number,
    translation: trText ?? undefined,
    isLastPart,
    qcfWords: sliceQcfForDisplay(verse, arText, isLastPart),
    arabicEmphasis: ve?.arabic,
    translationEmphasis: ve?.translation,
    introProgress,
  };
  drawScene(ctx, options, content, { image: bgImage, video: bgVideo });
}
```

(`ExportOptions` already satisfies `SceneStyleSource` structurally — same field names. Keep `drawFrame`'s signature so the ~6 call sites in the two export paths don't change. The `_w/_h/_scale` params are now derived inside `drawScene`; keep them as ignored params.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If `ExportOptions` is missing any `SceneStyleSource` field, TypeScript will say which — `videoFormat`, `emphasisStyle`, `emphasisColor`, `verseIntro` all exist already; fix any mismatch by adjusting the import/usage, NOT by loosening types.

- [ ] **Step 3: Manual verification**

In the dev server: pick a surah/verses, click Export, download the video. Open it — text layout, gap, letterbox, intro animation all look as before (export already rendered at this resolution; this is a pure refactor, output must be unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/lib/export.ts
git commit -m "refactor(export): drawFrame delegates to shared drawScene"
```

---

### Task 3: Rewrite StudioPreview rendering at export resolution

**Files:**
- Modify: `src/components/StudioPreview.tsx`

- [ ] **Step 1: Replace the drawing internals**

1. Delete the local `FORMAT_RATIOS` constant (lines 32–37). Import instead:

```typescript
import { FORMAT_SIZES, drawScene, sliceQcfForDisplay, SceneContent } from "@/lib/render-core";
```

2. From the `canvas-utils` import keep only: `ensureFontsReady, splitWords` (delete `drawBackground, drawBgImage, drawVideoFrame, drawVerseText, drawLetterboxBars, getLetterboxContentArea, rgbaFromHex, safeInsetFor`).
3. Replace `const ratio = FORMAT_RATIOS[store.videoFormat];` (line 63) with `const size = FORMAT_SIZES[store.videoFormat];`
4. Replace the whole body of `drawRef.current = () => { ... }` (lines 314–483) with:

```typescript
  drawRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = useAppStore.getState();
    const sz = FORMAT_SIZES[s.videoFormat];
    // The preview canvas IS the export frame: same resolution, same renderer.
    if (canvas.width !== sz.w) canvas.width = sz.w;
    if (canvas.height !== sz.h) canvas.height = sz.h;

    const verses = s.verses.filter((v) => s.selectedVerseNumbers.includes(v.verse_number));
    const cv = verses[s.currentVerseIndex] ?? verses[0];
    if (!cv) return;

    const segments = verseSegmentsRef.current.get(cv.verse_number ?? 0);
    const playing = isPlayingRef.current;
    const useSegments = !!(playing && segments && segments.length > 1);
    const segIdx = activeSegmentIndexRef.current;
    let displayArabic: string;
    let displayTranslation: string | undefined;
    let isLastPart = true;
    if (s.audioSource.mode === "imported") {
      const seg = s.audioSource.timings[s.currentVerseIndex];
      const t = importedPlayer.currentTime();
      displayArabic = seg ? verseTextAt(seg, cv.text_uthmani, t) : cv.text_uthmani;
      displayTranslation =
        seg && cv.translation ? verseTextAt(seg, cv.translation, t) : cv.translation;
      if (seg?.splits?.length) {
        let partIdx = 0;
        for (const sp of seg.splits) { if (t >= sp) partIdx++; else break; }
        isLastPart = partIdx === seg.splits.length;
      }
    } else if (playing && useSegments) {
      displayArabic = segments![segIdx]?.arabicText ?? cv.text_uthmani;
      displayTranslation = segments![segIdx]?.translationText ?? cv.translation;
      isLastPart = segIdx === segments!.length - 1;
    } else {
      const boundaries = s.verseParts[cv.verse_number] ?? [];
      if (boundaries.length > 0) {
        const words = splitWords(cv.text_uthmani);
        const sorted = [...boundaries].sort((a, b) => a - b);
        const cuts = [0, ...sorted.map((b) => Math.min(b, words.length)), words.length];
        const pi = Math.min(s.activePartIndex, cuts.length - 2);
        const lo = cuts[pi];
        const hi = cuts[pi + 1];
        displayArabic = words.slice(lo, hi).join(" ");
        if (cv.translation) {
          const tWords = cv.translation.split(/\s+/).filter(Boolean);
          const tLo = Math.floor((lo / words.length) * tWords.length);
          const tHi = Math.floor((hi / words.length) * tWords.length);
          displayTranslation = tWords.slice(tLo, tHi).join(" ");
        } else {
          displayTranslation = cv.translation;
        }
        isLastPart = pi === cuts.length - 2;
      } else {
        displayArabic = cv.text_uthmani;
        displayTranslation = cv.translation;
      }
    }

    const verseEmphasis = s.emphasis[cv.verse_key];
    const manualArabicEmphasis = useSegments ? undefined : verseEmphasis?.arabic;
    const translationEmphasis = useSegments ? undefined : verseEmphasis?.translation;
    const wordHi =
      s.audioSource.mode === "imported" && playing && s.wordHighlight && s.activeWordIndex != null
        ? s.activeWordIndex
        : null;
    const introProgress =
      s.verseIntro === "none"
        ? 1
        : Math.min(1, (performance.now() - verseShownAtRef.current) / s.verseIntroMs);

    const content: SceneContent = {
      arabicText: displayArabic,
      verseNumber: cv.verse_number,
      translation: displayTranslation ?? undefined,
      isLastPart,
      qcfWords: sliceQcfForDisplay(cv, displayArabic, isLastPart),
      arabicEmphasis: wordHi != null ? [wordHi] : manualArabicEmphasis,
      translationEmphasis,
      emphasisStyleOverride: wordHi != null ? "color" : undefined,
      emphasisColorOverride: wordHi != null ? s.emphasisColor || "#c9a24b" : undefined,
      introProgress,
    };

    drawScene(
      ctx,
      {
        ...s,
        translationDirection: getTranslationLanguage(s.translationLanguage)
          .direction as "ltr" | "rtl",
      },
      content,
      {
        image: s.background.type === "image" ? bgImageElRef.current ?? undefined : undefined,
        video: s.background.type === "video" ? videoRef.current ?? undefined : undefined,
      }
    );
  };
```

5. In the JSX (line 592 & 599), replace `ratio` references: `displayWidth` becomes `framed ? 348 : 360` and `aspect={\`${size.w} / ${size.h}\`}`. The `<canvas className="h-full w-full" />` stays — CSS downscales the full-res canvas.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: PASS. Remove any now-unused imports it flags.

- [ ] **Step 3: Manual verification**

Dev server studio page: preview shows the verse; changing font size / gap / position updates live; play works; intro animation plays; letterbox mode works; video background plays. Crucially: line breaks in the preview now match the fullscreen preview exactly (both are 1080-wide renders).

- [ ] **Step 4: Commit**

```bash
git add src/components/StudioPreview.tsx
git commit -m "feat(preview): StudioPreview renders the exact export frame via drawScene"
```

---

### Task 4: Route FullscreenPreview through `drawScene`

**Files:**
- Modify: `src/components/FullscreenPreview.tsx`

- [ ] **Step 1: Replace its renderFrame internals**

1. Delete the local `FORMAT_SIZES` (lines 22–27); import `FORMAT_SIZES, drawScene, sliceQcfForDisplay, SceneContent` from `@/lib/render-core`. Trim the `canvas-utils` import to `ensureFontsReady, splitWords`.
2. Replace the body of the `renderFrame` useCallback (lines 161–330): keep the canvas sizing (`canvas.width = size.w; canvas.height = size.h;`) and the display-text/part computation (lines 171–210) exactly as they are, then delete everything from the QCF-slicing block (lines 212–232) through the end of the letterbox/non-letterbox drawing (line 327) and replace with:

```typescript
      const segPlaying = store.playbackSegmentArabic != null;
      const verseEmphasis = segPlaying
        ? undefined
        : store.emphasis[currentVerse.verse_key];
      const wordHi =
        store.audioSource.mode === "imported" &&
        store.wordHighlight &&
        store.activeWordIndex != null
          ? store.activeWordIndex
          : null;
      const introProgress =
        store.verseIntro === "none"
          ? 1
          : Math.min(
              1,
              (performance.now() - verseShownAtRef.current) / store.verseIntroMs,
            );

      const content: SceneContent = {
        arabicText: displayArabic,
        verseNumber: currentVerse.verse_number,
        translation: displayTranslation ?? undefined,
        isLastPart,
        qcfWords: sliceQcfForDisplay(currentVerse, displayArabic, isLastPart),
        arabicEmphasis: wordHi != null ? [wordHi] : verseEmphasis?.arabic,
        translationEmphasis: verseEmphasis?.translation,
        emphasisStyleOverride: wordHi != null ? "color" : undefined,
        emphasisColorOverride:
          wordHi != null ? store.emphasisColor || "#c9a24b" : undefined,
        introProgress,
      };

      drawScene(
        ctx,
        {
          ...store,
          translationDirection: getTranslationLanguage(store.translationLanguage)
            .direction as "ltr" | "rtl",
        },
        content,
        { image: bgImage, video: bgVideo }
      );
```

3. The `const scale = size.w / 480;` (line 83) becomes unused — delete it and its usage in the useCallback dep array.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — PASS, remove unused imports.

- [ ] **Step 3: Manual verification**

Open fullscreen preview: identical image to the studio preview (same renderer, same resolution). Device frames, TikTok/Reels chrome, safe zones still work.

- [ ] **Step 4: Commit**

```bash
git add src/components/FullscreenPreview.tsx
git commit -m "refactor(fullscreen): render via shared drawScene"
```

---

### Task 5: Parity verification pass

- [ ] **Step 1: Verify with Playwright/manually**

With the dev server running, for a multi-line verse with translation enabled:
1. Screenshot the studio preview canvas.
2. Export the video; extract its first frame (`ffmpeg -i export.mp4 -frames:v 1 frame.png` or just scrub in QuickTime).
3. Compare: line breaks identical, Arabic→translation gap identical, vertical position identical. The only acceptable difference is codec compression.
4. Repeat with letterbox on, and with a 4:5 format.

- [ ] **Step 2: Performance sanity**

Play a verse with a video background in the studio preview on the dev machine; confirm no visible jank. (1080×1920 canvas at 30–60fps is fine on modern hardware; if it ever isn't, the spec's fallback is a `measureScale` split — do NOT implement preemptively.)

- [ ] **Step 3: Update memory + commit any fixes**

Update the user-memory file `feedback_preview_export_parity.md` to record the new invariant: "all paths render via drawScene in src/lib/render-core.ts at FORMAT_SIZES resolution; never add a second frame-composition path."

---

### Task 6: Highlight settings — types, store, style persistence

**Files:**
- Modify: `src/lib/style.ts`
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Add to `StyleSettings` (`src/lib/style.ts`)**

After `textShadow: TextShadow;` add:

```typescript
  /** Continuous rounded bar behind each Arabic line. */
  highlightEnabled?: boolean;
  highlightColor?: string;
  highlightOpacity?: number; // 0..1
  highlightRadius?: number;  // 0..1 of half-height; 1 = full pill
  highlightPadding?: number; // multiplier of arabicFontSize
```

Add the five keys to `STYLE_KEYS` (after `"textShadow"`). Add `"highlightEnabled"`, `"highlightRadius"`, `"highlightPadding"` to `PRESET_KEYS` (presets exclude colors, so NOT color/opacity).

- [ ] **Step 2: Add to the store (`src/lib/store.ts`)**

Follow the existing pattern around `emphasisColor` (state ~line 56, default ~line 171, setter ~line 272). Add state fields + defaults + setters:

```typescript
  // state interface
  highlightEnabled: boolean;
  highlightColor: string;
  highlightOpacity: number;
  highlightRadius: number;
  highlightPadding: number;
  setHighlightEnabled: (v: boolean) => void;
  setHighlightColor: (v: string) => void;
  setHighlightOpacity: (v: number) => void;
  setHighlightRadius: (v: number) => void;
  setHighlightPadding: (v: number) => void;

  // defaults
  highlightEnabled: false,
  highlightColor: "#1f2a44",
  highlightOpacity: 1,
  highlightRadius: 1,
  highlightPadding: 0.25,

  // setters
  setHighlightEnabled: (v) => set({ highlightEnabled: v }),
  setHighlightColor: (v) => set({ highlightColor: v }),
  setHighlightOpacity: (v) => set({ highlightOpacity: v }),
  setHighlightRadius: (v) => set({ highlightRadius: v }),
  setHighlightPadding: (v) => set({ highlightPadding: v }),
```

(Default color `#1f2a44` = ink navy, on-brand; user picks their own. Check how `applyStyle` applies `StyleSettings` — since the fields are in `STYLE_KEYS`, saved styles pick them up automatically.)

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` — PASS.

```bash
git add src/lib/style.ts src/lib/store.ts
git commit -m "feat(style): highlight bar settings in store and saved styles"
```

---

### Task 7: Highlight rendering in `drawVerseText`

**Files:**
- Modify: `src/lib/canvas-utils.ts`

- [ ] **Step 1: Add options to `DrawVerseOptions`** (after `qcfWords`):

```typescript
  /** Continuous rounded bar behind each Arabic line. */
  highlightEnabled?: boolean;
  highlightColor?: string;
  highlightOpacity?: number;
  highlightRadius?: number;
  highlightPadding?: number;
```

- [ ] **Step 2: Add a QCF line-width helper** (below `measureQcfLines`):

```typescript
function qcfLineWidths(
  ctx: CanvasRenderingContext2D,
  words: QcfWord[],
  fontSize: number,
  maxWidth: number
): number[] {
  const gap = fontSize * 0.15;
  return wrapQcfWords(ctx, words, fontSize, maxWidth).map((line) => {
    const ws = line.map((u) => measureQcfWord(ctx, u.word, fontSize));
    return ws.reduce((a, b) => a + b, 0) + gap * (line.length - 1);
  });
}
```

- [ ] **Step 3: Draw the bars inside `paintText`**

In `drawVerseText`, inside the `paintText` closure, add a highlight pass at the very top — BEFORE `applyShadow` is called (the bar must not carry the text shadow), and the existing first lines of `paintText` move below it. New `paintText` opening:

```typescript
  const paintText = (tctx: CanvasRenderingContext2D) => {
    tctx.textAlign = "center";
    tctx.textBaseline = "middle";

    // Continuous highlight bar behind each Arabic line. Drawn first (no shadow),
    // purely behind the glyphs — text layout/shaping is untouched. Reveals
    // right-to-left with the verse intro.
    if (options.highlightEnabled) {
      const introPNow = options.introProgress ?? 1;
      const hasIntro = (options.introStyle ?? "none") !== "none";
      const reveal = hasIntro ? 1 - Math.pow(1 - Math.min(1, introPNow), 3) : 1;
      tctx.save();
      clearShadow(tctx);
      tctx.font = `${arabicWeight} ${arabicSize}px ${arabicFamily}`;
      let lineWidths: number[];
      if (useQcf) {
        lineWidths = qcfLineWidths(tctx, qcfRenderWords, arabicSize, maxWidth);
      } else {
        tctx.direction = "rtl";
        lineWidths = measureLines(tctx, arabicDisplay, maxWidth).map(
          (l) => tctx.measureText(l).width
        );
        tctx.direction = "ltr";
      }
      const pad = arabicSize * (options.highlightPadding ?? 0.25);
      const boxH = arabicSize * 1.25 + pad;
      const radius = (boxH / 2) * Math.min(1, Math.max(0, options.highlightRadius ?? 1));
      tctx.fillStyle = rgbaFromHex(
        options.highlightColor ?? "#1f2a44",
        options.highlightOpacity ?? 1
      );
      lineWidths.forEach((lw, i) => {
        const fullW = lw + pad * 2;
        const revealedW = fullW * reveal;
        if (revealedW < 1) return;
        const yC = startY + i * arabicLineH; // textBaseline is middle
        const x = centerX + fullW / 2 - revealedW; // anchored right, grows leftward
        tctx.beginPath();
        if (typeof tctx.roundRect === "function") {
          tctx.roundRect(x, yC - boxH / 2, revealedW, boxH, radius);
        } else {
          tctx.rect(x, yC - boxH / 2, revealedW, boxH);
        }
        tctx.fill();
      });
      tctx.restore();
    }

    applyShadow(tctx, options.textShadow, scale);
    // ... existing body continues unchanged (fillStyle, font, direction, draw blocks)
```

Two correctness notes for the implementer:
- The line measurement here re-runs the SAME wrapping (`measureLines` / `wrapQcfWords`) used for layout with the same font + maxWidth, so bar widths exactly match the drawn lines. Do not invent a different measurement.
- One animation subtlety: when `introStyle !== "none"` and `introP < 1`, `paintText` runs every frame into the offscreen layer, so the reveal clip animates while the offscreen composite applies the fade — bar and text fade in together, and the bar additionally sweeps right→left. When intro is `none`, `reveal` is 1 and the bar is just there. `drawTransition`'s cross-fade also works unchanged since it composites whole frames.

- [ ] **Step 4: Typecheck**

`npx tsc --noEmit` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-utils.ts
git commit -m "feat(render): continuous highlight bar behind Arabic lines with RTL reveal"
```

---

### Task 8: Plumb highlight through all consumers

**Files:**
- Modify: `src/lib/render-core.ts`
- Modify: `src/lib/export.ts`
- Modify: `src/components/ExportButton.tsx`

- [ ] **Step 1: render-core** — add the five `highlight*` lines to `textOpts` in `drawScene` (shown in Task 1 code; they were deferred to here). StudioPreview/FullscreenPreview pass the whole store object, so they need no change.

- [ ] **Step 2: export.ts** — add to `ExportOptions`:

```typescript
  highlightEnabled?: boolean;
  highlightColor?: string;
  highlightOpacity?: number;
  highlightRadius?: number;
  highlightPadding?: number;
```

- [ ] **Step 3: ExportButton.tsx** — in the `exportVideo({...})` call (around line 52–80), add:

```typescript
        highlightEnabled: store.highlightEnabled,
        highlightColor: store.highlightColor,
        highlightOpacity: store.highlightOpacity,
        highlightRadius: store.highlightRadius,
        highlightPadding: store.highlightPadding,
```

- [ ] **Step 4: Typecheck + commit**

`npx tsc --noEmit` — PASS.

```bash
git add src/lib/render-core.ts src/lib/export.ts src/components/ExportButton.tsx
git commit -m "feat(export): highlight settings flow to export path"
```

---

### Task 9: Highlight controls in StudioSettings

**Files:**
- Modify: `src/components/StudioSettings.tsx`

- [ ] **Step 1: Add a "Highlight" control group**

Place it right after the text-shadow/emphasis area (near the `Arabic–Translation Gap` slider section at line ~456, in the typography/style section). Reuse the local `Toggle` and `Slider` components and the existing color-input styling used for `textColor`/`overlayColor` (match it exactly — check how those render a `<input type="color">` in this file and copy that markup):

```tsx
          {/* Highlight bar behind Arabic lines */}
          <Toggle
            checked={store.highlightEnabled}
            onChange={() => store.setHighlightEnabled(!store.highlightEnabled)}
            label="Highlight behind Arabic"
          />
          {store.highlightEnabled && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-xs text-[var(--muted)]">Highlight color</label>
                <input
                  type="color"
                  value={store.highlightColor}
                  onChange={(e) => store.setHighlightColor(e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border border-[var(--hairline)] bg-transparent"
                />
              </div>
              <Slider
                label="Highlight opacity"
                value={store.highlightOpacity}
                min={0.1}
                max={1}
                step={0.05}
                display={(v) => `${Math.round(v * 100)}%`}
                onChange={store.setHighlightOpacity}
              />
              <Slider
                label="Roundness"
                value={store.highlightRadius}
                min={0}
                max={1}
                step={0.05}
                display={(v) => `${Math.round(v * 100)}%`}
                onChange={store.setHighlightRadius}
              />
              <Slider
                label="Padding"
                value={store.highlightPadding}
                min={0}
                max={0.8}
                step={0.05}
                display={(v) => `${Math.round(v * 100)}%`}
                onChange={store.setHighlightPadding}
              />
            </>
          )}
```

Also add `store.highlightEnabled, store.highlightColor, store.highlightOpacity, store.highlightRadius, store.highlightPadding` to StudioPreview's redraw-effect dependency array (`StudioPreview.tsx`, the long array at lines ~548–589) so slider changes repaint live.

- [ ] **Step 2: Typecheck + manual verification**

`npx tsc --noEmit` — PASS. In the dev server: toggle highlight on → continuous bar behind every Arabic line; color/roundness/padding sliders update live; multi-line verse gets one bar per line; waqf marks and verse-number medallion unaffected; with intro = fade, bar sweeps right→left while fading with the ayah.

- [ ] **Step 3: Commit**

```bash
git add src/components/StudioSettings.tsx src/components/StudioPreview.tsx
git commit -m "feat(ui): highlight bar controls (color, opacity, roundness, padding)"
```

---

### Task 10: End-to-end verification + memory

- [ ] **Step 1: Full QA sweep** (dev server, then a real export):
1. Highlight on, intro "fade": preview shows the bar sweeping right→left fading in with the ayah; export the video — identical behavior frame-for-frame.
2. Highlight + letterbox + 9:16; highlight + 4:5; highlight + QCF (Mushaf) verses; highlight + split verse parts (verse number still on every part).
3. Translation gap / position / line breaks: studio preview == fullscreen preview == exported file.
4. iPhone Safari: open the studio on the phone (http://192.168.0.55:3000), confirm preview matches the downloaded video on the same device.

- [ ] **Step 2: Memory updates**

Per the don't-repeat-bugs rule, update memory: parity invariant (drawScene single path) in `feedback_preview_export_parity.md`; note in project memory that highlight bars live in `drawVerseText` behind the glyph pass.

- [ ] **Step 3: Final commit of any QA fixes**
