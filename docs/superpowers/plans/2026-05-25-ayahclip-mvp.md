# AyahClip MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AyahClip — a browser-based Quran recitation clipping tool that lets users select verses, pick a reciter, customize visuals, add English subtitles, and export short-form videos for social media.

**Architecture:** Next.js 14 App Router with three routes: Home (surah grid + search), Surah page (verse browser + selection), Studio (editor + preview + export). All data from Quran.com API v4 and EveryAyah.com. Client-side video export via Canvas + MediaRecorder. State managed with Zustand.

**Tech Stack:** Next.js 14, Tailwind CSS, Zustand, HTML Canvas, MediaRecorder API, Web Audio API

---

## File Structure

```
src/
├── app/
│   ├── layout.tsx              — Root layout: dark theme, global fonts, metadata
│   ├── page.tsx                — Home page: hero, search, surah grid
│   ├── surah/
│   │   └── [id]/
│   │       └── page.tsx        — Surah page: verse browser + selection
│   └── studio/
│       └── page.tsx            — Studio page: preview + settings + export
├── components/
│   ├── SurahCard.tsx           — Single surah in the grid (number, names, verse count, type)
│   ├── SurahGrid.tsx           — 3-column responsive grid of SurahCards
│   ├── SearchBar.tsx           — Search input that filters surahs
│   ├── VerseCard.tsx           — Single verse row (checkbox, number, Arabic, translation)
│   ├── VerseList.tsx           — List of VerseCards with select-all
│   ├── SelectionBar.tsx        — Floating bottom bar ("N verses selected — Open Studio")
│   ├── StudioPreview.tsx       — Canvas-based preview panel
│   ├── StudioSettings.tsx      — Settings panel (reciter, format, fonts, bg, etc.)
│   ├── BackgroundPicker.tsx    — Background selection UI (images, gradients, solids)
│   ├── FormatSelector.tsx      — Video format selector (16:9, 9:16, 1:1, 4:5)
│   └── ExportButton.tsx        — Export trigger + progress indicator
├── lib/
│   ├── store.ts                — Zustand store (surah, verses, studio settings)
│   ├── api.ts                  — Quran.com API + EveryAyah helpers
│   ├── reciters.ts             — Reciter list with display names + folder paths
│   ├── backgrounds.ts          — Background presets (images, gradients, solids)
│   ├── canvas.ts               — Canvas rendering logic (draw verse frames)
│   └── export.ts               — Video export (MediaRecorder + audio merge)
├── types/
│   └── index.ts                — TypeScript interfaces (Surah, Verse, StudioSettings, etc.)
└── public/
    └── backgrounds/            — Preset background images (5-10 images)
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd "/Users/abzz/Quran clipping and recording"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

When prompted, accept defaults. This creates the full Next.js scaffold.

- [ ] **Step 2: Install dependencies**

```bash
npm install zustand
```

- [ ] **Step 3: Configure dark theme and global styles**

Replace `src/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #0a0a0a;
  --foreground: #ededed;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 4: Set up root layout**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AyahClip",
  description: "Create beautiful Quran recitation clips for social media",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0a0a] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Create placeholder home page**

Replace `src/app/page.tsx` with:

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">AyahClip</h1>
      <p className="mt-2 text-gray-400">
        Create beautiful Quran recitation clips for social media
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Run dev server and verify**

```bash
npm run dev
```

Open `http://localhost:3000` — should see dark page with "AyahClip" heading.

- [ ] **Step 7: Initialize git and commit**

```bash
git init
git add .
git commit -m "feat: initialize AyahClip Next.js project with dark theme"
```

---

## Task 2: TypeScript Types & API Layer

**Files:**
- Create: `src/types/index.ts`, `src/lib/api.ts`, `src/lib/reciters.ts`

- [ ] **Step 1: Define TypeScript interfaces**

Create `src/types/index.ts`:

```ts
export interface Surah {
  id: number;
  name_simple: string;
  name_arabic: string;
  verses_count: number;
  revelation_place: "makkah" | "madinah";
  translated_name: {
    name: string;
    language_name: string;
  };
}

export interface Verse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani: string;
  translation?: string;
}

export interface Reciter {
  id: string;
  name: string;
  folder: string;
}

export type VideoFormat = "16:9" | "9:16" | "1:1" | "4:5";

export type BackgroundType = "image" | "gradient" | "solid";

export interface Background {
  type: BackgroundType;
  value: string;
  label: string;
}

export interface StudioSettings {
  surah: Surah | null;
  verses: Verse[];
  reciterId: string;
  videoFormat: VideoFormat;
  arabicFontSize: number;
  translationEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  textColor: string;
  overlayOpacity: number;
  background: Background;
}
```

- [ ] **Step 2: Create reciter list**

Create `src/lib/reciters.ts`:

