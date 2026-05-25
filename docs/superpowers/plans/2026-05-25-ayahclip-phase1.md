# AyahClip Phase 1: Foundation Rebuild

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform AyahClip from a basic MVP into a proper creative tool — dashboard, stock backgrounds, more fonts/reciters, text effects, letterbox layout, redesigned settings, and full-screen preview.

**Architecture:** Extend the existing Next.js 16 App Router app. Add a dashboard at `/` (replaces current surah grid), move surah browsing to `/browse`, add a Pexels API proxy route handler, IndexedDB for project persistence, and significant canvas rendering enhancements (text shadow, letterbox layout).

**Tech Stack:** Next.js 16.2.6, React 19, Tailwind CSS v4 (`@import "tailwindcss"`), Zustand v5, idb-keyval (IndexedDB), Pexels API, HTML Canvas, MediaRecorder API

**IMPORTANT:** This is Next.js 16 with breaking changes. Read `node_modules/next/dist/docs/` before writing unfamiliar APIs. Tailwind v4 uses `@import "tailwindcss"` NOT `@tailwind base/components/utilities`.

---

## File Structure (New/Modified)

```
src/
├── app/
│   ├── layout.tsx                     — MODIFY: add new Arabic fonts, nav bar
│   ├── page.tsx                       — MODIFY: rewrite as dashboard
│   ├── browse/
│   │   └── page.tsx                   — CREATE: move surah grid here (was /)
│   ├── surah/[id]/page.tsx            — MODIFY: update back link to /browse
│   ├── studio/page.tsx                — MODIFY: add fullscreen, wider panel, save
│   └── api/
│       └── pexels/
│           └── route.ts               — CREATE: Pexels API proxy (hides API key)
├── components/
│   ├── BackgroundPicker.tsx           — MODIFY: add Pexels tab, custom upload tab
│   ├── StudioPreview.tsx              — MODIFY: text shadow, letterbox, arabic font, fullscreen btn
│   ├── StudioSettings.tsx             — MODIFY: redesign with sections, new controls
│   ├── FullscreenPreview.tsx          — CREATE: modal with export-resolution canvas
│   ├── PexelsSearch.tsx               — CREATE: search + photo grid UI
│   ├── DashboardCard.tsx              — CREATE: project card for dashboard
│   └── LetterboxSelector.tsx          — CREATE: letterbox style picker
├── lib/
│   ├── store.ts                       — MODIFY: add textShadow, letterbox, arabicFont, projectId
│   ├── reciters.ts                    — MODIFY: expand to 25 reciters
│   ├── export.ts                      — MODIFY: text shadow, letterbox, verse numbers, arabic font
│   ├── projects.ts                    — CREATE: IndexedDB CRUD for saved projects
│   ├── pexels.ts                      — CREATE: Pexels API client (calls our proxy)
│   └── canvas-utils.ts               — CREATE: shared canvas rendering (DRY preview+export)
├── types/
│   └── index.ts                       — MODIFY: add Project, TextShadow, LetterboxConfig types
```

---

## Task 1: Expand Reciters

**Files:**
- Modify: `src/lib/reciters.ts`

This is standalone — just expand the reciters list using EveryAyah.com's catalog.

- [ ] **Step 1: Replace reciters.ts with expanded list**

Replace the entire content of `src/lib/reciters.ts` with a list of 25 reciters. Each entry has `id`, `name`, and `folder` (the EveryAyah.com folder name).

