"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchSurahs } from "@/lib/api";
import { Surah } from "@/types";
import { SearchBar } from "@/components/SearchBar";

type Filter = "all" | "makkah" | "madinah";

// A few surahs people reach for most often, for a quick tap when not searching.
const POPULAR_IDS = [1, 36, 18, 55, 67, 112];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "makkah", label: "Meccan" },
  { id: "madinah", label: "Medinan" },
];

function SurahCard({ surah }: { surah: Surah }) {
  return (
    <Link
      href={`/surah/${surah.id}`}
      className="group flex items-center gap-3.5 rounded-2xl border border-[var(--hairline-soft)] bg-white/[0.02] p-3.5 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-[var(--gold)] hover:bg-[rgba(201,162,75,0.05)] focus-visible:outline-none focus-visible:border-[var(--gold)]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--ink-deep)] text-sm font-medium tabular-nums text-gold-soft transition-colors group-hover:border-[var(--gold)]">
        {surah.id}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-parchment">{surah.name_simple}</span>
          <span dir="rtl" lang="ar" className="font-arabic shrink-0 text-base leading-none text-gold-soft/85">
            {surah.name_arabic}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span className="truncate">{surah.translated_name.name}</span>
          <span className="text-[var(--muted-deep)]">·</span>
          <span className="shrink-0 tabular-nums">{surah.verses_count} ayahs</span>
          <span className="text-[var(--muted-deep)]">·</span>
          <span className="shrink-0">{surah.revelation_place === "makkah" ? "Meccan" : "Medinan"}</span>
        </span>
      </span>
    </Link>
  );
}

export default function BrowsePage() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
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

  const searching = search.trim() !== "";
  const active = searching || filter !== "all";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return surahs.filter((s) => {
      const matchesFilter =
        filter === "all" ? true : filter === "makkah" ? s.revelation_place === "makkah" : s.revelation_place !== "makkah";
      const matchesSearch =
        !q ||
        s.name_simple.toLowerCase().includes(q) ||
        s.name_arabic.includes(search) ||
        s.translated_name.name.toLowerCase().includes(q) ||
        String(s.id) === q;
      return matchesFilter && matchesSearch;
    });
  }, [surahs, search, filter]);

  const popular = useMemo(
    () => POPULAR_IDS.map((id) => surahs.find((s) => s.id === id)).filter((s): s is Surah => Boolean(s)),
    [surahs],
  );

  return (
    <main className="bg-mihrab min-h-[calc(100dvh-69px)]">
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-12">
        {/* Header — title left, quick count right, so the top row is balanced. */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-gold">The Noble Quran</p>
            <h1 className="font-display mt-3 text-[clamp(2rem,5vw,3rem)] leading-[1.05] tracking-wide text-parchment">
              Choose a surah
            </h1>
            <p className="mt-3 max-w-md leading-relaxed text-[var(--muted)]">
              Search by name or number, then pick your verses.
            </p>
          </div>
          {!loading && !loadError && (
            <span className="rounded-full border border-[var(--hairline-soft)] px-3 py-1 text-xs text-[var(--muted)]">
              114 surahs
            </span>
          )}
        </header>

        {/* Sticky search + filter (under the 69px site nav). */}
        <div className="sticky top-[69px] z-20 -mx-5 mb-4 mt-7 border-y border-[var(--hairline-soft)] bg-[var(--ink)]/85 px-5 py-3 backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <SearchBar value={search} onChange={setSearch} />
            </div>
            <div className="flex gap-1 self-start rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1 sm:self-auto">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={`min-h-9 rounded-full px-3.5 text-sm transition-colors ${
                    filter === f.id ? "bg-gold text-ink-deep" : "text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bring your own recitation — an entry point next to picking a surah. */}
        {!loading && !loadError && !active && (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-[var(--hairline)] bg-[rgba(201,162,75,0.05)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] text-gold-soft">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 15V4M8 8l4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-medium text-parchment">Have your own recitation?</p>
                <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">
                  Upload an audio or video clip and AyahClip finds the verses for you.
                </p>
              </div>
            </div>
            <Link href="/import" className="btn-gold inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm">
              Upload audio or clip
            </Link>
          </div>
        )}

        {/* Popular quick-picks — only when idle, to give the page landmarks. */}
        {!loading && !loadError && !active && popular.length > 0 && (
          <section className="mb-6" aria-label="Popular surahs">
            <p className="mb-2.5 px-1 text-[11px] font-medium uppercase tracking-[0.2em] text-gold-soft/70">Popular</p>
            <div className="flex flex-wrap gap-2">
              {popular.map((s) => (
                <Link
                  key={s.id}
                  href={`/surah/${s.id}`}
                  className="flex items-center gap-2 rounded-full border border-[var(--hairline-soft)] bg-white/[0.02] px-3.5 py-2 text-sm text-parchment transition-colors hover:border-[var(--gold)] hover:bg-[rgba(201,162,75,0.06)]"
                >
                  <span className="text-xs tabular-nums text-gold-soft/80">{s.id}</span>
                  <span>{s.name_simple}</span>
                  <span dir="rtl" lang="ar" className="font-arabic text-gold-soft/75">{s.name_arabic}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Result count while searching/filtering. */}
        {!loading && !loadError && active && (
          <p className="mb-3 px-1 text-xs uppercase tracking-[0.2em] text-[var(--muted-deep)]">
            {filtered.length} {filtered.length === 1 ? "surah" : "surahs"}
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
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
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
            <p className="text-base font-medium text-parchment">No surah matches “{search}”</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Try a different name, or the surah number.</p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
              className="btn-ghost mt-5 min-h-10 rounded-full px-5 text-sm"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((surah) => (
              <SurahCard key={surah.id} surah={surah} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
