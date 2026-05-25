"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { StudioPreview } from "@/components/StudioPreview";
import { StudioSettings } from "@/components/StudioSettings";

export default function StudioPage() {
  const router = useRouter();
  const surah = useAppStore((s) => s.surah);
  const selectedVerseNumbers = useAppStore((s) => s.selectedVerseNumbers);

  if (!surah || selectedVerseNumbers.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-gray-400">No verses selected</p>
        <button
          onClick={() => router.push("/")}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          Go to Home
        </button>
      </main>
    );
  }

  return (
    <main className="flex h-screen">
      <div className="flex flex-1 items-center justify-center bg-black/50 p-8">
        <StudioPreview />
      </div>
      <aside className="w-80 border-l border-white/10 bg-[#0a0a0a] p-6 overflow-y-auto">
        <button
          onClick={() => router.back()}
          className="mb-4 text-sm text-gray-400 hover:text-white"
        >
          ← Back
        </button>
        <StudioSettings />
      </aside>
    </main>
  );
}
