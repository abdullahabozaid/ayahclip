import { Verse } from "@/types";

interface VerseCardProps {
  verse: Verse;
  selected: boolean;
  onToggle: () => void;
}

export function VerseCard({ verse, selected, onToggle }: VerseCardProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-full rounded-lg border p-4 text-left transition-colors ${
        selected
          ? "border-emerald-500/50 bg-emerald-500/10"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
      aria-pressed={selected}
      aria-label={`Verse ${verse.verse_number}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs ${
            selected
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-white/20 text-gray-400"
          }`}
        >
          {selected ? "✓" : verse.verse_number}
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-right text-xl leading-loose" dir="rtl" style={{ fontFamily: '"Amiri", serif' }}>
            {verse.text_uthmani}
          </p>
          {verse.translation && (
            <p className="text-sm leading-relaxed text-gray-400">
              {verse.verse_number}. {verse.translation}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
