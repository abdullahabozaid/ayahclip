"use client";

import { useState } from "react";
import { Verse } from "@/types";

interface VersePickerProps {
  verses: Verse[];
  selectedNumbers: number[];
  onToggle: (n: number) => void;
  onSelectRange: (from: number, to: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
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

  const total = verses.length;
  const clamp = (n: number) => Math.max(1, Math.min(total, n));

  const applyRange = () => {
    if (!rangeFrom && !rangeTo) return;
    const f = clamp(parseInt(rangeFrom) || 1);
    const t = clamp(parseInt(rangeTo) || total);
    onSelectRange(f, t);
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
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,360px)]">
      {/* Number pad */}
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            onClick={allSelected ? onClear : onSelectAll}
            className="btn-ghost rounded-full px-4 py-2 text-sm"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          {selectedNumbers.length > 0 && (
            <button
              onClick={onClear}
              className="rounded-full px-4 py-2 text-sm text-[var(--muted)] transition-colors hover:text-parchment"
            >
              Clear
            </button>
          )}

          {/* Explicit range — works on touch and desktop */}
          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] py-1 pl-3 pr-1">
            <span className="text-xs text-[var(--muted)]">Range</span>
            <input
              type="number"
              min={1}
              max={total}
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyRange()}
              placeholder="1"
              className="field w-12 px-1 py-1 text-center text-sm placeholder-[var(--muted-deep)]"
            />
            <span className="text-[var(--muted-deep)]">–</span>
            <input
              type="number"
              min={1}
              max={total}
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyRange()}
              placeholder={String(total)}
              className="field w-12 px-1 py-1 text-center text-sm placeholder-[var(--muted-deep)]"
            />
            <button
              onClick={applyRange}
              className="btn-gold rounded-full px-3 py-1 text-xs"
            >
              Add
            </button>
          </div>
        </div>

        <p className="mb-3 text-xs text-[var(--muted-deep)]">
          Tap a number to add it · <span className="text-gold-soft/70">shift-click</span> a second to fill the gap
        </p>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5">
          {verses.map((v) => {
            const n = v.verse_number;
            const sel = selectedSet.has(n);
            const isPreview = preview === n;
            return (
              <button
                key={v.id}
                onMouseEnter={() => setPreview(n)}
                onClick={(e) => handleChip(n, e.shiftKey)}
                aria-pressed={sel}
                className={`relative flex h-11 items-center justify-center rounded-lg border text-sm tabular-nums transition-all ${
                  sel
                    ? "border-[var(--gold)] bg-[var(--gold)] font-medium text-[var(--ink-deep)]"
                    : isPreview
                      ? "border-[var(--gold)]/50 bg-[var(--gold)]/[0.08] text-parchment"
                      : "border-[var(--hairline-soft)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--hairline)] hover:text-parchment"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview pane */}
      <div className="lg:sticky lg:top-[88px] lg:self-start">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--hairline-soft)] px-5 py-3">
            <span className="text-xs uppercase tracking-[0.2em] text-gold-soft/70">
              Verse {preview}
            </span>
            {previewVerse && (
              <button
                onClick={() => handleChip(preview, false)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  selectedSet.has(preview)
                    ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                    : "btn-ghost"
                }`}
              >
                {selectedSet.has(preview) ? "Selected ✓" : "Add"}
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto px-5 py-5">
            {previewVerse ? (
              <>
                <p
                  className="font-arabic text-right text-2xl leading-[2.2] text-parchment"
                  dir="rtl"
                >
                  {previewVerse.text_uthmani}
                </p>
                {previewVerse.translation && (
                  <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
                    {previewVerse.translation}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                Hover a number to preview the verse.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
