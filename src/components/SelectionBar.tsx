"use client";

import Link from "next/link";

interface SelectionBarProps {
  count: number;
}

export function SelectionBar({ count }: SelectionBarProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0a0a0a]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <span className="text-sm text-gray-300">
          {count} verse{count !== 1 ? "s" : ""} selected
        </span>
        <Link
          href="/studio"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-emerald-500"
        >
          Open Studio
        </Link>
      </div>
    </div>
  );
}
