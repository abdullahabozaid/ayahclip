"use client";

import { useState, useCallback } from "react";
import { searchPhotos, PexelsPhoto } from "@/lib/pexels";
import { Background } from "@/types";

interface PexelsSearchProps {
  onSelect: (bg: Background) => void;
}

const SUGGESTED_QUERIES = ["nature", "mosque", "rain", "ocean", "night sky", "mountains"];

export function PexelsSearch({ onSelect }: PexelsSearchProps) {
  const [query, setQuery] = useState("nature");
  const [photos, setPhotos] = useState<PexelsPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async (q?: string) => {
    const searchQuery = q ?? query;
    if (q) setQuery(searchQuery);
    setLoading(true);
    setError(null);
    try {
      const data = await searchPhotos(searchQuery);
      setPhotos(data.photos);
    } catch (e) {
      setPhotos([]);
      setError(e instanceof Error ? e.message : "Search failed");
    }
    setLoading(false);
    setSearched(true);
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search photos..."
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/20"
        />
        <button
          onClick={() => handleSearch()}
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "..." : "Search"}
        </button>
      </div>

      {!searched && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => handleSearch(q)}
              className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-400 hover:border-white/20 hover:text-white"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}

      {error && (
        <p className="py-2 text-center text-xs text-red-400">{error}</p>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((photo) => (
            <button
              key={photo.id}
              onClick={() =>
                onSelect({
                  type: "image",
                  value: photo.src.large,
                  label: `Pexels: ${photo.photographer}`,
                })
              }
              className="group relative aspect-[3/4] overflow-hidden rounded-md"
            >
              {/* Pexels thumbnails are dynamic third-party preview URLs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.src.tiny}
                alt={photo.photographer}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {searched && photos.length === 0 && !loading && !error && (
        <p className="py-4 text-center text-xs text-gray-500">No results found</p>
      )}
    </div>
  );
}
