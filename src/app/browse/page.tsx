"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchSurahs } from "@/lib/api";
import { Surah } from "@/types";
import { SearchBar } from "@/components/SearchBar";
import { SurahIndex } from "@/components/SurahIndex";
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
    { id: "all", label: "All" },
    { id: "makkah", label: "Meccan" },
    { id: "madinah", label: "Medinan" },
  ];

  return (
    <main className="bg-mihrab min-h-[calc(100dvh-69px)]">
      <div className="mx-auto max-w-4xl px-5 pb-24 pt-12">
        {/* Editorial header */}
        <header className="rise">
          <p className="text-xs uppercase tracking-[0.32em] text-gold">The Noble Quran</p>
          <h1 className="font-display mt-4 text-[clamp(2.25rem,6vw,3.5rem)] leading-[1.05] tracking-wide text-parchment">
            Choose a surah
          </h1>
          <p className="mt-3 max-w-md text-pretty leading-relaxed text-[var(--muted)]">
            All 114 chapters of the Quran. Open one, then select the verses to
            bring to life.
          </p>
        </header>

        {/* Sticky filter bar — sits just under the site nav (69px). */}
        <div
          className="rise sticky top-[69px] z-20 -mx-5 mt-8 mb-2 border-y border-[var(--hairline-soft)] bg-[var(--ink)]/85 px-5 py-3 backdrop-blur-xl"
          style={{ animationDelay: "80ms" }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchBar value={search} onChange={setSearch} />
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                      filter === f.id
                        ? "bg-gold text-ink-deep"
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
                className={`rounded-full border bg-[var(--ink-deep)] px-3.5 py-2 text-sm transition-colors ${
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
        </div>

        {/* Result count — quiet editorial metadata. */}
        {!loading && (
          <p className="mb-1 px-2 text-xs uppercase tracking-[0.2em] text-[var(--muted-deep)]">
            {filtered.length === 114
              ? "114 surahs"
              : `${filtered.length} of 114`}
          </p>
        )}

        {loading ? (
          <div className="border-t border-[var(--hairline-soft)]">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-6 border-b border-[var(--hairline-soft)] px-3 py-5"
              >
                <div className="shimmer h-4 w-6 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="shimmer h-5 w-40 rounded" />
                  <div className="shimmer h-3 w-56 rounded" />
                </div>
                <div className="shimmer h-6 w-16 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <SurahIndex surahs={filtered} />
        )}
      </div>
    </main>
  );
}
