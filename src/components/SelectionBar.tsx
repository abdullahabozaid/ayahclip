"use client";

import Link from "next/link";

interface SelectionBarProps {
  count: number;
}

export function SelectionBar({ count }: SelectionBarProps) {
  if (count === 0) return null;

  const estSeconds = count * 5;
  const duration =
    estSeconds < 60
      ? `~${estSeconds}s`
      : `~${Math.floor(estSeconds / 60)}m ${estSeconds % 60}s`;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-[var(--surface)] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <span className="min-w-0 text-sm text-parchment">
          <span className="font-medium tabular-nums text-gold-soft">{count}</span> ayah
          {count !== 1 ? "s" : ""} selected
          <span className="ml-2 hidden text-[var(--muted)] sm:inline">Estimated {duration}</span>
        </span>
        <Link
          href="/studio"
          className="btn-gold flex min-h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm"
        >
          Open studio
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
