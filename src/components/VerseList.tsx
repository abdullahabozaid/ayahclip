import { Verse } from "@/types";
import { VerseCard } from "./VerseCard";

interface VerseListProps {
  verses: Verse[];
  selectedNumbers: number[];
  onToggle: (verseNumber: number) => void;
}

export function VerseList({ verses, selectedNumbers, onToggle }: VerseListProps) {
  return (
    <div className="space-y-2">
      {verses.map((verse) => (
        <VerseCard
          key={verse.id}
          verse={verse}
          selected={selectedNumbers.includes(verse.verse_number)}
          onToggle={() => onToggle(verse.verse_number)}
        />
      ))}
    </div>
  );
}
