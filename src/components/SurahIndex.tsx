import Link from "next/link";
import { Surah } from "@/types";

// Editorial index of the Quran: a ruled, typographic list (not a card grid).
// Each surah is a row — number in a left rail, large display name, quiet meta,
// Arabic name right-aligned — reading like a beautifully-set table of contents.
export function SurahIndex({ surahs }: { surahs: Surah[] }) {
  if (surahs.length === 0) {
    return (
      <div className="border-t border-[var(--hairline-soft)] py-20 text-center">
        <p className="font-display text-xl text-parchment">No surah matches</p>
        <p className="mt-2 text-sm text-[var(--muted)]">Try a different name or number.</p>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--hairline-soft)]">
      {surahs.map((surah, i) => (
        <div key={surah.id} className="rise" style={{ animationDelay: `${Math.min(i * 12, 360)}ms` }}>
          <SurahRow surah={surah} />
        </div>
      ))}
    </div>
  );
}

function SurahRow({ surah }: { surah: Surah }) {
  const meccan = surah.revelation_place === "makkah";
  const num = String(surah.id).padStart(2, "0");

  return (
    <Link
      href={`/surah/${surah.id}`}
      className="group grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 border-b border-[var(--hairline-soft)] px-2 py-4 transition-colors hover:bg-[rgba(201,162,75,0.05)] sm:gap-6 sm:px-3 sm:py-5"
    >
      <span className="font-display text-xs tabular-nums text-[var(--muted-deep)] transition-colors group-hover:text-gold-soft sm:text-sm">
        {num}
      </span>

      <div className="min-w-0">
        <h3 className="truncate font-display text-lg tracking-wide text-parchment transition-colors group-hover:text-gold-soft sm:text-2xl">
          {surah.name_simple}
        </h3>
        <p className="mt-0.5 truncate text-xs text-[var(--muted)] sm:text-sm">
          {surah.translated_name.name}
          <span className="px-1.5 text-gold/30">·</span>
          {surah.verses_count} verses
          <span className="px-1.5 text-gold/30">·</span>
          <span className={meccan ? "text-gold-soft/70" : "text-[var(--emerald-soft,#2f9279)]"}>
            {meccan ? "Meccan" : "Medinan"}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-3 sm:gap-5">
        <span dir="rtl" lang="ar" className="font-arabic text-xl text-gold-soft/90 sm:text-3xl">
          {surah.name_arabic}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="hidden h-4 w-4 shrink-0 -translate-x-1 text-gold-soft opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 sm:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
