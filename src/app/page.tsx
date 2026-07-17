"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Project } from "@/types";
import { getAllProjects, deleteProject, getBlob } from "@/lib/projects";
import { DashboardCard } from "@/components/DashboardCard";
import { useAppStore } from "@/lib/store";
import { fetchSurahs, fetchVerses } from "@/lib/api";
import { getTranslationLanguage } from "@/lib/translations";
import { NewClipLink } from "@/components/NewClipLink";
import { InlineActionPrompt } from "@/components/InlineActionPrompt";

type DeleteRequest = { ids: string[]; title: string; description: string };

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getAllProjects().then((p) => {
      setProjects(p);
      setLoading(false);
    });
  }, []);

  const handleDelete = (id: string) => {
    const project = projects.find((item) => item.id === id);
    setDeleteRequest({
      ids: [id],
      title: `Delete “${project?.name ?? "this clip"}”?`,
      description: "The saved project and its imported source media will be permanently removed from this browser.",
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const deleteSelected = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setDeleteRequest({
      ids,
      title: `Delete ${ids.length} saved clip${ids.length === 1 ? "" : "s"}?`,
      description: "Their project settings and imported source media will be permanently removed from this browser.",
    });
  };

  const confirmDelete = async () => {
    if (!deleteRequest || deleting) return;
    setDeleting(true);
    try {
      await Promise.all(deleteRequest.ids.map((id) => deleteProject(id)));
      const removed = new Set(deleteRequest.ids);
      setProjects((prev) => prev.filter((project) => !removed.has(project.id)));
      setDeleteRequest(null);
      exitSelectMode();
    } finally {
      setDeleting(false);
    }
  };

  // Restore the saved clip — surah, verses, selection and every style setting —
  // straight into the studio, instead of just reopening the surah picker.
  const handleOpen = async (project: Project) => {
    if (opening) return;
    setOpening(project.id);
    setOpenError(null);
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
        if (!audioBlob) {
          setOpenError(`“${project.name}” is missing its imported audio. Import the original source again to create a complete copy.`);
          return;
        }
        importedAudio = {
          url: URL.createObjectURL(audioBlob),
          name: project.imported.name,
          timings: project.imported.timings,
        };
        if (project.imported.videoBg && settings.background?.type === "video") {
          const videoBlob = await getBlob(`video:${project.id}`);
          if (videoBlob) settings.background = { ...settings.background, value: URL.createObjectURL(videoBlob) };
        }
      }

      if (project.backgroundMedia?.length) {
        for (const media of project.backgroundMedia) {
          const blob = await getBlob(`background:${project.id}:${media.sceneId}`);
          if (!blob) continue;
          const value = URL.createObjectURL(blob);
          if (media.sceneId === "single" && settings.background?.type === media.type) {
            settings.background = { ...settings.background, value };
          } else if (settings.backgroundScenes) {
            settings.backgroundScenes = settings.backgroundScenes.map((scene) =>
              scene.id === media.sceneId && scene.background.type === media.type
                ? { ...scene, background: { ...scene.background, value } }
                : scene
            );
          }
        }
        const activeScene = settings.backgroundScenes?.find(
          (scene) => scene.id === settings.activeBackgroundSceneId
        );
        if (activeScene) {
          settings.background = activeScene.background;
          settings.backgroundFit = activeScene.fit;
          settings.fitBackdrop = activeScene.backdrop;
          settings.mediaTransform = activeScene.transform;
        }
      }

      const store = useAppStore.getState();
      store.restoreProject(surah, verses, project.selectedVerseNumbers, settings, project.id, importedAudio, project.verseParts);
      if (importedAudio && project.imported?.videoBg) store.setBackgroundVideoSync(true);
      router.push("/studio");
    } catch {
      setOpenError(`“${project.name}” could not be restored. Check your connection and try again; the saved clip has not been changed.`);
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
            <NewClipLink
              href="/browse"
              className="btn-gold rounded-full px-7 py-3.5 text-base"
            >
              Begin a clip
            </NewClipLink>
            <NewClipLink href="/import" className="btn-ghost rounded-full px-6 py-3.5 text-sm">
              Import audio
            </NewClipLink>
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
        {deleteRequest && (
          <div className="mb-6">
            <InlineActionPrompt
              title={deleteRequest.title}
              description={deleteRequest.description}
              confirmLabel={deleteRequest.ids.length === 1 ? "Delete clip" : `Delete ${deleteRequest.ids.length} clips`}
              onConfirm={confirmDelete}
              onCancel={() => setDeleteRequest(null)}
              busy={deleting}
            />
          </div>
        )}
        {openError && (
          <div role="alert" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-red-500/25 bg-red-500/[0.08] px-4 py-3 text-sm leading-relaxed text-red-100/90">
            <p className="min-w-0 flex-1"><strong className="font-semibold text-red-100">Clip could not open.</strong> {openError}</p>
            <div className="flex shrink-0 items-center gap-2">
              <NewClipLink href="/import" className="min-h-10 rounded-full border border-red-300/30 px-4 py-2 text-xs font-medium text-red-50 transition-colors hover:bg-red-100/10">Import source</NewClipLink>
              <button type="button" onClick={() => setOpenError(null)} className="flex h-10 w-10 items-center justify-center rounded-full text-red-100/60 transition-colors hover:bg-white/[0.05] hover:text-red-100" aria-label="Dismiss clip error">×</button>
            </div>
          </div>
        )}
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
            <h2 className="font-display text-2xl text-parchment">Begin your first clip</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
              Your saved projects will gather here. Start from the Quran with an
              online reciter, or bring your own recitation and let AyahClip find
              the verses for you.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <NewClipLink href="/browse" className="btn-gold rounded-full px-6 py-3 text-sm">
                Choose a surah
              </NewClipLink>
              <NewClipLink href="/import" className="btn-ghost rounded-full px-6 py-3 text-sm">
                Import a recitation
              </NewClipLink>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