Add these reciters (in addition to the 10 existing):
- Ahmed Al-Ajmy: `ahmed_ibn_ali_al_ajamy_128kbps`
- Hani Ar-Rifai: `Hani_Rifai_192kbps`
- Bandar Baleela: `Bandar_Balila_128kbps`
- Muhammad Al-Luhaidan: `Muhammad_Al-Luhaidan_128kbps`
- Fares Abbad: `Fares_Abbad_64kbps`
- Muhammad Al-Minshawi (Murattal): `Minshawi_Murattal_128kbps`
- Muhammad Al-Minshawi (Mujawwad): `Minshawy_Mujawwad_192kbps`
- Muhammad Al-Tablawi: `Mohammad_al_Tablaway_128kbps`
- Ali Jaber: `Ali_Jaber_64kbps`
- Idris Abkar: `Idrees_Abkar_128kbps`
- Khalid Al-Qahtani: `Khalid_AlQahtani_128kbps`
- Muhammad Ayyub: `Muhammad_Ayyoub_128kbps`
- Ali Al-Hudhaify: `Hudhaify_128kbps`
- Abdullah Al-Juhany: `Abdullaah_3awwaad_Al-Juhaynee_128kbps`
- Abdul Basit (Mujawwad): `Abdul_Basit_Mujawwad_128kbps`

Also rename existing `basit` id to `basit-murattal` to disambiguate from the Mujawwad version.

- [ ] **Step 2: Verify the app still builds and the reciter dropdown works**

Run `npx next build` and check for errors.

- [ ] **Step 3: Commit**

```
git add src/lib/reciters.ts
git commit -m "feat: expand reciters from 10 to 25"
```

---

## Task 2: Add Arabic Font Options

**Files:**
- Modify: `src/app/layout.tsx` — add Google Fonts links for new Arabic fonts
- Modify: `src/types/index.ts` — add arabicFont to StudioSettings
- Modify: `src/lib/store.ts` — add arabicFont state and setter
- Modify: `src/components/StudioSettings.tsx` — add Arabic font dropdown
- Modify: `src/components/StudioPreview.tsx` — use selected Arabic font in canvas rendering
- Modify: `src/lib/export.ts` — use selected Arabic font in export rendering

- [ ] **Step 1: Add new Arabic fonts to layout.tsx**

In `src/app/layout.tsx`, update the Google Fonts `<link>` to include: Noto Naskh Arabic, Reem Kufi, Aref Ruqaa, Lateef (in addition to existing Amiri, Scheherazade New, Cinzel, Lora, Playfair Display).

- [ ] **Step 2: Add arabicFont to types**

In `src/types/index.ts`, add `arabicFont: string` to `StudioSettings` interface.

- [ ] **Step 3: Add arabicFont to store**

In `src/lib/store.ts`:
- Add `arabicFont: string` to AppState interface with default `"amiri"`
- Add `setArabicFont: (font: string) => void` setter

- [ ] **Step 4: Add Arabic font dropdown to StudioSettings**

In `src/components/StudioSettings.tsx`, add an Arabic font selector dropdown right above the Arabic text size slider.

Define font options:
| Value | Label | CSS Family |
|-------|-------|------------|
| `amiri` | Amiri | `"Amiri", serif` |
| `scheherazade` | Scheherazade New | `"Scheherazade New", serif` |
| `noto-naskh` | Noto Naskh Arabic | `"Noto Naskh Arabic", serif` |
| `reem-kufi` | Reem Kufi | `"Reem Kufi", sans-serif` |
| `aref-ruqaa` | Aref Ruqaa | `"Aref Ruqaa", serif` |
| `lateef` | Lateef | `"Lateef", serif` |

- [ ] **Step 5: Update StudioPreview to use arabicFont**

In `src/components/StudioPreview.tsx`, replace all hardcoded `"Scheherazade New", "Amiri", serif` references with a lookup using the selected `store.arabicFont`. Create an `ARABIC_FONTS` map (or use from canvas-utils) to resolve font value to CSS family string.

Add `store.arabicFont` to the useEffect dependency array.

- [ ] **Step 6: Update export.ts to use arabicFont**

In `src/lib/export.ts`:
- Add `arabicFont: string` to `ExportOptions` interface
- Replace hardcoded Arabic font family with lookup from the same ARABIC_FONTS map
- Update the `ExportButton` component to pass `arabicFont` from store

- [ ] **Step 7: Commit**

