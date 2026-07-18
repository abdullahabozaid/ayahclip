"use client";

import { STOCK_IMAGES, STOCK_CATEGORIES, StockImage } from "@/lib/stock-library";
import { Background } from "@/types";

interface StockLibraryProps {
  onSelect: (bg: Background) => void;
}

export function StockLibrary({ onSelect }: StockLibraryProps) {
  const handleSelect = (image: StockImage) => {
    onSelect({
      type: "image",
      value: image.url,
      label: image.name,
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        People-free picks, reviewed for quiet Quran B-roll.
      </p>
      {STOCK_CATEGORIES.map((category) => {
        const images = STOCK_IMAGES.filter((img) => img.category === category);
        if (images.length === 0) return null;
        return (
          <div key={category}>
            <p className="mb-2 text-xs capitalize text-[var(--muted)]">{category}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {images.map((image) => (
                <button
                  key={image.id}
                  onClick={() => handleSelect(image)}
                  className="group relative aspect-[3/4] overflow-hidden rounded-md border-2 border-transparent transition-all hover:border-[var(--hairline)]"
                >
                  {/* Direct library preview keeps local and remote stock sources interchangeable. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.thumbUrl}
                    alt={image.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[10px] text-gray-300">
                    {image.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-center text-[10px] text-gray-600">
        Curated photos from Pexels
      </p>
    </div>
  );
}
