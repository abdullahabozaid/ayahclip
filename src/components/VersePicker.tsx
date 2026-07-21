"use client";

import { useEffect, useState } from "react";
import { Verse } from "@/types";

interface VersePickerProps {
  verses: Verse[];
  selectedNumbers: number[];
  onToggle: (n: number) => void;
  onSelectRange: (from: number, to: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

interface VersePreviewProps {
  verse: Verse | undefined;
  verseNumber: number;
  selected: boolean;
  onToggle: () => void;
}

function VersePreview({ verse, verseNumber, selected, onToggle }: VersePreviewProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--hairline-soft)] bg-[var(--surface)]">
      <div className="flex min-h-12 items-center justify-between border-b border-[var(--hairline-soft)] px-4 py-2.5 sm:px-5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-gold-soft/75">
          Ayah {verseNumber}
        </span>
        {verse && (
          <button
            onClick={onToggle}
            aria-pressed={selected}
            className={`min-h-10 rounded-full px-3 text-xs transition-colors sm:min-h-8 ${
              selected
                ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                : "btn-ghost"
            }`}
          >
            {selected ? "Selected" : "Add ayah"}
          </button>
        )}
      </div>
      <div className="max-h-[360px] overflow-y-auto px-4 py-5 sm:px-5">
        {verse ? (
          <>
            <p
              className="font-arabic text-right text-2xl leading-[2.15] text-parchment"
              dir="rtl" lang="ar"
            >
              {verse.text_uthmani}
            </p>
            {verse.translation && (
              <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
                {verse.translation}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">Choose an ayah to preview its text.</p>
        )}
      </div>
    </div>
  );
}

export function VersePicker({
  verses,
  selectedNumbers,
  onToggle,
  onSelectRange,
  onSelectAll,
  onClear,
}: VersePickerProps) {
  const [anchor, setAnchor] = useState<number | null>(null);
  const [preview, setPreview] = useState<number>(verses[0]?.verse_number ?? 1);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeMessage, setRangeMessage] = useState("");
  const [individualOpen, setIndividualOpen] = useState(() => verses.length <= 40);

  useEffect(() => {
    setPreview(verses[0]?.verse_number ?? 1);
    setIndividualOpen(verses.length <= 40);
  }, [verses]);

  const total = verses.length;
  const clamp = (n: number) => Math.max(1, Math.min(total, n));

  const applyRange = () => {
    if (!rangeFrom && !rangeTo) return;
    const f = clamp(parseInt(rangeFrom || rangeTo) || 1);
    const t = clamp(parseInt(rangeTo || rangeFrom) || f);
    onSelectRange(f, t);
    const lo = Math.min(f, t);
    const hi = Math.max(f, t);
    setPreview(lo);
    setRangeMessage(hi === lo ? `Ayah ${lo} selected.` : `Ayahs ${lo}–${hi} selected.`);
    setRangeFrom("");
    setRangeTo("");
  };

  const selectedSet = new Set(selectedNumbers);
  const allSelected = selectedNumbers.length === verses.length && verses.length > 0;
  const previewVerse = verses.find((v) => v.verse_number === preview);

  const handleChip = (n: number, shift: boolean) => {
    setPreview(n);
    if (shift && anchor !== null) {
      onSelectRange(anchor, n);
    } else {
      onToggle(n);
      setAnchor(n);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
      <div className="min-w-0 space-y-5">
        <section aria-labelledby="ayah-range-heading" className="border-y border-[var(--hairline-soft)] py-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="ayah-range-heading" className="text-sm font-medium text-parchment">
                Choose a continuous passage
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                Most clips use neighbouring ayahs. Enter the first and last ayah in the passage.
              </p>
            </div>
            {selectedNumbers.length > 0 && (
              <button
                onClick={onClear}
                className="min-h-10 rounded-full px-3 text-xs text-[var(--muted)] transition-colors hover:text-parchment"
              >
                Clear {selectedNumbers.length} selected
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(110px,150px)_minmax(110px,150px)_auto] sm:items-end">
            <label className="grid gap-1.5 text-xs text-[var(--muted)]">
              First ayah
              <input
                type="number"
                min={1}
                max={total}
                value={rangeFrom}
                onChange={(event) => setRangeFrom(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && applyRange()}
                placeholder="1"
                className="field min-h-11 w-full px-3 text-sm tabular-nums"
              />
            </label>
            <label className="grid gap-1.5 text-xs text-[var(--muted)]">
              Last ayah
              <input
                type="number"
                min={1}
                max={total}
                value={rangeTo}
                onChange={(event) => setRangeTo(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && applyRange()}
                placeholder={String(total)}
                className="field min-h-11 w-full px-3 text-sm tabular-nums"
              />
            </label>
            <button
              onClick={applyRange}
              disabled={!rangeFrom && !rangeTo}
              className="btn-gold col-span-2 min-h-11 rounded-full px-5 text-sm disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-1"
            >
              Add passage
            </button>
          </div>
          <p className="mt-2 min-h-4 text-xs text-emerald-soft" role="status" aria-live="polite">
            {rangeMessage}
          </p>
        </section>

        <div className="lg:hidden">
          <VersePreview
            verse={previewVerse}
            verseNumber={preview}
            selected={selectedSet.has(preview)}
            onToggle={() => handleChip(preview, false)}
          />
        </div>

        <details
          className="group"
          open={individualOpen}
          onToggle={(event) => setIndividualOpen(event.currentTarget.open)}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold/60 [&::-webkit-details-marker]:hidden">
            <span>
              Pick individual ayahs
              <span className="ml-2 text-xs text-[var(--muted-deep)]">{total} available</span>
            </span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </summary>

          <div className="mt-2 border-t border-[var(--hairline-soft)] pt-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--muted-deep)]">
                Tap to select. On desktop, shift-click a second ayah to fill the gap.
              </p>
              <button
                onClick={allSelected ? onClear : onSelectAll}
                className="btn-ghost min-h-10 rounded-full px-3 text-xs sm:min-h-8"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>

            <div
              role="region"
              className="max-h-[min(52dvh,540px)] overflow-y-auto overscroll-contain pr-1"
              aria-label="Individual ayahs"
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5">
                {verses.map((verse) => {
                  const number = verse.verse_number;
                  const selected = selectedSet.has(number);
                  const isPreview = preview === number;
                  return (
                    <button
                      key={verse.id}
                      onMouseEnter={() => setPreview(number)}
                      onFocus={() => setPreview(number)}
                      onClick={(event) => handleChip(number, event.shiftKey)}
                      aria-pressed={selected}
                      className={`relative flex h-11 items-center justify-center rounded-lg border text-sm tabular-nums transition-colors ${
                        selected
                          ? "border-[var(--gold)] bg-[var(--gold)] font-medium text-[var(--ink-deep)]"
                          : isPreview
                            ? "border-[var(--gold)]/50 bg-[var(--gold)]/[0.08] text-parchment"
                            : "border-[var(--hairline-soft)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--hairline)] hover:text-parchment"
                      }`}
                    >
                      {number}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </details>
      </div>

      <div className="hidden lg:sticky lg:top-[88px] lg:block lg:self-start">
        <VersePreview
          verse={previewVerse}
          verseNumber={preview}
          selected={selectedSet.has(preview)}
          onToggle={() => handleChip(preview, false)}
        />
      </div>
    </div>
  );
}