```
git add src/app/layout.tsx src/types/index.ts src/lib/store.ts src/components/StudioSettings.tsx src/components/StudioPreview.tsx src/lib/export.ts
git commit -m "feat: add 6 Arabic font options (Amiri, Scheherazade, Noto Naskh, Reem Kufi, Aref Ruqaa, Lateef)"
```

---

## Task 3: Verse Number Prefix in Translations

**Files:**
- Modify: `src/components/StudioPreview.tsx` — prepend verse number to translation text
- Modify: `src/lib/export.ts` — same change for export rendering

- [ ] **Step 1: Update StudioPreview translation rendering**

In `src/components/StudioPreview.tsx`, in the `drawContent` function where translation text is rendered, prepend the verse number. Instead of using `currentVerse.translation` directly, use:

```typescript
const translationText = `${currentVerse.verse_number}. ${currentVerse.translation}`;
```

Use this `translationText` in both the `measureLines()` and `wrapText()` calls for translation.

- [ ] **Step 2: Update export.ts translation rendering**

Same change in `src/lib/export.ts` `drawFrame()`:

```typescript
const translationText = `${verse.verse_number}. ${verse.translation}`;
```

Use `translationText` instead of `verse.translation` in the measureLines and wrapText calls.

- [ ] **Step 3: Commit**

```
git add src/components/StudioPreview.tsx src/lib/export.ts
git commit -m "feat: add verse number prefix to translation text"
```

---

## Task 4: Text Shadow/Glow

**Files:**
- Modify: `src/types/index.ts` — add TextShadow interface
- Modify: `src/lib/store.ts` — add textShadow state and setter
- Modify: `src/components/StudioSettings.tsx` — add shadow toggle and blur slider
- Modify: `src/components/StudioPreview.tsx` — apply canvas shadow before drawing text
- Modify: `src/lib/export.ts` — apply shadow in export, add textShadow to ExportOptions

- [ ] **Step 1: Add TextShadow type**

In `src/types/index.ts`:

```typescript
export interface TextShadow {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}
```

Add `textShadow: TextShadow` to `StudioSettings`.

- [ ] **Step 2: Add textShadow to store**

In `src/lib/store.ts`, add to state and interface:
- Default: `textShadow: { enabled: true, color: "#000000", blur: 4, offsetX: 0, offsetY: 2 }`
- Setter: `setTextShadow: (shadow: TextShadow) => void`

- [ ] **Step 3: Add shadow controls to StudioSettings**

In `src/components/StudioSettings.tsx`, add a "Text Shadow" section after the text color picker:
- Enable/disable toggle (same switch style as translation toggle)
- When enabled, show blur slider (range 0-20, default 4)

The UI should look like:
```
TEXT SHADOW          [toggle]
Shadow Blur — 4px    ═════
```

- [ ] **Step 4: Apply shadow in StudioPreview canvas rendering**

In `src/components/StudioPreview.tsx`, before drawing Arabic text and translation, set canvas shadow properties if enabled:

```typescript
if (store.textShadow.enabled) {
  ctx.shadowColor = store.textShadow.color;
  ctx.shadowBlur = store.textShadow.blur;
  ctx.shadowOffsetX = store.textShadow.offsetX;
  ctx.shadowOffsetY = store.textShadow.offsetY;
}
```

After drawing all text, reset shadow: `ctx.shadowColor = "transparent";`

Add `store.textShadow` to the useEffect dependency array.

- [ ] **Step 5: Apply shadow in export.ts**

In `src/lib/export.ts`:
- Add `textShadow: TextShadow` to `ExportOptions` interface
- Apply same shadow logic in `drawFrame()` before text rendering
- Scale shadow blur and offsets by the export scale factor (`w / 480`)
- Reset shadow after text drawing

- [ ] **Step 6: Commit**

```
git add src/types/index.ts src/lib/store.ts src/components/StudioSettings.tsx src/components/StudioPreview.tsx src/lib/export.ts
git commit -m "feat: add text shadow/glow controls for readability"
```

