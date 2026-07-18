import type { Reciter } from "@/types";
import { RECITER_REGIONS } from "@/lib/reciters";

export interface ReciterGroup {
  id: string;
  label: string;
  reciters: Reciter[];
}

const ARABIC_AND_LATIN_MARKS = /[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const NON_WORDS = /[^\p{L}\p{N}]+/gu;

export function normalizeReciterSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(ARABIC_AND_LATIN_MARKS, "")
    .toLocaleLowerCase()
    .replace(NON_WORDS, " ")
    .trim();
}

export function filterReciters(
  catalog: readonly Reciter[],
  query: string,
  wordSyncedOnly: boolean,
): Reciter[] {
  const terms = normalizeReciterSearch(query).split(" ").filter(Boolean);

  return catalog.filter((reciter) => {
    if (wordSyncedOnly && reciter.quranComRecitationId == null) return false;

    const region = RECITER_REGIONS.find((item) => item.id === reciter.region);
    const searchText = normalizeReciterSearch([
      reciter.name,
      reciter.arabicName,
      reciter.style,
      region?.label,
      region?.description,
      reciter.quranComRecitationId == null ? "whole verse captions" : "word synced splitting",
    ].filter(Boolean).join(" "));

    return terms.every((term) => searchText.includes(term));
  });
}

export function groupReciters(
  catalog: readonly Reciter[],
  favoriteIds: readonly string[],
  recentIds: readonly string[],
): ReciterGroup[] {
  const byId = new Map(catalog.map((reciter) => [reciter.id, reciter]));
  const used = new Set<string>();
  const groups: ReciterGroup[] = [];

  const addSavedGroup = (id: string, label: string, ids: readonly string[]) => {
    const entries = ids.flatMap((reciterId) => {
      const reciter = byId.get(reciterId);
      return reciter && !used.has(reciter.id) ? [reciter] : [];
    });
    if (entries.length === 0) return;
    entries.forEach((reciter) => used.add(reciter.id));
    groups.push({ id, label, reciters: entries });
  };

  addSavedGroup("favorites", "Favourites", favoriteIds);
  addSavedGroup("recent", "Recently used", recentIds);

  for (const region of RECITER_REGIONS) {
    const entries = catalog.filter((reciter) => reciter.region === region.id && !used.has(reciter.id));
    if (entries.length === 0) continue;
    entries.forEach((reciter) => used.add(reciter.id));
    groups.push({ id: region.id, label: region.label, reciters: entries });
  }

  return groups;
}
