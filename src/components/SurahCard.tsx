import Link from "next/link";
import { Surah } from "@/types";

export function SurahCard({ surah }: { surah: Surah }) {
  const meccan = surah.revelation_place === "makkah";

  return (
    <Link
      href={`/surah/${surah.id}`}
      className="card-lift panel group flex items-center gap-4 p-4"
    >
      {/* Numbered medallion */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-[var(--ink-deep)] transition-colors group-hover:border-gold/55">
        <span className="font-display text-sm text-gold-soft">{surah.id}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-display text-lg tracking-wide text-parchment">
            {surah.name_simple}
          </h3>
          <span
            className="font-arabic shrink-0 text-xl text-gold-soft/90"
            dir="rtl"
          >
            {surah.name_arabic}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="truncate">{surah.translated_name.name}</span>
          <span className="text-gold/30">·</span>
          <span className="shrink-0">{surah.verses_count} verses</span>
          <span className="text-gold/30">·</span>
          <span
            className={`shrink-0 ${meccan ? "text-gold-soft/70" : "text-[var(--emerald-soft,#2f9279)]"}`}
          >
            {meccan ? "Meccan" : "Medinan"}
          </span>
        </div>
      </div>
    </Link>
  );
}