---

## Task 5: Extract Shared Canvas Rendering (DRY)

**Files:**
- Create: `src/lib/canvas-utils.ts` — shared rendering functions
- Modify: `src/components/StudioPreview.tsx` — import from canvas-utils, delete duplicated functions
- Modify: `src/lib/export.ts` — import from canvas-utils, delete duplicated functions

Both `StudioPreview.tsx` and `export.ts` duplicate: `measureLines`, `wrapText`, `parseGradientStops`, `drawBackground`/background rendering, `getFontFamily`/`FONT_FAMILIES`, and the Arabic font map. Extract all into one file.

- [ ] **Step 1: Create canvas-utils.ts**

Create `src/lib/canvas-utils.ts` containing:

1. `ARABIC_FONTS` map (Record<string, string>) — value to CSS family string
2. `TRANSLATION_FONTS` map (Record<string, string>) — value to CSS family string
3. `getArabicFontFamily(font: string): string`
4. `getTranslationFontFamily(font: string): string`
5. `measureLines(ctx, text, maxWidth): string[]`
6. `wrapText(ctx, text, x, y, maxWidth, lineHeight): void`
7. `parseGradientStops(css): { offset: number; color: string }[]`
8. `drawBackground(ctx, w, h, bg): void`

All functions copied from the existing implementations.

- [ ] **Step 2: Update StudioPreview.tsx to import from canvas-utils**

Remove the local `measureLines`, `wrapText`, `parseGradientStops`, `drawBackground`, `getFontFamily`, `FONT_FAMILIES` functions. Import them from `@/lib/canvas-utils` instead.

- [ ] **Step 3: Update export.ts to import from canvas-utils**

Remove the duplicated functions from `export.ts`. Import from `@/lib/canvas-utils`.

- [ ] **Step 4: Verify build succeeds**

Run `npx next build` to verify no broken imports.

- [ ] **Step 5: Commit**

```
git add src/lib/canvas-utils.ts src/components/StudioPreview.tsx src/lib/export.ts
git commit -m "refactor: extract shared canvas rendering to canvas-utils.ts"
```

---

## Task 6: Pexels API Integration

**Files:**
- Create: `.env.local` — PEXELS_API_KEY
- Create: `.env.example` — template for API key
- Create: `src/app/api/pexels/route.ts` — server-side proxy route handler
- Create: `src/lib/pexels.ts` — client-side API helper
- Create: `src/components/PexelsSearch.tsx` — search input + photo grid UI
- Modify: `src/components/BackgroundPicker.tsx` — add tabs (Presets | Stock Photos | Upload)

- [ ] **Step 1: Set up environment variables**

Create `.env.local` with `PEXELS_API_KEY=your_key_here`. Create `.env.example` with `PEXELS_API_KEY=`. Ensure `.env.local` is in `.gitignore`.

- [ ] **Step 2: Create Pexels API proxy route handler**