```ts
import { Reciter } from "@/types";

export const reciters: Reciter[] = [
  { id: "alafasy", name: "Mishary Rashid Alafasy", folder: "Alafasy_128kbps" },
  { id: "sudais", name: "Abdul Rahman Al-Sudais", folder: "Abdurrahmaan_As-Sudais_192kbps" },
  { id: "muaiqly", name: "Maher Al-Muaiqly", folder: "MaherAlMuaiqly128kbps" },
  { id: "dussary", name: "Yasser Ad-Dussary", folder: "Yasser_Ad-Dussary_128kbps" },
  { id: "ghamdi", name: "Saad Al-Ghamdi", folder: "Ghamadi_40kbps" },
  { id: "husary", name: "Mahmoud Khalil Al-Husary", folder: "Husary_128kbps" },
  { id: "basit", name: "Abdul Basit (Murattal)", folder: "Abdul_Basit_Murattal_192kbps" },
  { id: "shuraym", name: "Saood Ash-Shuraym", folder: "Saood_ash-Shuraym_128kbps" },
  { id: "shaatree", name: "Abu Bakr Ash-Shaatree", folder: "Abu_Bakr_Ash-Shaatree_128kbps" },
  { id: "qatami", name: "Nasser Al-Qatami", folder: "Nasser_Alqatami_128kbps" },
];
```

- [ ] **Step 3: Create API helpers**

Create `src/lib/api.ts`:

```ts
import { Surah, Verse } from "@/types";

const QURAN_API = "https://api.quran.com/api/v4";
const EVERYAYAH_BASE = "https://everyayah.com/data";

export async function fetchSurahs(): Promise<Surah[]> {
  const res = await fetch(`${QURAN_API}/chapters?language=en`);
  const data = await res.json();
  return data.chapters;
}

export async function fetchVerses(
  surahId: number,
  translationId: number = 20
): Promise<Verse[]> {
  const perPage = 300;
  const res = await fetch(
    `${QURAN_API}/verses/by_chapter/${surahId}?language=en&translations=${translationId}&fields=text_uthmani&per_page=${perPage}`
  );
  const data = await res.json();
  return data.verses.map((v: any) => ({
    id: v.id,
    verse_number: v.verse_number,
    verse_key: v.verse_key,
    text_uthmani: v.text_uthmani,
    translation: data.verses.length > 0 && v.translations?.[0]?.text
      ? v.translations[0].text.replace(/<[^>]*>/g, "")
      : undefined,
  }));
}

export function getAudioUrl(reciterFolder: string, surahNumber: number, ayahNumber: number): string {
  const surah = String(surahNumber).padStart(3, "0");
  const ayah = String(ayahNumber).padStart(3, "0");
  return `${EVERYAYAH_BASE}/${reciterFolder}/${surah}${ayah}.mp3`;
}
```

- [ ] **Step 4: Verify API works**

Create a quick test — temporarily add to `src/app/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { fetchSurahs } from "@/lib/api";
import { Surah } from "@/types";

export default function Home() {
  const [surahs, setSurahs] = useState<Surah[]>([]);

  useEffect(() => {
    fetchSurahs().then(setSurahs);
  }, []);

  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold">AyahClip</h1>
      <p className="mt-2 text-gray-400">Loaded {surahs.length} surahs</p>
    </main>
  );
}
```

Run `npm run dev`, open browser — should see "Loaded 114 surahs".

- [ ] **Step 5: Commit**

```bash
git add src/types src/lib/api.ts src/lib/reciters.ts src/app/page.tsx
git commit -m "feat: add TypeScript types, Quran API helpers, and reciter list"
```

---

## Task 3: Zustand Store

**Files:**
- Create: `src/lib/store.ts`, `src/lib/backgrounds.ts`

- [ ] **Step 1: Create background presets**

Create `src/lib/backgrounds.ts`:

```ts
import { Background } from "@/types";

export const backgroundPresets: Background[] = [
  { type: "solid", value: "#0a0a0a", label: "Black" },
  { type: "solid", value: "#1a1a2e", label: "Dark Navy" },
  { type: "solid", value: "#16213e", label: "Deep Blue" },
  { type: "solid", value: "#1b2631", label: "Charcoal" },
  { type: "solid", value: "#0d1117", label: "GitHub Dark" },
  { type: "gradient", value: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)", label: "Night Sky" },
  { type: "gradient", value: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", label: "Deep Ocean" },
  { type: "gradient", value: "linear-gradient(180deg, #0a0a0a 0%, #2d1b69 100%)", label: "Purple Night" },
  { type: "gradient", value: "linear-gradient(135deg, #0a3d0a 0%, #0a0a0a 100%)", label: "Forest Dark" },
  { type: "gradient", value: "linear-gradient(135deg, #1a0a0a 0%, #3d1a1a 100%)", label: "Warm Dark" },
  { type: "image", value: "/backgrounds/mosque-1.jpg", label: "Mosque" },
  { type: "image", value: "/backgrounds/nature-1.jpg", label: "Nature" },
  { type: "image", value: "/backgrounds/stars-1.jpg", label: "Stars" },
  { type: "image", value: "/backgrounds/desert-1.jpg", label: "Desert" },
  { type: "image", value: "/backgrounds/clouds-1.jpg", label: "Clouds" },
];
```

- [ ] **Step 2: Create Zustand store**

Create `src/lib/store.ts`:

