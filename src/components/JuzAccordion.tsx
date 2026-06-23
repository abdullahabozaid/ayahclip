"use client";

import Link from "next/link";
import { Surah } from "@/types";

export interface JuzGroup {
  juz: number;
  /** Static surah-name span of this Juz, e.g. "An-Naba — An-Nas". */
  rangeLabel: string;
  /** Surahs in this Juz that pass the current search + filter. */
  surahs: Surah[];
}

// FAQ-style accordion of the 30 ajzā'. Each bar opens to reveal the surahs in
// that Juz; searching auto-opens the bars that contain a match.
export function JuzAccordion({
  groups,
  isOpen,
  onToggle,
}: {
  groups: JuzGroup[];
  isOpen: (juz: number) => boolean;
  onToggle: (juz: number) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="panel px-8 py-16 text-center">
        <p className="font-display text-xl text-parchment">No surah matches</p>
        <p className="mt-2 text-sm text-[var(--muted)]">Try a different name or number.</p>
      </div>
    );
  }

  return (
    // Two bars per row on desktop (Juz 1 left, Juz 2 right …); items-start so an
    // opened bar grows downward without stretching its collapsed neighbour.
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:items-start">
      {groups.map((g) => (
        <JuzBar key={g.juz} group={g} open={isOpen(g.juz)} onToggle={() => onToggle(g.juz)} />
      ))}
    </div>
  );
}

function JuzBar({
  group,
  open,
  onToggle,
}: {
  group: JuzGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const { juz, rangeLabel, surahs } = group;
  return (
    <div className={`panel overflow-hidden transition-colors ${open ? "border-[var(--hairline)]" : ""}`}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-[rgba(201,162,75,0.04)] sm:px-5"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-[var(--ink-deep)] font-display text-sm text-gold-soft sm:h-11 sm:w-11">
          {juz}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base tracking-wide text-parchment sm:text-lg">
            Juz {juz}
          </span>
          {rangeLabel && (
            <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{rangeLabel}</span>
          )}
        </span>
        <span className="hidden shrink-0 text-xs text-[var(--muted-deep)] sm:block">
          {surahs.length} {surahs.length === 1 ? "surah" : "surahs"}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-gold-soft/70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[var(--hairline-soft)]">
          {surahs.length === 0 ? (
            <p className="px-5 py-5 text-sm text-[var(--muted)]">Nothing here in this filter.</p>
          ) : (
            surahs.map((surah) => <SurahRow key={surah.id} surah={surah} />)
          )}
        </div>
      )}
    </div>
  );
}

function SurahRow({ surah }: { surah: Surah }) {
  const meccan = surah.revelation_place === "makkah";
  return (
    <Link
      href={`/surah/${surah.id}`}
      className="group flex items-center gap-4 border-b border-[var(--hairline-soft)] px-4 py-3 transition-colors last:border-b-0 hover:bg-[rgba(201,162,75,0.05)] sm:px-5"
    >
      <span className="w-7 shrink-0 text-right font-display text-xs tabular-nums text-[var(--muted-deep)] transition-colors group-hover:text-gold-soft">
        {surah.id}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-base text-parchment transition-colors group-hover:text-gold-soft">
          {surah.name_simple}
        </h3>
        <p className="truncate text-[11px] text-[var(--muted)]">
          {surah.translated_name.name}
          <span className="px-1 text-gold/30">·</span>
          {surah.verses_count} verses
          <span className="px-1 text-gold/30">·</span>
          <span className={meccan ? "text-gold-soft/70" : "text-[var(--emerald-soft,#2f9279)]"}>
            {meccan ? "Meccan" : "Medinan"}
          </span>
        </p>
      </div>
      <span dir="rtl" lang="ar" className="font-arabic shrink-0 text-lg text-gold-soft/90">
        {surah.name_arabic}
      </span>
    </Link>
  );
}
