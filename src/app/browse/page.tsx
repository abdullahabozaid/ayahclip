"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchSurahs } from "@/lib/api";
import { Surah } from "@/types";
import { SearchBar } from "@/components/SearchBar";
import { JuzAccordion, type JuzGroup } from "@/components/JuzAccordion";
import { JUZ_COUNT, JUZ_SURAH_RANGE, isSurahInJuz } from "@/lib/juz";

type Filter = "all" | "makkah" | "madinah";

export default function BrowsePage() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openJuz, setOpenJuz] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    fetchSurahs()
      .then((data) => {
        if (!active) return;
        setSurahs(data);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  // Static "first surah — last surah" label for each Juz (independent of filters).
  const rangeLabel = useMemo(() => {
    const labels: Record<number, string> = {};
    for (let j = 1; j <= JUZ_COUNT; j++) {
      const [a, b] = JUZ_SURAH_RANGE[j];
      const first = surahs.find((s) => s.id === a)?.name_simple;
      const last = surahs.find((s) => s.id === b)?.name_simple;
      labels[j] = !first ? "" : a === b || !last ? first : `${first} — ${last}`;
    }
    return labels;
  }, [surahs]);

  // Group surahs into their ajzā', applying the active filter + search.
  const groups: JuzGroup[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesFilter = (s: Surah) =>
      filter === "all"
        ? true
        : filter === "makkah"
          ? s.revelation_place === "makkah"
          : s.revelation_place !== "makkah";
    const matchesSearch = (s: Surah) =>
      !q ||
      s.name_simple.toLowerCase().includes(q) ||
      s.name_arabic.includes(search) ||
      s.translated_name.name.toLowerCase().includes(q) ||
      String(s.id) === q;

    return Array.from({ length: JUZ_COUNT }, (_, i) => i + 1).map((juz) => ({
      juz,
      rangeLabel: rangeLabel[juz] ?? "",
      surahs: surahs.filter((s) => isSurahInJuz(s.id, juz) && matchesFilter(s) && matchesSearch(s)),
    }));
  }, [surahs, search, filter, rangeLabel]);

  const searching = search.trim() !== "";
  const active = searching || filter !== "all";
  // When searching/filtering, only show Juz bars that actually contain matches.
  const visibleGroups = active ? groups.filter((g) => g.surahs.length > 0) : groups;
  const matchCount = groups.reduce((sum, g) => sum + g.surahs.length, 0);

  // A bar is open if the user opened it, or — while searching — it holds a match.
  const isOpen = (juz: number) =>
    openJuz.has(juz) || (searching && (groups[juz - 1]?.surahs.length ?? 0) > 0);

  const toggle = (juz: number) =>
    setOpenJuz((prev) => {
      const next = new Set(prev);
      if (next.has(juz)) next.delete(juz);
      else next.add(juz);
      return next;
    });

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "makkah", label: "Meccan" },
    { id: "madinah", label: "Medinan" },
  ];

  return (
    <main className="bg-mihrab min-h-[calc(100dvh-69px)]">
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-12">
        {/* Header */}
        <header className="rise">
          <p className="text-xs uppercase tracking-[0.32em] text-gold">The Noble Quran</p>
          <h1 className="font-display mt-4 text-[clamp(2.25rem,6vw,3.5rem)] leading-[1.05] tracking-wide text-parchment">
            Choose a surah
          </h1>
          <p className="mt-3 max-w-md text-pretty leading-relaxed text-[var(--muted)]">
            Open a Juz to find its surahs, or search by name or number — the right
            Juz opens for you.
          </p>
        </header>

        {/* Sticky search + filter bar (sits under the 69px site nav). */}
        <div
          className="rise sticky top-[69px] z-20 -mx-5 mb-3 mt-8 border-y border-[var(--hairline-soft)] bg-[var(--ink)]/85 px-5 py-3 backdrop-blur-xl"
          style={{ animationDelay: "80ms" }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchBar value={search} onChange={setSearch} />
            <div className="flex items-center gap-2">
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
            </div>
          </div>
        </div>

        {/* Quiet result count while searching/filtering. */}
        {!loading && active && (
          <p className="mb-2 px-1 text-xs uppercase tracking-[0.2em] text-[var(--muted-deep)]">
            {matchCount} {matchCount === 1 ? "surah" : "surahs"} found
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shimmer h-[72px] rounded-2xl" />
            ))}
          </div>
        ) : loadError ? (
          <section role="alert" className="border-y border-[var(--hairline-soft)] py-10 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-soft/75">Connection interrupted</p>
            <h2 className="mt-3 text-xl font-medium text-parchment">Couldn’t load the Quran index</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
              Check your connection and try again. No media or project data leaves this browser.
            </p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="btn-gold mt-6 min-h-11 rounded-full px-6 text-sm"
            >
              Try again
            </button>
          </section>
        ) : (
          <JuzAccordion groups={visibleGroups} isOpen={isOpen} onToggle={toggle} />
        )}
      </div>
    </main>
  );
}
