"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Project } from "@/types";
import { getAllProjects, deleteProject, getBlob } from "@/lib/projects";
import { DashboardCard } from "@/components/DashboardCard";
import { useAppStore } from "@/lib/store";
import { fetchSurahs, fetchVerses } from "@/lib/api";
import { getTranslationLanguage } from "@/lib/translations";

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAllProjects().then((p) => {
      setProjects(p);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const deleteSelected = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} clip${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    await Promise.all(ids.map((id) => deleteProject(id)));
    const removed = new Set(ids);
    setProjects((prev) => prev.filter((p) => !removed.has(p.id)));
    exitSelectMode();
  };

  // Restore the saved clip — surah, verses, selection and every style setting —
  // straight into the studio, instead of just reopening the surah picker.
  const handleOpen = async (project: Project) => {
    if (opening) return;
    setOpening(project.id);
    try {
      const surahs = await fetchSurahs();
      const surah = surahs.find((s) => s.id === project.surahId);
      if (!surah) {
        router.push(`/surah/${project.surahId}`);
        return;
      }
      const lang = getTranslationLanguage(project.settings.translationLanguage);
      const verses = await fetchVerses(surah.id, lang.resourceId);

      // Rehydrate uploaded media (audio track + background video) so an imported
      // clip reopens fully — playable, with an editable verse timeline.
      const settings = { ...project.settings };
      let importedAudio:
        | { url: string; name: string; timings: import("@/lib/audio-import").VerseTiming[] }
        | undefined;
      if (project.imported) {
        const audioBlob = await getBlob(`audio:${project.id}`);
        if (audioBlob) {
          importedAudio = {
            url: URL.createObjectURL(audioBlob),
            name: project.imported.name,
            timings: project.imported.timings,
          };
        }
        if (project.imported.videoBg && settings.background?.type === "video") {
          const videoBlob = await getBlob(`video:${project.id}`);
          if (videoBlob) settings.background = { ...settings.background, value: URL.createObjectURL(videoBlob) };
        }
      }

      const store = useAppStore.getState();
      store.restoreProject(surah, verses, project.selectedVerseNumbers, settings, project.id, importedAudio, project.verseParts);
      if (importedAudio && project.imported?.videoBg) store.setBackgroundVideoSync(true);
      router.push("/studio");
    } catch {
      router.push(`/surah/${project.surahId}`);
    } finally {
      setOpening(null);
    }
  };

  return (
    <main className="bg-mihrab min-h-[calc(100dvh-65px)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-24 text-center sm:pt-32">
          <p
            className="rise mb-6 font-arabic text-3xl text-gold-soft"
            style={{ animationDelay: "0ms" }}
            dir="rtl"
          >
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </p>

          <h1
            className="rise font-display text-5xl leading-[1.05] tracking-wide text-parchment sm:text-7xl"
            style={{ animationDelay: "160ms" }}
          >
            Craft luminous
            <br />
            <span className="text-gold">recitation clips</span>
          </h1>

          <p
            className="rise mx-auto mt-6 max-w-xl text-base leading-relaxed text-[var(--muted)] sm:text-lg"
            style={{ animationDelay: "240ms" }}
          >
            Select verses, choose a reciter, and shape a beautiful video for
            TikTok, Reels, or YouTube Shorts — entirely in your browser.
          </p>

          <div
            className="rise mt-10 flex items-center justify-center gap-3"
            style={{ animationDelay: "320ms" }}
          >
            <Link
              href="/browse"
              className="btn-gold rounded-full px-7 py-3.5 text-base"
            >
              Begin a clip
            </Link>
            <Link href="/import" className="btn-ghost rounded-full px-6 py-3.5 text-sm">
              Import audio
            </Link>
            {projects.length > 0 && (
              <a href="#projects" className="btn-ghost rounded-full px-6 py-3.5 text-sm">
                Your clips
              </a>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-2xl px-5">
          <div className="gold-rule" />
        </div>
      </section>

      {/* Projects */}
      <section id="projects" className="mx-auto max-w-6xl px-5 py-16">
        {loading ? (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="panel overflow-hidden">
                <div className="shimmer aspect-[9/16] w-full" />
              </div>
            ))}
          </div>
        ) : projects.length > 0 ? (
          <>
            <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl tracking-wide text-parchment">
                Your clips
              </h2>
              {selectMode ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setSelectedIds(
                        selectedIds.size === projects.length
                          ? new Set()
                          : new Set(projects.map((p) => p.id))
                      )
                    }
                    className="btn-ghost rounded-full px-4 py-2 text-sm"
                  >
                    {selectedIds.size === projects.length ? "Deselect all" : "Select all"}
                  </button>
                  <button
                    onClick={deleteSelected}
                    disabled={selectedIds.size === 0}
                    className="rounded-full bg-red-500/15 px-4 py-2 text-sm text-red-300 ring-1 ring-red-400/40 transition-colors hover:bg-red-500/25 disabled:opacity-40"
                  >
                    Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                  </button>
                  <button onClick={exitSelectMode} className="btn-ghost rounded-full px-4 py-2 text-sm">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[var(--muted)]">{projects.length} saved</span>
                  <button
                    onClick={() => setSelectMode(true)}
                    className="btn-ghost rounded-full px-4 py-2 text-sm"
                  >
                    Select
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {projects.map((p, i) => (
                <div key={p.id} className="rise" style={{ animationDelay: `${i * 50}ms` }}>
                  <DashboardCard
                    project={p}
                    onOpen={() => handleOpen(p)}
                    onDelete={() => handleDelete(p.id)}
                    selectable={selectMode}
                    selected={selectedIds.has(p.id)}
                    onToggleSelect={() => toggleSelected(p.id)}
                  />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="panel mx-auto max-w-lg px-8 py-16 text-center">
            <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--hairline)] text-2xl text-gold-soft">
              ﷽
            </span>
            <h2 className="font-display text-2xl text-parchment">No clips yet</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-[var(--muted)]">
              Your saved projects will gather here. Begin by choosing a surah.
            </p>
            <Link
              href="/browse"
              className="btn-gold mt-7 inline-block rounded-full px-6 py-3 text-sm"
            >
              Browse the Quran
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