Create `src/app/api/pexels/route.ts`. This is a Next.js Route Handler (see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`).

Export a `GET` function that:
1. Reads `PEXELS_API_KEY` from `process.env`
2. Extracts query params: `query` (default "nature"), `page` (default "1"), `per_page` (default "15"), `type` (default "photos")
3. Calls the appropriate Pexels API endpoint:
   - Photos: `https://api.pexels.com/v1/search`
   - Videos: `https://api.pexels.com/videos/search`
4. Forwards the `Authorization` header with the API key
5. Returns the JSON response

Use `NextRequest` for the request parameter, `Response.json()` for the response.

- [ ] **Step 3: Create Pexels client helper**

Create `src/lib/pexels.ts` with:

```typescript
export interface PexelsPhoto {
  id: number;
  photographer: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    tiny: string;
  };
}

export interface PexelsPhotoResponse {
  photos: PexelsPhoto[];
  total_results: number;
  page: number;
}

export async function searchPhotos(query: string, page?: number): Promise<PexelsPhotoResponse>
```

The `searchPhotos` function calls `/api/pexels?query=...&page=...&type=photos` and returns the parsed response.

- [ ] **Step 4: Create PexelsSearch component**

Create `src/components/PexelsSearch.tsx` — a "use client" component that:

1. Has a search input with default query "nature"
2. Shows suggested query chips (nature, mosque, rain, ocean, night sky, mountains) before first search
3. On search (Enter key or button click), calls `searchPhotos()`
4. Displays results in a 3-column grid of clickable thumbnails
5. When a photo is clicked, calls `onSelect` with a Background object:
   ```typescript
   { type: "image", value: photo.src.large, label: `Pexels: ${photo.photographer}` }
   ```
6. Shows loading spinner during fetch, "No results" when empty

Props: `onSelect: (bg: Background) => void`

- [ ] **Step 5: Rewrite BackgroundPicker with tabs**

Rewrite `src/components/BackgroundPicker.tsx` to have 3 tabs:
1. **Presets** — shows existing solid colors, gradients, and SVG images (current behavior)
2. **Stock Photos** — renders the `PexelsSearch` component
3. **Upload** — file upload input (implemented in Task 7)

Tab UI: pill-style tab bar at the top, active tab has `bg-white/10 text-white`, inactive has `text-gray-400`.

- [ ] **Step 6: Commit**

```
git add .env.example .gitignore src/app/api/pexels/route.ts src/lib/pexels.ts src/components/PexelsSearch.tsx src/components/BackgroundPicker.tsx
git commit -m "feat: add Pexels stock photo search for backgrounds"
```

---

## Task 7: Custom Image Upload

**Files:**
- Modify: `src/components/BackgroundPicker.tsx` — implement the Upload tab

- [ ] **Step 1: Implement upload section in BackgroundPicker**

In the Upload tab of `src/components/BackgroundPicker.tsx`, add:

1. A drag-and-drop zone with dashed border
2. A hidden file input (`accept="image/*"`)
3. On file selection, create a blob URL via `URL.createObjectURL(file)`
4. Call `onChange` with `{ type: "image", value: blobUrl, label: file.name }`

The upload zone UI:
```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│        +            │
│  Click to upload    │
│     image           │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

- [ ] **Step 2: Commit**

```
git add src/components/BackgroundPicker.tsx
git commit -m "feat: add custom image upload for backgrounds"
```

---

## Task 8: IndexedDB Project Storage

**Files:**
- Modify: `package.json` — add idb-keyval dependency
- Modify: `src/types/index.ts` — add Project interface
- Create: `src/lib/projects.ts` — IndexedDB CRUD functions

- [ ] **Step 1: Install idb-keyval**

Run `npm install idb-keyval` in the project directory.

- [ ] **Step 2: Add Project type**

In `src/types/index.ts`, add:

```typescript
export interface Project {
  id: string;
  name: string;
  surahId: number;
  surahName: string;
  selectedVerseNumbers: number[];
  settings: {
    reciterId: string;
    videoFormat: VideoFormat;
    arabicFontSize: number;
    arabicFont: string;
    translationEnabled: boolean;
    translationFontSize: number;
    translationFont: string;
    textColor: string;
    overlayOpacity: number;
    background: Background;
    textShadow: TextShadow;
  };
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}
```

- [ ] **Step 3: Create projects.ts**

Create `src/lib/projects.ts` with these functions:

```typescript
import { get, set, del, keys, getMany } from "idb-keyval";
import { Project } from "@/types";

const PROJECT_PREFIX = "project:";

export async function saveProject(project: Project): Promise<void>
export async function getProject(id: string): Promise<Project | undefined>
export async function deleteProject(id: string): Promise<void>
export async function getAllProjects(): Promise<Project[]>
export function generateProjectId(): string
```

- `saveProject`: stores project at key `project:{id}`
- `getProject`: retrieves by id
- `deleteProject`: removes by id
- `getAllProjects`: gets all keys starting with "project:", fetches them all, sorts by `updatedAt` descending
- `generateProjectId`: returns `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

- [ ] **Step 4: Commit**

```
git add package.json package-lock.json src/types/index.ts src/lib/projects.ts
git commit -m "feat: add IndexedDB project storage with idb-keyval"
```

---

## Task 9: Dashboard Page

**Files:**
- Modify: `src/app/page.tsx` — rewrite as dashboard
- Create: `src/app/browse/page.tsx` — move surah grid here
- Create: `src/components/DashboardCard.tsx` — project card component
- Modify: `src/app/layout.tsx` — add nav bar
- Modify: `src/app/surah/[id]/page.tsx` — update back button to `/browse`

- [ ] **Step 1: Create browse page (move surah grid)**

Create `src/app/browse/page.tsx` with the exact content currently in `src/app/page.tsx` — the surah grid with search. Copy it verbatim.

- [ ] **Step 2: Create DashboardCard component**

Create `src/components/DashboardCard.tsx` — a "use client" component that displays a project card:

Props: `project: Project`, `onOpen: () => void`, `onDelete: () => void`

Renders:
- Thumbnail area (aspect-video, shows `project.thumbnail` image or a placeholder)
- Project name (truncated)
- Surah name + verse count
- Time ago string (e.g., "2h ago", "3d ago")
- Delete button (appears on hover, calls `onDelete` with `stopPropagation`)

Include a `formatTimeAgo(timestamp: number): string` helper function.

- [ ] **Step 3: Rewrite page.tsx as dashboard**

Replace `src/app/page.tsx` with a dashboard page:

```
AyahClip
Create beautiful Quran recitation clips

[+ Create New Video]  → links to /browse

Recent Projects
[grid of DashboardCards]

— or if no projects —

No projects yet
Create your first Quran video clip
```

Uses `getAllProjects()` and `deleteProject()` from `@/lib/projects`.
"Create New Video" button navigates to `/browse`.

- [ ] **Step 4: Add nav bar to layout.tsx**

In `src/app/layout.tsx`, add a nav bar inside `<body>` above `{children}`:

```html
<nav> AyahClip | Browse Surahs </nav>
```

- "AyahClip" links to `/` (dashboard)
- "Browse Surahs" links to `/browse`

Style: `border-b border-white/10`, max-width container, flex with justify-between.

- [ ] **Step 5: Update surah page back button**

In `src/app/surah/[id]/page.tsx`, change `router.push("/")` to `router.push("/browse")` for the back button.

- [ ] **Step 6: Commit**

```
git add src/app/page.tsx src/app/browse/page.tsx src/components/DashboardCard.tsx src/app/layout.tsx src/app/surah/[id]/page.tsx
git commit -m "feat: add dashboard page with recent projects, move surah grid to /browse"
```

---

## Task 10: Save Project from Studio

**Files:**
- Modify: `src/lib/store.ts` — add projectId field
- Modify: `src/app/studio/page.tsx` — auto-save project on settings changes

- [ ] **Step 1: Add projectId to store**

In `src/lib/store.ts`, add:
- `projectId: string | null` (default: `null`)
- `setProjectId: (id: string | null) => void`

- [ ] **Step 2: Add auto-save to studio page**

In `src/app/studio/page.tsx`, add a `useEffect` that:

1. On mount, if `store.projectId` is null, generates a new project ID and sets it
2. On relevant store changes (debounced ~2 seconds), saves the current state as a Project to IndexedDB using `saveProject()`
3. Captures a thumbnail by calling `canvasRef.current.toDataURL("image/jpeg", 0.5)` (need to get canvas ref from StudioPreview)

The save captures: surahId, surahName, selectedVerseNumbers, all settings (reciter, format, fonts, colors, shadow, background), timestamp.

Use a debounced save — don't save on every slider tick. A simple approach: `useRef` for a timeout that resets on each change.

- [ ] **Step 3: Commit**

```
git add src/lib/store.ts src/app/studio/page.tsx
git commit -m "feat: auto-save studio projects to IndexedDB"
```

---

## Task 11: Letterbox Layout

**Files:**
- Modify: `src/types/index.ts` — add LetterboxConfig interface
- Modify: `src/lib/store.ts` — add letterbox state and setter
- Create: `src/components/LetterboxSelector.tsx` — letterbox options UI
- Modify: `src/components/StudioSettings.tsx` — add letterbox controls (only when 9:16)
- Modify: `src/components/StudioPreview.tsx` — render letterbox frame
- Modify: `src/lib/export.ts` — export with letterbox, add to ExportOptions

Letterbox = 16:9 content area centered inside a 9:16 frame, with colored bars top and bottom.

- [ ] **Step 1: Add LetterboxConfig type**

In `src/types/index.ts`:

```typescript
export interface LetterboxConfig {
  enabled: boolean;
  barColor: string;
  barStyle: "solid" | "blur" | "gradient";
}
```

- [ ] **Step 2: Add letterbox to store**

In `src/lib/store.ts`:
- `letterbox: LetterboxConfig` — default: `{ enabled: false, barColor: "#000000", barStyle: "solid" }`
- `setLetterbox: (config: LetterboxConfig) => void`

- [ ] **Step 3: Create LetterboxSelector component**

Create `src/components/LetterboxSelector.tsx`:

Props: `value: LetterboxConfig`, `onChange: (config: LetterboxConfig) => void`

UI:
- Enable/disable toggle
- When enabled:
  - Bar style buttons: Solid | Blur | Gradient
  - If solid: color picker for bar color

- [ ] **Step 4: Add letterbox controls to StudioSettings**

In `src/components/StudioSettings.tsx`, add letterbox controls after the Video Format section. Only show when `store.videoFormat === "9:16"`:

```tsx
{store.videoFormat === "9:16" && (
  <div>
    <label>Letterbox Layout</label>
    <LetterboxSelector value={store.letterbox} onChange={store.setLetterbox} />
  </div>
)}
```

- [ ] **Step 5: Render letterbox in StudioPreview**

In `src/components/StudioPreview.tsx`, when letterbox is enabled and format is 9:16:

1. Fill entire canvas with bar color (for the top/bottom bars)
2. Calculate 16:9 content area: `contentH = canvasW * (9/16)`, `contentY = (canvasH - contentH) / 2`
3. Save context, clip to content rect
4. Draw background, overlay, and text ONLY within the content area
5. Restore context
6. For "blur" bar style: draw the background full-frame first, apply a blur filter, then draw the content area on top

The text should be centered within the content area, not the full canvas height.

- [ ] **Step 6: Render letterbox in export.ts**

Same letterbox rendering logic in `src/lib/export.ts` `drawFrame()`. Add `letterbox: LetterboxConfig` to `ExportOptions`.

- [ ] **Step 7: Commit**

```
git add src/types/index.ts src/lib/store.ts src/components/LetterboxSelector.tsx src/components/StudioSettings.tsx src/components/StudioPreview.tsx src/lib/export.ts
git commit -m "feat: add letterbox layout option (16:9 content in 9:16 frame)"
```

---

## Task 12: Settings Panel Redesign

**Files:**
- Modify: `src/app/studio/page.tsx` — wider panel with toggle
- Modify: `src/components/StudioSettings.tsx` — organized collapsible sections

- [ ] **Step 1: Widen the settings panel and add toggle**

In `src/app/studio/page.tsx`:
- Change aside width from `w-80` to `w-96`
- Add a `settingsOpen` state (default `true`)
- Add transition for panel width: when closed, `w-0 overflow-hidden`
- Add a small toggle button on the preview side that opens/closes the panel

- [ ] **Step 2: Organize StudioSettings into collapsible sections**

In `src/components/StudioSettings.tsx`, create a reusable `Section` component:

```tsx
function Section({ title, defaultOpen, children }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="border-b border-white/5 pb-4">
      <button onClick={() => setOpen(!open)} className="...">
        <span>{title}</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="space-y-4 pt-1">{children}</div>}
    </div>
  );
}
```

Group settings into sections:
1. **Info** (always open, no collapse) — surah name, verse count, duration
2. **Audio** (open by default) — reciter dropdown
3. **Format** (open by default) — video format selector, letterbox toggle (if 9:16)
4. **Typography** (open by default) — Arabic font, Arabic size, translation toggle/size/font, text color, text shadow
5. **Background** (open by default) — overlay slider, background picker
6. **Export** (always visible) — export button at bottom

- [ ] **Step 3: Commit**

```
git add src/app/studio/page.tsx src/components/StudioSettings.tsx
git commit -m "feat: redesign settings panel — wider, collapsible sections, slide toggle"
```

---

## Task 13: Full-Screen Preview

**Files:**
- Create: `src/components/FullscreenPreview.tsx` — modal with export-resolution canvas
- Modify: `src/components/StudioPreview.tsx` — add fullscreen button, expose onFullscreen prop
- Modify: `src/app/studio/page.tsx` — mount fullscreen modal

- [ ] **Step 1: Create FullscreenPreview component**

Create `src/components/FullscreenPreview.tsx` — a "use client" component:

Props: `onClose: () => void`

Renders a fixed overlay (`fixed inset-0 z-50 bg-black/90`) containing:
1. A canvas rendered at actual export resolution (1080x1920 for 9:16, etc.)
2. The canvas is displayed with `max-h-[85vh] w-auto` to fit the screen
3. Close button at top-right ("Close (Esc)")
4. Prev/next verse buttons and counter at bottom
5. Escape key listener to close

The canvas renders the current verse using shared canvas-utils functions at full export resolution. This is the same rendering as export.ts but displayed in the browser.

Import render functions from `@/lib/canvas-utils`. Handle image backgrounds with async loading (same pattern as StudioPreview).

Re-render on: `store.currentVerseIndex`, `store.background`, `store.textColor`, `store.arabicFontSize`, `store.translationFontSize`, `store.overlayOpacity`, `store.textShadow`, `store.videoFormat`, `store.arabicFont`, `store.translationFont`, `store.letterbox`.

- [ ] **Step 2: Add fullscreen button to StudioPreview**

In `src/components/StudioPreview.tsx`:
- Add `onFullscreen?: () => void` prop
- Add a "Full Screen" button in the controls bar below the canvas

- [ ] **Step 3: Mount FullscreenPreview in studio page**

In `src/app/studio/page.tsx`:
- Add `fullscreen` state (default `false`)
- Pass `onFullscreen={() => setFullscreen(true)}` to StudioPreview
- Render `{fullscreen && <FullscreenPreview onClose={() => setFullscreen(false)} />}`

- [ ] **Step 4: Commit**

```
git add src/components/FullscreenPreview.tsx src/components/StudioPreview.tsx src/app/studio/page.tsx
git commit -m "feat: add full-screen preview at export resolution"
```

---

## Post-Implementation Checklist

After all tasks are complete:

1. Run `npx next build` — verify clean build
2. Test flow: Dashboard → Browse → Select surah → Select verses → Studio
3. Test each feature individually:
   - [ ] All 25 reciters play audio correctly
   - [ ] All 6 Arabic fonts render on canvas
   - [ ] Verse numbers appear in translation text
   - [ ] Text shadow toggles on/off and blur adjusts
   - [ ] Pexels search returns photos and they work as backgrounds
   - [ ] Custom image upload works as background
   - [ ] Letterbox layout works in 9:16 mode
   - [ ] Settings sections collapse/expand
   - [ ] Full-screen preview shows export-resolution render
   - [ ] Projects save to IndexedDB and appear on dashboard
   - [ ] Dashboard delete removes projects
4. Verify audio playback still auto-advances verses
5. Verify export produces correct WebM with all styling applied
