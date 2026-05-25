import Link from "next/link";
import { Surah } from "@/types";

export function SurahCard({ surah }: { surah: Surah }) {
  return (
    <Link
      href={`/surah/${surah.id}`}
      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:bg-white/10"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-sm font-medium">
          {surah.id}
        </div>
        <div>
          <p className="font-medium">{surah.name_simple}</p>
          <p className="text-xs text-gray-400">
            {surah.verses_count} verses · {surah.revelation_place === "makkah" ? "Meccan" : "Medinan"}
          </p>
        </div>
      </div>
      <p className="text-lg text-gray-300" style={{ fontFamily: '"Amiri", serif' }}>{surah.name_arabic}</p>
    </Link>
  );
}
