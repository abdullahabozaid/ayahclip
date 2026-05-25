"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { saveProject, generateProjectId } from "@/lib/projects";
import { StudioPreview } from "@/components/StudioPreview";
import { StudioSettings } from "@/components/StudioSettings";
import { FullscreenPreview } from "@/components/FullscreenPreview";

export default function StudioPage() {
  const router = useRouter();
  const store = useAppStore();
  const surah = store.surah;
  const selectedVerseNumbers = store.selectedVerseNumbers;
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!surah || selectedVerseNumbers.length === 0) return;

    if (!store.projectId) {
      const id = generateProjectId();
      store.setProjectId(id);
    }
  }, [surah, selectedVerseNumbers.length]);

  useEffect(() => {
    if (!surah || selectedVerseNumbers.length === 0 || !store.projectId) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      const state = useAppStore.getState();
      saveProject({
        id: state.projectId!,
        name: `${state.surah!.name_simple} ${selectedVerseNumbers[0]}-${selectedVerseNumbers[selectedVerseNumbers.length - 1]}`,
        surahId: state.surah!.id,
        surahName: state.surah!.name_simple,
        selectedVerseNumbers: state.selectedVerseNumbers,
        settings: {
          reciterId: state.reciterId,
          videoFormat: state.videoFormat,
          arabicFontSize: state.arabicFontSize,
          arabicFont: state.arabicFont,
          translationEnabled: state.translationEnabled,
          translationFontSize: state.translationFontSize,
          translationFont: state.translationFont,
          textColor: state.textColor,
          overlayOpacity: state.overlayOpacity,
          background: state.background,
          textShadow: state.textShadow,
          letterbox: state.letterbox,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    store.projectId,
    store.reciterId,
    store.videoFormat,
    store.arabicFontSize,
    store.arabicFont,
    store.translationEnabled,
    store.translationFontSize,
    store.translationFont,
    store.textColor,
    store.overlayOpacity,
    store.background,
    store.textShadow,
    store.letterbox,
    surah,
    selectedVerseNumbers,
  ]);

  if (!surah || selectedVerseNumbers.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-gray-400">No verses selected</p>
        <button
          onClick={() => router.push("/browse")}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          Browse Surahs
        </button>
      </main>
    );
  }

  return (
    <main className="flex h-[calc(100vh-49px)]">
      <div className="relative flex flex-1 items-center justify-center bg-black/50 p-8">
        <StudioPreview onFullscreen={() => setFullscreen(true)} />
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="absolute right-2 top-2 rounded-lg border border-white/10 px-2 py-1 text-xs text-gray-400 hover:text-white"
        >
          {settingsOpen ? "Hide Settings" : "Show Settings"}
        </button>
      </div>
      <aside
        className={`border-l border-white/10 bg-[#0a0a0a] overflow-y-auto transition-all duration-300 ${
          settingsOpen ? "w-96" : "w-0 overflow-hidden"
        }`}
      >
        <button
          onClick={() => router.back()}
          className="m-6 mb-0 text-sm text-gray-400 hover:text-white"
        >
          ← Back
        </button>
        <StudioSettings />
      </aside>
      {fullscreen && (
        <FullscreenPreview onClose={() => setFullscreen(false)} />
      )}
    </main>
  );
}
