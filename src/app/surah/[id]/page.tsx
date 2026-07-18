"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchSurahs, fetchVerses } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { getTranslationLanguage } from "@/lib/translations";
import { Surah, Verse } from "@/types";
import { VersePicker } from "@/components/VersePicker";
import { SelectionBar } from "@/components/SelectionBar";
import { ReciterSelect } from "@/components/ReciterSelect";

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
  const selectVerseRange = useAppStore((s) => s.selectVerseRange);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const setSurahStore = useAppStore((s) => s.setSurah);
  const setVersesStore = useAppStore((s) => s.setVerses);
  const reciterId = useAppStore((s) => s.reciterId);
  const setReciterId = useAppStore((s) => s.setReciterId);
  const translationLanguage = useAppStore((s) => s.translationLanguage);

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
  }, [clearSelection, setSurahStore, setVersesStore, surahId, translationLanguage]);

  return (
    <main className="bg-mihrab min-h-[calc(100dvh-65px)]">
      <div className="mx-auto max-w-5xl px-5 py-8 pb-32">
        <button
          onClick={() => router.push("/browse")}
          className="mb-6 flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-parchment"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m6 6-6-6 6-6" />
          </svg>
          All surahs
        </button>

        {loading ? (
          <div className="space-y-3">
            <div className="shimmer mx-auto mb-8 h-24 w-64 rounded-2xl" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shimmer h-28 rounded-2xl" />
            ))}
          </div>
        ) : surah ? (
          <>
            <header className="mb-8 text-center">
              <p className="font-arabic text-4xl text-gold-soft" dir="rtl">
                {surah.name_arabic}
              </p>
              <h1 className="mt-3 font-display text-3xl tracking-wide text-parchment">
                {surah.name_simple}
              </h1>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                {surah.translated_name.name}
              </p>
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--muted-deep)]">
                <span>{surah.verses_count} verses</span>
                <span className="text-gold/40">·</span>
                <span>{surah.revelation_place === "makkah" ? "Meccan" : "Medinan"}</span>
              </div>
              <div className="mx-auto mt-6 max-w-xs">
                <div className="gold-rule" />
              </div>
            </header>

            <section className="mb-7 grid gap-4 border-y border-[var(--hairline-soft)] py-4 sm:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] sm:items-center">
              <div>
                <h2 className="text-sm font-medium text-parchment">Choose the voice before editing</h2>
                <p className="mt-1 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
                  Every voice supports verse playback and export. The synced collection also unlocks precise word-part captions.
                </p>
              </div>
              <ReciterSelect
                value={reciterId}
                onChange={setReciterId}
                label="Recitation"
                showCatalogCount
              />
            </section>

            <VersePicker
              verses={verses}
              selectedNumbers={selectedVerseNumbers}
              onToggle={toggleVerse}
              onSelectRange={selectVerseRange}
              onSelectAll={selectAllVerses}
              onClear={clearSelection}
            />
          </>
        ) : (
          <p className="text-center text-[var(--muted)]">Surah not found</p>
        )}
      </div>

      <SelectionBar count={selectedVerseNumbers.length} />
    </main>
  );
}
