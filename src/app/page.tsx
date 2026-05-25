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
