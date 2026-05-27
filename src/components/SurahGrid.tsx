import { Surah } from "@/types";
import { SurahCard } from "./SurahCard";

export function SurahGrid({ surahs }: { surahs: Surah[] }) {
  if (surahs.length === 0) {
    return (
      <div className="panel px-8 py-16 text-center">
        <p className="font-display text-xl text-parchment">No surahs found</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Try a different name or number.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {surahs.map((surah, i) => (
        <div key={surah.id} className="rise" style={{ animationDelay: `${Math.min(i * 18, 400)}ms` }}>
          <SurahCard surah={surah} />
        </div>
      ))}
    </div>
  );
}