```ts
import { create } from "zustand";
import { Surah, Verse, VideoFormat, Background } from "@/types";
import { backgroundPresets } from "./backgrounds";

interface AppState {
  surah: Surah | null;
  verses: Verse[];
  selectedVerseNumbers: number[];
  reciterId: string;
  videoFormat: VideoFormat;
  arabicFontSize: number;
  translationEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  textColor: string;
  overlayOpacity: number;
  background: Background;
  currentVerseIndex: number;

  setSurah: (surah: Surah) => void;
  setVerses: (verses: Verse[]) => void;
  toggleVerse: (verseNumber: number) => void;
  selectAllVerses: () => void;
  clearSelection: () => void;
  setReciterId: (id: string) => void;
  setVideoFormat: (format: VideoFormat) => void;
  setArabicFontSize: (size: number) => void;
  setTranslationEnabled: (enabled: boolean) => void;
  setTranslationFontSize: (size: number) => void;
  setTranslationFont: (font: string) => void;
  setTextColor: (color: string) => void;
  setOverlayOpacity: (opacity: number) => void;
  setBackground: (bg: Background) => void;
  setCurrentVerseIndex: (index: number) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  surah: null,
  verses: [],
  selectedVerseNumbers: [],
  reciterId: "alafasy",
  videoFormat: "9:16",
  arabicFontSize: 48,
  translationEnabled: true,
  translationFontSize: 24,
  translationFont: "serif",
  textColor: "#ffffff",
  overlayOpacity: 50,
  background: backgroundPresets[0],
  currentVerseIndex: 0,

  setSurah: (surah) => set({ surah }),
  setVerses: (verses) => set({ verses }),
  toggleVerse: (verseNumber) =>
    set((state) => ({
      selectedVerseNumbers: state.selectedVerseNumbers.includes(verseNumber)
        ? state.selectedVerseNumbers.filter((n) => n !== verseNumber)
        : [...state.selectedVerseNumbers, verseNumber].sort((a, b) => a - b),
    })),
  selectAllVerses: () =>
    set((state) => ({
      selectedVerseNumbers: state.verses.map((v) => v.verse_number),
    })),
  clearSelection: () => set({ selectedVerseNumbers: [] }),
  setReciterId: (id) => set({ reciterId: id }),
  setVideoFormat: (format) => set({ videoFormat: format }),
  setArabicFontSize: (size) => set({ arabicFontSize: size }),
  setTranslationEnabled: (enabled) => set({ translationEnabled: enabled }),
  setTranslationFontSize: (size) => set({ translationFontSize: size }),
  setTranslationFont: (font) => set({ translationFont: font }),
  setTextColor: (color) => set({ textColor: color }),
  setOverlayOpacity: (opacity) => set({ overlayOpacity: opacity }),
  setBackground: (bg) => set({ background: bg }),
  setCurrentVerseIndex: (index) => set({ currentVerseIndex: index }),
}));
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/store.ts src/lib/backgrounds.ts
git commit -m "feat: add Zustand store and background presets"
```

---

## Task 4: Home Page — Surah Grid + Search

**Files:**
- Create: `src/components/SurahCard.tsx`, `src/components/SurahGrid.tsx`, `src/components/SearchBar.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create SurahCard component**

Create `src/components/SurahCard.tsx`:

```tsx
import Link from "next/link";
import { Surah } from "@/types";

export function SurahCard({ surah }: { surah: Surah }) {
  return (
    <Link
      href={`/surah/${surah.id}`}
      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:bg-white/10"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-sm font-medium">
          {surah.id}
        </div>
        <div>
          <p className="font-medium">{surah.name_simple}</p>
          <p className="text-xs text-gray-400">
            {surah.verses_count} verses · {surah.revelation_place === "makkah" ? "Meccan" : "Medinan"}
          </p>
        </div>
      </div>
      <p className="text-lg font-arabic text-gray-300">{surah.name_arabic}</p>
    </Link>
  );
}
```

- [ ] **Step 2: Create SearchBar component**

Create `src/components/SearchBar.tsx`:

```tsx
interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative w-full max-w-md">
      <svg
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        placeholder="Search surahs..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-white/20 focus:bg-white/10"
        aria-label="Search surahs by name or number"
      />
    </div>
  );
}
```

- [ ] **Step 3: Create SurahGrid component**

Create `src/components/SurahGrid.tsx`:

```tsx
import { Surah } from "@/types";
import { SurahCard } from "./SurahCard";

