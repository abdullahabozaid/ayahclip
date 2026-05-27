"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchSurahs } from "@/lib/api";
import { Surah } from "@/types";
import { SearchBar } from "@/components/SearchBar";
import { SurahGrid } from "@/components/SurahGrid";
import { JUZ_COUNT, isSurahInJuz } from "@/lib/juz";

type Filter = "all" | "makkah" | "madinah";

export default function BrowsePage() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [juz, setJuz] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSurahs().then((data) => {
      setSurahs(data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    let list = surahs;
    if (filter !== "all") {
      list = list.filter((s) =>
        filter === "makkah"
          ? s.revelation_place === "makkah"
          : s.revelation_place !== "makkah"
      );
    }
    if (juz !== "all") {
      list = list.filter((s) => isSurahInJuz(s.id, juz));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name_simple.toLowerCase().includes(q) ||
          s.name_arabic.includes(search) ||
          s.translated_name.name.toLowerCase().includes(q) ||
          String(s.id) === q
      );
    }
    return list;
  }, [surahs, search, filter, juz]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All 114" },
    { id: "makkah", label: "Meccan" },
    { id: "madinah", label: "Medinan" },
  ];

  return (
    <main className="bg-mihrab min-h-[calc(100dvh-65px)]">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <header className="rise mb-8">
          <p className="mb-2 text-sm uppercase tracking-[0.25em] text-gold-soft/70">
            The Noble Quran
          </p>
          <h1 className="font-display text-4xl tracking-wide text-parchment sm:text-5xl">
            Choose a surah
          </h1>
          <p className="mt-3 max-w-lg text-[var(--muted)]">
            Browse all 114 chapters, then select the verses you want to bring to
            life.
          </p>
        </header>

        <div className="rise mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" style={{ animationDelay: "80ms" }}>
          <SearchBar value={search} onChange={setSearch} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1">
              {filters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                    filter === f.id
                      ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                      : "text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select
              value={juz}
              onChange={(e) => setJuz(e.target.value === "all" ? "all" : Number(e.target.value))}
              aria-label="Filter by Juz"
              className={`rounded-full border bg-[var(--ink-deep)] px-4 py-1.5 text-sm transition-colors ${
                juz === "all"
                  ? "border-[var(--hairline-soft)] text-[var(--muted)]"
                  : "border-gold/60 text-gold-soft"
              }`}
            >
              <option value="all" className="bg-[var(--surface)] text-parchment">
                All Juz
              </option>
              {Array.from({ length: JUZ_COUNT }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n} className="bg-[var(--surface)] text-parchment">
                  Juz {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="shimmer h-[88px] rounded-2xl" />
            ))}
          </div>
        ) : (
          <SurahGrid surahs={filtered} />
        )}
      </div>
    </main>
  );
}
