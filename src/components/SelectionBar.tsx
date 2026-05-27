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
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-6">
      <div className="rise flex items-center gap-5 rounded-full border border-[var(--hairline)] bg-[var(--surface)]/95 py-2.5 pl-6 pr-2.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <span className="text-sm text-parchment">
          <span className="font-display text-gold-soft">{count}</span> verse
          {count !== 1 ? "s" : ""}
          <span className="ml-2 text-[var(--muted)]">{duration}</span>
        </span>
        <Link
          href="/studio"
          className="btn-gold flex items-center gap-2 rounded-full px-5 py-2.5 text-sm"
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