export function SurahGrid({ surahs }: { surahs: Surah[] }) {
  if (surahs.length === 0) {
    return (
      <p className="py-12 text-center text-gray-500">No surahs found</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {surahs.map((surah) => (
        <SurahCard key={surah.id} surah={surah} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Build the Home page**

Replace `src/app/page.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchSurahs } from "@/lib/api";
import { Surah } from "@/types";
import { SearchBar } from "@/components/SearchBar";
import { SurahGrid } from "@/components/SurahGrid";

export default function Home() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSurahs().then((data) => {
      setSurahs(data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return surahs;
    const q = search.toLowerCase();
    return surahs.filter(
      (s) =>
        s.name_simple.toLowerCase().includes(q) ||
        s.name_arabic.includes(search) ||
        s.translated_name.name.toLowerCase().includes(q) ||
        String(s.id) === q
    );
  }, [surahs, search]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-col items-center gap-4">
        <div className="text-4xl">📖</div>
        <h1 className="text-3xl font-bold">AyahClip</h1>
        <p className="text-sm text-gray-400">
          Create beautiful Quran recitation clips for social media
        </p>
        <SearchBar value={search} onChange={setSearch} />
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      ) : (
        <SurahGrid surahs={filtered} />
      )}
    </main>
  );
}
```

- [ ] **Step 5: Run dev server and verify**

```bash
npm run dev
```

Open browser: should see AyahClip header, search bar, 114 surahs in a 3-column grid. Search should filter live. Clicking a surah should navigate to `/surah/[id]` (404 for now is fine).

- [ ] **Step 6: Commit**

```bash
git add src/components/SurahCard.tsx src/components/SearchBar.tsx src/components/SurahGrid.tsx src/app/page.tsx
git commit -m "feat: add home page with surah grid and search"
```

---

## Task 5: Surah Page — Verse Browser + Selection

**Files:**
- Create: `src/components/VerseCard.tsx`, `src/components/VerseList.tsx`, `src/components/SelectionBar.tsx`, `src/app/surah/[id]/page.tsx`

- [ ] **Step 1: Create VerseCard component**

Create `src/components/VerseCard.tsx`:

```tsx
import { Verse } from "@/types";

interface VerseCardProps {
  verse: Verse;
  selected: boolean;
  onToggle: () => void;
}

export function VerseCard({ verse, selected, onToggle }: VerseCardProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-full rounded-lg border p-4 text-left transition-colors ${
        selected
          ? "border-emerald-500/50 bg-emerald-500/10"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
      aria-pressed={selected}
      aria-label={`Verse ${verse.verse_number}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs ${
            selected
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-white/20 text-gray-400"
          }`}
        >
          {selected ? "✓" : verse.verse_number}
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-right text-xl leading-loose font-arabic" dir="rtl">
            {verse.text_uthmani}
          </p>
          {verse.translation && (
            <p className="text-sm leading-relaxed text-gray-400">
              {verse.verse_number}. {verse.translation}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Create VerseList component**

Create `src/components/VerseList.tsx`:

```tsx
import { Verse } from "@/types";
import { VerseCard } from "./VerseCard";

interface VerseListProps {
  verses: Verse[];
  selectedNumbers: number[];
  onToggle: (verseNumber: number) => void;
}

export function VerseList({ verses, selectedNumbers, onToggle }: VerseListProps) {
  return (
    <div className="space-y-2">
      {verses.map((verse) => (
        <VerseCard
          key={verse.id}
          verse={verse}
          selected={selectedNumbers.includes(verse.verse_number)}
          onToggle={() => onToggle(verse.verse_number)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create SelectionBar component**

Create `src/components/SelectionBar.tsx`:

```tsx
"use client";

import Link from "next/link";

interface SelectionBarProps {
  count: number;
}

export function SelectionBar({ count }: SelectionBarProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0a0a0a]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <span className="text-sm text-gray-300">
          {count} verse{count !== 1 ? "s" : ""} selected
        </span>
        <Link
          href="/studio"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-emerald-500"
        >
          Open Studio
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build the Surah page**

Create `src/app/surah/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchSurahs, fetchVerses } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Surah, Verse } from "@/types";
import { VerseList } from "@/components/VerseList";
import { SelectionBar } from "@/components/SelectionBar";

export default function SurahPage() {
  const params = useParams();
  const router = useRouter();
  const surahId = Number(params.id);

  const [surah, setSurah] = useState<Surah | null>(null);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedVerseNumbers = useAppStore((s) => s.selectedVerseNumbers);
  const toggleVerse = useAppStore((s) => s.toggleVerse);
  const selectAllVerses = useAppStore((s) => s.selectAllVerses);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const setSurahStore = useAppStore((s) => s.setSurah);
  const setVersesStore = useAppStore((s) => s.setVerses);

  useEffect(() => {
    clearSelection();
    Promise.all([fetchSurahs(), fetchVerses(surahId)]).then(
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
  }, [surahId]);

  const allSelected =
    verses.length > 0 && selectedVerseNumbers.length === verses.length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-20">
      <button
        onClick={() => router.push("/")}
        className="mb-6 flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-white"
      >
        ← Back
      </button>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      ) : surah ? (
        <>
          <header className="mb-6 text-center">
            <p className="text-2xl font-arabic text-gray-300">
              {surah.name_arabic}
            </p>
            <h1 className="mt-1 text-2xl font-bold">{surah.name_simple}</h1>
            <p className="mt-1 text-sm text-gray-400">
              {surah.verses_count} verses ·{" "}
              {surah.revelation_place === "makkah" ? "Meccan" : "Medinan"}
            </p>
          </header>

          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={allSelected ? clearSelection : selectAllVerses}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/10"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          <VerseList
            verses={verses}
            selectedNumbers={selectedVerseNumbers}
            onToggle={toggleVerse}
          />
        </>
      ) : (
        <p className="text-center text-gray-500">Surah not found</p>
      )}

      <SelectionBar count={selectedVerseNumbers.length} />
    </main>
  );
}
```

- [ ] **Step 5: Run and verify**

```bash
npm run dev
```

Navigate to home → click a surah → should see Arabic text + English translations. Select verses → floating bar appears. "Select all" works. Back button returns to home.

- [ ] **Step 6: Commit**

```bash
git add src/components/VerseCard.tsx src/components/VerseList.tsx src/components/SelectionBar.tsx src/app/surah/
git commit -m "feat: add surah page with verse browser and selection"
```

---

## Task 6: Studio Page — Preview + Settings

**Files:**
- Create: `src/components/StudioPreview.tsx`, `src/components/FormatSelector.tsx`, `src/components/BackgroundPicker.tsx`, `src/components/StudioSettings.tsx`, `src/app/studio/page.tsx`

- [ ] **Step 1: Create FormatSelector component**

Create `src/components/FormatSelector.tsx`:

```tsx
import { VideoFormat } from "@/types";

const formats: { value: VideoFormat; label: string; icon: string }[] = [
  { value: "16:9", label: "16:9", icon: "▬" },
  { value: "9:16", label: "9:16", icon: "▮" },
  { value: "1:1", label: "1:1", icon: "■" },
  { value: "4:5", label: "4:5", icon: "▯" },
];

interface FormatSelectorProps {
  value: VideoFormat;
  onChange: (format: VideoFormat) => void;
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  return (
    <div className="flex gap-2">
      {formats.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs transition-colors ${
            value === f.value
              ? "border-emerald-500 bg-emerald-500/10 text-white"
              : "border-white/10 text-gray-400 hover:bg-white/10"
          }`}
          aria-pressed={value === f.value}
          aria-label={`${f.label} format`}
        >
          <span className="text-lg">{f.icon}</span>
          {f.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create BackgroundPicker component**

Create `src/components/BackgroundPicker.tsx`:

```tsx
import { Background } from "@/types";
import { backgroundPresets } from "@/lib/backgrounds";

interface BackgroundPickerProps {
  value: Background;
  onChange: (bg: Background) => void;
}

export function BackgroundPicker({ value, onChange }: BackgroundPickerProps) {
  const solids = backgroundPresets.filter((b) => b.type === "solid");
  const gradients = backgroundPresets.filter((b) => b.type === "gradient");

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs text-gray-400">Solid Colors</p>
        <div className="flex flex-wrap gap-2">
          {solids.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-8 w-8 rounded-md border-2 transition-all ${
                value.value === bg.value
                  ? "border-emerald-500 scale-110"
                  : "border-transparent hover:border-white/30"
              }`}
              style={{ background: bg.value }}
              aria-label={bg.label}
              title={bg.label}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-gray-400">Gradients</p>
        <div className="flex flex-wrap gap-2">
          {gradients.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-8 w-8 rounded-md border-2 transition-all ${
                value.value === bg.value
                  ? "border-emerald-500 scale-110"
                  : "border-transparent hover:border-white/30"
              }`}
              style={{ background: bg.value }}
              aria-label={bg.label}
              title={bg.label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create StudioPreview component**

Create `src/components/StudioPreview.tsx`:

```tsx
"use client";

import { useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store";

const FORMAT_RATIOS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 640, h: 360 },
  "9:16": { w: 360, h: 640 },
  "1:1": { w: 480, h: 480 },
  "4:5": { w: 400, h: 500 },
};

export function StudioPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useAppStore();

  const selectedVerses = store.verses.filter((v) =>
    store.selectedVerseNumbers.includes(v.verse_number)
  );
  const currentVerse = selectedVerses[store.currentVerseIndex] ?? selectedVerses[0];
  const ratio = FORMAT_RATIOS[store.videoFormat];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentVerse) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = ratio.w * 2;
    canvas.height = ratio.h * 2;
    ctx.scale(2, 2);

    if (store.background.type === "solid") {
      ctx.fillStyle = store.background.value;
      ctx.fillRect(0, 0, ratio.w, ratio.h);
    } else if (store.background.type === "gradient") {
      const gradient = ctx.createLinearGradient(0, 0, ratio.w, ratio.h);
      gradient.addColorStop(0, "#1a1a2e");
      gradient.addColorStop(1, "#0a0a0a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, ratio.w, ratio.h);
    } else {
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, ratio.w, ratio.h);
    }

    ctx.fillStyle = `rgba(0, 0, 0, ${store.overlayOpacity / 100})`;
    ctx.fillRect(0, 0, ratio.w, ratio.h);

    const arabicSize = Math.min(store.arabicFontSize, ratio.w / 10);
    ctx.fillStyle = store.textColor;
    ctx.font = `${arabicSize}px "Scheherazade New", "Amiri", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const centerY = store.translationEnabled ? ratio.h * 0.4 : ratio.h * 0.5;
    const maxWidth = ratio.w * 0.85;

    wrapText(ctx, currentVerse.text_uthmani, ratio.w / 2, centerY, maxWidth, arabicSize * 1.8);

    if (store.translationEnabled && currentVerse.translation) {
      const transSize = Math.min(store.translationFontSize, ratio.w / 16);
      ctx.font = `${transSize}px ${store.translationFont === "serif" ? '"Georgia", serif' : '"Arial", sans-serif'}`;
      ctx.fillStyle = store.textColor + "cc";
      wrapText(
        ctx,
        currentVerse.translation,
        ratio.w / 2,
        ratio.h * 0.7,
        maxWidth,
        transSize * 1.6
      );
    }
  }, [store, currentVerse, ratio]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="overflow-hidden rounded-lg border border-white/10"
        style={{
          width: Math.min(ratio.w, 480),
          aspectRatio: `${ratio.w}/${ratio.h}`,
        }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ imageRendering: "auto" }}
        />
      </div>
      {selectedVerses.length > 0 && (
        <div className="flex items-center gap-4">
          <button
            onClick={() =>
              store.setCurrentVerseIndex(
                Math.max(0, store.currentVerseIndex - 1)
              )
            }
            disabled={store.currentVerseIndex === 0}
            className="rounded-lg border border-white/10 px-3 py-1 text-sm disabled:opacity-30"
            aria-label="Previous verse"
          >
            ←
          </button>
          <span className="text-sm text-gray-400">
            {store.currentVerseIndex + 1} / {selectedVerses.length}
          </span>
          <button
            onClick={() =>
              store.setCurrentVerseIndex(
                Math.min(selectedVerses.length - 1, store.currentVerseIndex + 1)
              )
            }
            disabled={store.currentVerseIndex === selectedVerses.length - 1}
            className="rounded-lg border border-white/10 px-3 py-1 text-sm disabled:opacity-30"
            aria-label="Next verse"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}
```

- [ ] **Step 4: Create StudioSettings component**

Create `src/components/StudioSettings.tsx`:

```tsx
"use client";

import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { FormatSelector } from "./FormatSelector";
import { BackgroundPicker } from "./BackgroundPicker";

export function StudioSettings() {
  const store = useAppStore();
  const selectedCount = store.selectedVerseNumbers.length;

  return (
    <div className="space-y-6 overflow-y-auto">
      <div>
        <p className="text-xs text-gray-400">Surah {store.surah?.id}</p>
        <h2 className="text-xl font-bold">{store.surah?.name_simple ?? "—"}</h2>
        <p className="text-sm text-gray-400">{selectedCount} verses selected</p>
      </div>

      <hr className="border-white/10" />

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Reciter
        </label>
        <select
          value={store.reciterId}
          onChange={(e) => store.setReciterId(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
        >
          {reciters.map((r) => (
            <option key={r.id} value={r.id} className="bg-[#1a1a1a]">
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Video Format
        </label>
        <FormatSelector value={store.videoFormat} onChange={store.setVideoFormat} />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Arabic Text Size — {store.arabicFontSize}px
        </label>
        <input
          type="range"
          min={24}
          max={120}
          value={store.arabicFontSize}
          onChange={(e) => store.setArabicFontSize(Number(e.target.value))}
          className="w-full accent-emerald-500"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-gray-400">
          English Translation
        </label>
        <button
          onClick={() => store.setTranslationEnabled(!store.translationEnabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            store.translationEnabled ? "bg-emerald-500" : "bg-white/20"
          }`}
          role="switch"
          aria-checked={store.translationEnabled}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              store.translationEnabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      {store.translationEnabled && (
        <>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
              Translation Size — {store.translationFontSize}px
            </label>
            <input
              type="range"
              min={16}
              max={64}
              value={store.translationFontSize}
              onChange={(e) => store.setTranslationFontSize(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
              Translation Font
            </label>
            <div className="flex gap-2">
              {["serif", "sans-serif"].map((font) => (
                <button
                  key={font}
                  onClick={() => store.setTranslationFont(font)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                    store.translationFont === font
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-white/10 hover:bg-white/10"
                  }`}
                >
                  {font === "serif" ? "Serif" : "Sans"}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Text Color
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={store.textColor}
            onChange={(e) => store.setTextColor(e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent"
          />
          <span className="text-sm text-gray-400">{store.textColor}</span>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Dark Overlay — {store.overlayOpacity}%
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={store.overlayOpacity}
          onChange={(e) => store.setOverlayOpacity(Number(e.target.value))}
          className="w-full accent-emerald-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-400">
          Background
        </label>
        <BackgroundPicker value={store.background} onChange={store.setBackground} />
      </div>

      <button
        className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-medium transition-colors hover:bg-emerald-500 disabled:opacity-50"
        disabled={selectedCount === 0}
      >
        Export Video
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Build the Studio page**

Create `src/app/studio/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { StudioPreview } from "@/components/StudioPreview";
import { StudioSettings } from "@/components/StudioSettings";

export default function StudioPage() {
  const router = useRouter();
  const surah = useAppStore((s) => s.surah);
  const selectedVerseNumbers = useAppStore((s) => s.selectedVerseNumbers);

  if (!surah || selectedVerseNumbers.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-gray-400">No verses selected</p>
        <button
          onClick={() => router.push("/")}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          Go to Home
        </button>
      </main>
    );
  }

  return (
    <main className="flex h-screen">
      <div className="flex flex-1 items-center justify-center bg-black/50 p-8">
        <StudioPreview />
      </div>
      <aside className="w-80 border-l border-white/10 bg-[#0a0a0a] p-6">
        <button
          onClick={() => router.back()}
          className="mb-4 text-sm text-gray-400 hover:text-white"
        >
          ← Back
        </button>
        <StudioSettings />
      </aside>
    </main>
  );
}
```

- [ ] **Step 6: Run and verify full flow**

```bash
npm run dev
```

Full flow: Home → click surah → select verses → Open Studio → should see canvas preview with Arabic text + English translation, all settings controls working (reciter dropdown, format selector, sliders, color picker, background picker). Changing settings should update preview in real time.

- [ ] **Step 7: Commit**

```bash
git add src/components/StudioPreview.tsx src/components/FormatSelector.tsx src/components/BackgroundPicker.tsx src/components/StudioSettings.tsx src/app/studio/
git commit -m "feat: add studio page with live preview canvas and settings panel"
```

---

## Task 7: Audio Playback + Verse Progression

**Files:**
- Create: `src/lib/audio.ts`
- Modify: `src/components/StudioPreview.tsx`

- [ ] **Step 1: Create audio helper**

Create `src/lib/audio.ts`:

```ts
import { getAudioUrl } from "./api";

export async function loadAudio(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.src = url;
    audio.oncanplaythrough = () => resolve(audio);
    audio.onerror = () => reject(new Error(`Failed to load: ${url}`));
  });
}

export async function preloadVerseAudios(
  reciterFolder: string,
  surahNumber: number,
  verseNumbers: number[]
): Promise<Map<number, HTMLAudioElement>> {
  const audioMap = new Map<number, HTMLAudioElement>();
  const results = await Promise.allSettled(
    verseNumbers.map(async (vn) => {
      const url = getAudioUrl(reciterFolder, surahNumber, vn);
      const audio = await loadAudio(url);
      return { verseNumber: vn, audio };
    })
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      audioMap.set(result.value.verseNumber, result.value.audio);
    }
  }
  return audioMap;
}
```

- [ ] **Step 2: Add play/preview controls to StudioPreview**

Add to `src/components/StudioPreview.tsx`, above the return statement inside the component, after the existing `useEffect`:

```tsx
const [isPlaying, setIsPlaying] = useState(false);
const [audioMap, setAudioMap] = useState<Map<number, HTMLAudioElement>>(new Map());
const [audioLoading, setAudioLoading] = useState(false);
const currentAudioRef = useRef<HTMLAudioElement | null>(null);

const reciterFolder = reciters.find((r) => r.id === store.reciterId)?.folder ?? "Alafasy_128kbps";

const handlePlay = async () => {
  if (isPlaying) {
    currentAudioRef.current?.pause();
    setIsPlaying(false);
    return;
  }

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

  for (let i = store.currentVerseIndex; i < selectedVerses.length; i++) {
    const verse = selectedVerses[i];
    const audio = map.get(verse.verse_number);
    if (!audio) continue;

    store.setCurrentVerseIndex(i);
    currentAudioRef.current = audio;
    audio.currentTime = 0;

    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.play().catch(() => resolve());
    });

    if (!currentAudioRef.current || currentAudioRef.current.paused) {
      break;
    }
  }
  setIsPlaying(false);
};
```

Add these imports at the top of the file:

```tsx
import { useState } from "react";
import { reciters } from "@/lib/reciters";
import { preloadVerseAudios } from "@/lib/audio";
```

Add the play button to the navigation area, replacing the existing navigation div:

```tsx
<div className="flex items-center gap-4">
  <button
    onClick={() => store.setCurrentVerseIndex(Math.max(0, store.currentVerseIndex - 1))}
    disabled={store.currentVerseIndex === 0}
    className="rounded-lg border border-white/10 px-3 py-1 text-sm disabled:opacity-30"
    aria-label="Previous verse"
  >
    ←
  </button>
  <button
    onClick={handlePlay}
    disabled={audioLoading}
    className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
    aria-label={isPlaying ? "Pause" : "Play"}
  >
    {audioLoading ? "Loading..." : isPlaying ? "⏸ Pause" : "▶ Play"}
  </button>
  <span className="text-sm text-gray-400">
    {store.currentVerseIndex + 1} / {selectedVerses.length}
  </span>
  <button
    onClick={() => store.setCurrentVerseIndex(Math.min(selectedVerses.length - 1, store.currentVerseIndex + 1))}
    disabled={store.currentVerseIndex === selectedVerses.length - 1}
    className="rounded-lg border border-white/10 px-3 py-1 text-sm disabled:opacity-30"
    aria-label="Next verse"
  >
    →
  </button>
</div>
```

- [ ] **Step 3: Clear audio cache when reciter changes**

Add a `useEffect` to StudioPreview that resets the audio map when the reciter changes:

```tsx
useEffect(() => {
  setAudioMap(new Map());
  currentAudioRef.current?.pause();
  setIsPlaying(false);
}, [store.reciterId]);
```

- [ ] **Step 4: Run and verify**

```bash
npm run dev
```

Go to Studio with verses selected. Click Play — should hear recitation audio and see verse text change as each verse finishes playing. Pause should stop playback. Changing reciter should reset audio.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audio.ts src/components/StudioPreview.tsx
git commit -m "feat: add audio playback with verse progression in studio"
```

---

## Task 8: Video Export

**Files:**
- Create: `src/lib/export.ts`, `src/components/ExportButton.tsx`
- Modify: `src/components/StudioSettings.tsx`

- [ ] **Step 1: Create export logic**

Create `src/lib/export.ts`:

```ts
import { Verse, VideoFormat, Background } from "@/types";
import { getAudioUrl } from "./api";

const FORMAT_SIZES: Record<VideoFormat, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

interface ExportOptions {
  verses: Verse[];
  reciterFolder: string;
  surahNumber: number;
  videoFormat: VideoFormat;
  arabicFontSize: number;
  translationEnabled: boolean;
  translationFontSize: number;
  translationFont: string;
  textColor: string;
  overlayOpacity: number;
  background: Background;
  onProgress: (current: number, total: number) => void;
}

export async function exportVideo(options: ExportOptions): Promise<Blob> {
  const size = FORMAT_SIZES[options.videoFormat];
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d")!;

  const stream = canvas.captureStream(30);
  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();

  for (const track of destination.stream.getAudioTracks()) {
    stream.addTrack(track);
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
    videoBitsPerSecond: 5_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  for (let i = 0; i < options.verses.length; i++) {
    const verse = options.verses[i];
    options.onProgress(i + 1, options.verses.length);

    drawFrame(ctx, size.w, size.h, verse, options);

    const audioUrl = getAudioUrl(options.reciterFolder, options.surahNumber, verse.verse_number);

    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(destination);
      source.connect(audioCtx.destination);
      source.start();

      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
      });
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  recorder.stop();
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  audioCtx.close();
  return new Blob(chunks, { type: "video/webm" });
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  verse: Verse,
  options: ExportOptions
) {
  if (options.background.type === "solid") {
    ctx.fillStyle = options.background.value;
    ctx.fillRect(0, 0, w, h);
  } else if (options.background.type === "gradient") {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#1a1a2e");
    gradient.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
  }

  ctx.fillStyle = `rgba(0, 0, 0, ${options.overlayOpacity / 100})`;
  ctx.fillRect(0, 0, w, h);

  const scale = w / 480;
  const arabicSize = options.arabicFontSize * scale;
  ctx.fillStyle = options.textColor;
  ctx.font = `${arabicSize}px "Scheherazade New", "Amiri", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const centerY = options.translationEnabled ? h * 0.4 : h * 0.5;
  const maxWidth = w * 0.85;
  wrapText(ctx, verse.text_uthmani, w / 2, centerY, maxWidth, arabicSize * 1.8);

  if (options.translationEnabled && verse.translation) {
    const transSize = options.translationFontSize * scale;
    const fontFamily = options.translationFont === "serif" ? '"Georgia", serif' : '"Arial", sans-serif';
    ctx.font = `${transSize}px ${fontFamily}`;
    ctx.fillStyle = options.textColor + "cc";
    wrapText(ctx, verse.translation, w / 2, h * 0.7, maxWidth, transSize * 1.6);
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}
```

- [ ] **Step 2: Create ExportButton component**

Create `src/components/ExportButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { exportVideo } from "@/lib/export";

export function ExportButton() {
  const store = useAppStore();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const selectedVerses = store.verses.filter((v) =>
    store.selectedVerseNumbers.includes(v.verse_number)
  );

  const handleExport = async () => {
    if (selectedVerses.length === 0 || !store.surah) return;

    setExporting(true);
    const reciter = reciters.find((r) => r.id === store.reciterId);

    try {
      const blob = await exportVideo({
        verses: selectedVerses,
        reciterFolder: reciter?.folder ?? "Alafasy_128kbps",
        surahNumber: store.surah.id,
        videoFormat: store.videoFormat,
        arabicFontSize: store.arabicFontSize,
        translationEnabled: store.translationEnabled,
        translationFontSize: store.translationFontSize,
        translationFont: store.translationFont,
        textColor: store.textColor,
        overlayOpacity: store.overlayOpacity,
        background: store.background,
        onProgress: (current, total) => setProgress({ current, total }),
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ayahclip-${store.surah.name_simple}-${store.videoFormat}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting || selectedVerses.length === 0}
      className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-medium transition-colors hover:bg-emerald-500 disabled:opacity-50"
    >
      {exporting
        ? `Exporting... ${progress.current}/${progress.total}`
        : "Export Video"}
    </button>
  );
}
```

- [ ] **Step 3: Wire ExportButton into StudioSettings**

In `src/components/StudioSettings.tsx`, replace the existing export button at the bottom with:

```tsx
import { ExportButton } from "./ExportButton";
```

And replace the `<button>Export Video</button>` element with:

```tsx
<ExportButton />
```

- [ ] **Step 4: Run and verify export**

```bash
npm run dev
```

Full flow: Select verses → Open Studio → customize → click Export Video. Should see progress indicator, then a `.webm` file downloads with the recitation audio synced to verse text on the styled background.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export.ts src/components/ExportButton.tsx src/components/StudioSettings.tsx
git commit -m "feat: add client-side video export with audio sync"
```

---

## Task 9: Polish & Accessibility

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/globals.css`, various components

- [ ] **Step 1: Add Arabic web font**

Add to `src/app/layout.tsx`, inside the `<head>` via metadata or a `<link>`:

Update `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AyahClip",
  description: "Create beautiful Quran recitation clips for social media",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Scheherazade+New:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#0a0a0a] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Add font-arabic utility to Tailwind**

Update `tailwind.config.ts` — add to the `extend.fontFamily` section:

```ts
theme: {
  extend: {
    fontFamily: {
      arabic: ['"Amiri"', '"Scheherazade New"', 'serif'],
    },
  },
},
```

- [ ] **Step 3: Add global accessibility styles**

Append to `src/app/globals.css`:

```css
*:focus-visible {
  outline: 2px solid #10b981;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Run final verification**

```bash
npm run dev
```

Test full flow end-to-end:
1. Home page loads with 114 surahs
2. Search filters correctly
3. Click surah → verse page loads with Arabic + English
4. Select verses → floating bar appears
5. Open Studio → preview renders with styled text
6. All settings controls work (reciter, format, sliders, colors, backgrounds)
7. Play button plays audio with verse progression
8. Export generates and downloads a .webm file
9. Keyboard navigation works (Tab, Enter, Space)
10. Arabic text renders with proper font

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add Arabic web fonts, Tailwind config, and accessibility styles"
```
