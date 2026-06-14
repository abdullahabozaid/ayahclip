"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { reciters } from "@/lib/reciters";
import { getAudioUrl } from "@/lib/api";
import { getTranslationLanguage } from "@/lib/translations";
import {
  loadVerseWords,
  buildPartsFromBoundaries,
  type VerseWord,
} from "@/lib/playback-engine";
import { PartBlock } from "./VerseCardEditor";
import { QcfVerse } from "./QcfVerse";

/**
 * Verse editor for library (reciter) clips. Each verse is its own audio file, so
 * parts are defined by WORD boundaries and timed from the reciter's real per-word
 * timestamps (Quran.com). Splitting a verse keeps every word and shows it in
 * sequential parts (84·1, 84·2…), exactly like the uploaded-clip editor.
 */
export function ReciterVerseEditor() {
  const surah = useAppStore((s) => s.surah);
  const verses = useAppStore((s) => s.verses);
  const selected = useAppStore((s) => s.selectedVerseNumbers);
  const reciterId = useAppStore((s) => s.reciterId);
  const translationLanguage = useAppStore((s) => s.translationLanguage);
  const verseParts = useAppStore((s) => s.verseParts);
  const setVerseParts = useAppStore((s) => s.setVerseParts);
  const setCurrentVerseIndex = useAppStore((s) => s.setCurrentVerseIndex);
  const currentVerseIndex = useAppStore((s) => s.currentVerseIndex);
  const activePartIndex = useAppStore((s) => s.activePartIndex);
  const setActivePartIndex = useAppStore((s) => s.setActivePartIndex);

  const reciter = reciters.find((r) => r.id === reciterId);
  const recitationId = reciter?.quranComRecitationId ?? 7;
  const folder = reciter?.folder ?? "Alafasy_128kbps";
  const resourceId = getTranslationLanguage(translationLanguage).resourceId;

  const selectedVerses = verses.filter((v) => selected.includes(v.verse_number));

  // Per-verse word data (text + translation + real timings), fetched once.
  const [wordsByVerse, setWordsByVerse] = useState<Record<number, VerseWord[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!surah || selectedVerses.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setWordsByVerse({});
    (async () => {
      const out: Record<number, VerseWord[]> = {};
      for (const v of selectedVerses) {
        try {
          out[v.verse_number] = await loadVerseWords(
            recitationId,
            surah.id,
            v.verse_number,
            resourceId
          );
        } catch {
          out[v.verse_number] = [];
        }
        if (cancelled) return;
      }
      if (!cancelled) {
        setWordsByVerse(out);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah?.id, recitationId, resourceId, selected.join(",")]);

  // One audio element for previewing a single part by ear.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    stopAtRef.current = null;
    setPlayingKey(null);
  }, []);

  const playPart = useCallback(
    (verseNumber: number, startMs: number, endMs: number, key: string) => {
      let audio = audioRef.current;
      const src = getAudioUrl(folder, surah!.id, verseNumber);
      if (!audio) {
        audio = new Audio();
        audioRef.current = audio;
        audio.addEventListener("timeupdate", () => {
          if (stopAtRef.current != null && audio!.currentTime * 1000 >= stopAtRef.current) {
            audio!.pause();
            stopAtRef.current = null;
            setPlayingKey(null);
          }
        });
        audio.addEventListener("ended", () => setPlayingKey(null));
      }
      if (audio.src !== src) audio.src = src;
      stopAtRef.current = endMs > startMs ? endMs : null;
      audio.currentTime = startMs / 1000;
      audio.play().then(
        () => setPlayingKey(key),
        () => setPlayingKey(null)
      );
    },
    [folder, surah]
  );

  useEffect(() => () => stop(), [stop]);

  const addSplit = useCallback(
    (verseNumber: number, absBoundary: number, total: number) => {
      if (absBoundary <= 0 || absBoundary >= total) return;
      const existing = verseParts[verseNumber] ?? [];
      if (existing.includes(absBoundary)) return;
      setVerseParts(verseNumber, [...existing, absBoundary]);
    },
    [verseParts, setVerseParts]
  );

  const removeSplit = useCallback(
    (verseNumber: number, boundaryIdx: number) => {
      const existing = verseParts[verseNumber] ?? [];
      setVerseParts(
        verseNumber,
        existing.filter((_, i) => i !== boundaryIdx)
      );
    },
    [verseParts, setVerseParts]
  );

  if (!surah || selectedVerses.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {loading && (
        <p className="px-1 text-[12px] text-[var(--muted-deep)]">
          Loading word timings from Quran.com…
        </p>
      )}

      {selectedVerses.map((verse, vi) => {
        const words = wordsByVerse[verse.verse_number] ?? [];
        const total = words.length;
        const boundaries = verseParts[verse.verse_number] ?? [];
        const parts = buildPartsFromBoundaries(words, boundaries, verse.translation);
        const multiPart = parts.length > 1;
        const active = vi === currentVerseIndex;

        return (
          <section
            key={verse.verse_number}
            onClick={() => setCurrentVerseIndex(vi)}
            className={`rounded-2xl border p-4 transition-all sm:p-5 ${
              active
                ? "border-[var(--gold)]/60 bg-[rgba(201,162,75,0.05)] shadow-[0_0_0_1px_rgba(201,162,75,0.18)]"
                : "border-[var(--hairline-soft)] bg-[var(--ink-deep)] hover:border-[var(--hairline)]"
            }`}
          >
            <div className="mb-3 flex items-center gap-3">
              <span
                className={`inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md px-2 text-[12px] font-semibold tabular-nums ring-1 ring-inset ${
                  active
                    ? "bg-gold text-[var(--ink-deep)] ring-transparent"
                    : "bg-[var(--ink)]/80 text-gold-soft ring-[var(--hairline)]"
                }`}
              >
                {verse.verse_number}
              </span>
              {multiPart && (
                <span className="rounded-full bg-emerald-soft/10 px-2.5 py-1 text-[10px] text-emerald-soft ring-1 ring-inset ring-emerald-soft/20">
                  {parts.length} parts
                </span>
              )}
              {total === 0 && !loading && (
                <span className="text-[11px] text-amber-300/80">
                  No word timings for this reciter — splitting unavailable.
                </span>
              )}
            </div>

            {parts.length === 0 && total === 0 ? (
              <QcfVerse qcfWords={verse.qcfWords} fallback={verse.text_uthmani} className="text-parchment" />
            ) : (
              <div className="flex flex-col gap-2.5">
                {parts.map((p, pi) => {
                  // Map this part back to its word span for the split tool.
                  const points = [0, ...boundaries.filter((b) => b > 0 && b < total).sort((a, b) => a - b), total];
                  const wLo = points[pi] ?? 0;
                  const wHi = points[pi + 1] ?? total;
                  const partWords = words.slice(wLo, wHi).map((w) => w.text);
                  const qcfJustWords = verse.qcfWords?.filter((w) => w.char_type_name === "word");
                  const partQcf = qcfJustWords?.slice(wLo, wHi);
                  const key = `${verse.verse_number}:${pi}`;
                  return (
                    <PartBlock
                      key={pi}
                      verseNumber={verse.verse_number}
                      partIndex={pi}
                      multiPart={multiPart}
                      words={partWords}
                      translation={p.translationText}
                      wordOffset={wLo}
                      totalWords={total}
                      isActivePart={active && pi === activePartIndex}
                      isPlaying={playingKey === key}
                      cardActive={active}
                      onPlay={() =>
                        playingKey === key ? stop() : playPart(verse.verse_number, p.startMs, p.endMs, key)
                      }
                      onSplitWord={(absBoundary) => addSplit(verse.verse_number, absBoundary, total)}
                      canRemove={pi > 0}
                      onRemove={() => removeSplit(verse.verse_number, pi - 1)}
                      onActivate={() => setActivePartIndex(pi)}
                      qcfWords={partQcf}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <p className="px-1 text-[11px] leading-relaxed text-[var(--muted-deep)]">
        Splitting keeps every word — it shows the verse in parts (part 1, part 2…)
        timed to the reciter&apos;s words. Parts appear as the recitation reaches them.
      </p>
    </div>
  );
}
