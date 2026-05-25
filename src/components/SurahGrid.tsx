import { Surah } from "@/types";
import { SurahCard } from "./SurahCard";

export function SurahGrid({ surahs }: { surahs: Surah[] }) {
  if (surahs.length === 0) {
    return (
      <p className="py-12 text-center text-gray-500">No surahs found</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {surahs.map((surah) => (
        <SurahCard key={surah.id} surah={surah} />
      ))}
    </div>
  );
}
