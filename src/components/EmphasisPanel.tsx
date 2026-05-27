"use client";

import { useAppStore } from "@/lib/store";
import { splitWords } from "@/lib/canvas-utils";

export function EmphasisPanel() {
  const store = useAppStore();
  const selectedVerses = store.verses.filter((v) =>
    store.selectedVerseNumbers.includes(v.verse_number)
  );
  const verse = selectedVerses[store.currentVerseIndex] ?? selectedVerses[0];

  if (!verse) {
    return <p className="text-[11px] text-[var(--muted-deep)]">Select a verse first.</p>;
  }

  const key = verse.verse_key;
  const emphasis = store.emphasis[key] ?? { arabic: [], translation: [] };
  const arabicWords = splitWords(verse.text_uthmani);
  const translationWords = verse.translation ? splitWords(verse.translation) : [];
  const hasAny = emphasis.arabic.length > 0 || emphasis.translation.length > 0;

  const Word = ({
    text,
    active,
    onClick,
    rtl,
  }: {
    text: string;
    active: boolean;
    onClick: () => void;
    rtl?: boolean;
  }) => (
    <button
      onClick={onClick}
      dir={rtl ? "rtl" : undefined}
      className={`rounded-md border px-2 py-1 text-sm transition-colors ${
        rtl ? "font-arabic text-base leading-tight" : ""
      } ${
        active
          ? "border-[var(--gold)] bg-[var(--gold)]/15 text-parchment"
          : "border-[var(--hairline-soft)] text-[var(--muted)] hover:border-[var(--hairline)]"
      }`}
    >
      {text}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Style + colour */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["color", "underline"] as const).map((s) => (
            <button
              key={s}
              onClick={() => store.setEmphasisStyle(s)}
              className={`rounded-lg border px-3 py-1.5 text-xs capitalize transition-colors ${
                store.emphasisStyle === s
                  ? "border-[var(--gold)] bg-[var(--gold)]/10 text-parchment"
                  : "border-[var(--hairline-soft)] text-[var(--muted)] hover:border-[var(--hairline)]"
              }`}
            >
              {s === "color" ? "Highlight" : "Underline"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          Colour
          <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-[var(--hairline)]">
            <span className="absolute inset-0" style={{ background: store.emphasisColor }} />
            <input
              type="color"
              value={store.emphasisColor}
              onChange={(e) => store.setEmphasisColor(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </label>
      </div>

      {/* Arabic words */}
      <div>
        <p className="mb-2 text-xs text-[var(--muted)]">Tap an Arabic word to emphasise</p>
        <div className="flex flex-row-reverse flex-wrap gap-1.5">
          {arabicWords.map((w, i) => (
            <Word
              key={i}
              text={w}
              rtl
              active={emphasis.arabic.includes(i)}
              onClick={() => store.toggleEmphasisWord(key, "arabic", i)}
            />
          ))}
        </div>
      </div>

      {/* Translation words */}
      {translationWords.length > 0 && store.translationEnabled && (
        <div>
          <p className="mb-2 text-xs text-[var(--muted)]">Tap a translation word</p>
          <div className="flex flex-wrap gap-1.5">
            {translationWords.map((w, i) => (
              <Word
                key={i}
                text={w}
                active={emphasis.translation.includes(i)}
                onClick={() => store.toggleEmphasisWord(key, "translation", i)}
              />
            ))}
          </div>
        </div>
      )}

      {hasAny && (
        <button
          onClick={() => store.clearVerseEmphasis(key)}
          className="text-xs text-[var(--muted)] transition-colors hover:text-parchment"
        >
          Clear emphasis on this verse
        </button>
      )}
    </div>
  );
}
