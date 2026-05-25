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
        onClick={() => router.push("/browse")}
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
            <p className="text-2xl text-gray-300" style={{ fontFamily: '"Amiri", serif' }}>
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
