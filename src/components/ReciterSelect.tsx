"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { getReciter, reciters, supportsWordTimings } from "@/lib/reciters";
import { filterReciters, groupReciters } from "@/lib/reciter-discovery";

interface ReciterSelectProps {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  showCatalogCount?: boolean;
}

const FAVORITES_KEY = "ayahclip:favorite-reciter-ids";
const RECENTS_KEY = "ayahclip:recent-reciter-ids";
const MAX_RECENTS = 5;

function readStoredIds(key: string): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && Boolean(getReciter(item)))
      : [];
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, ids: readonly string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Selection remains usable when storage is blocked or full.
  }
}

export function ReciterSelect({
  value,
  onChange,
  label = "Reciter",
  showCatalogCount = false,
}: ReciterSelectProps) {
  const id = useId();
  const searchId = `${id}-search`;
  const selected = getReciter(value) ?? reciters[0];
  const timed = supportsWordTimings(selected);
  const [query, setQuery] = useState("");
  const [wordSyncedOnly, setWordSyncedOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    setFavoriteIds(readStoredIds(FAVORITES_KEY));
    setRecentIds(readStoredIds(RECENTS_KEY));
  }, []);

  const visibleReciters = useMemo(
    () => filterReciters(reciters, query, wordSyncedOnly),
    [query, wordSyncedOnly],
  );
  const groups = useMemo(
    () => groupReciters(visibleReciters, favoriteIds, recentIds),
    [favoriteIds, recentIds, visibleReciters],
  );
  const selectedIsVisible = visibleReciters.some((reciter) => reciter.id === selected.id);
  const isFavorite = favoriteIds.includes(selected.id);

  const chooseReciter = (reciterId: string) => {
    if (!reciterId) return;
    const nextRecentIds = [reciterId, ...recentIds.filter((id) => id !== reciterId)].slice(0, MAX_RECENTS);
    setRecentIds(nextRecentIds);
    writeStoredIds(RECENTS_KEY, nextRecentIds);
    onChange(reciterId);
  };

  const toggleFavorite = () => {
    const nextFavoriteIds = isFavorite
      ? favoriteIds.filter((reciterId) => reciterId !== selected.id)
      : [selected.id, ...favoriteIds];
    setFavoriteIds(nextFavoriteIds);
    writeStoredIds(FAVORITES_KEY, nextFavoriteIds);
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs text-[var(--muted)]">
          {label}
        </label>
        {showCatalogCount && (
          <span className="text-[11px] tabular-nums text-[var(--muted-deep)]">
            {visibleReciters.length === reciters.length
              ? `${reciters.length} verified voices`
              : `${visibleReciters.length} of ${reciters.length} voices`}
          </span>
        )}
      </div>
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div>
          <label htmlFor={searchId} className="sr-only">Search reciters</label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search English or Arabic"
            className="field min-h-10 w-full px-3 text-sm"
          />
        </div>
        <button
          type="button"
          aria-pressed={wordSyncedOnly}
          onClick={() => setWordSyncedOnly((current) => !current)}
          className={`min-h-10 rounded-lg border px-3 text-xs transition-colors ${wordSyncedOnly
            ? "border-[var(--emerald)] bg-[var(--emerald)]/15 text-emerald-soft"
            : "border-[var(--hairline-soft)] text-[var(--muted)] hover:border-[var(--hairline)] hover:text-parchment"
          }`}
        >
          Word synced
        </button>
      </div>
      <select
        id={id}
        value={selectedIsVisible ? selected.id : ""}
        onChange={(event) => chooseReciter(event.target.value)}
        className="field w-full px-3 py-2.5 text-sm"
      >
        {!selectedIsVisible && (
          <option value="" disabled>
            {visibleReciters.length === 0 ? "No matching voices" : `${visibleReciters.length} matches · choose a voice`}
          </option>
        )}
        {groups.map((group) => (
          <optgroup key={group.id} label={group.label} className="bg-[var(--surface)]">
            {group.reciters.map((reciter) => (
              <option key={reciter.id} value={reciter.id} className="bg-[var(--surface)]">
                {reciter.name}{supportsWordTimings(reciter) ? " · Word synced" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-[11px]">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            aria-label={`${isFavorite ? "Remove" : "Add"} ${selected.name} ${isFavorite ? "from" : "to"} favourites`}
            aria-pressed={isFavorite}
            onClick={toggleFavorite}
            className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-lg text-base text-gold-soft transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
          >
            <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
          </button>
          <span className="truncate font-arabic text-sm text-parchment" dir="rtl">
            {selected.arabicName}
          </span>
        </div>
        <span className={timed ? "shrink-0 text-emerald-soft" : "shrink-0 text-[var(--muted-deep)]"}>
          {timed ? "Word-synced splitting" : "Whole-verse captions"}
        </span>
      </div>
    </div>
  );
}
