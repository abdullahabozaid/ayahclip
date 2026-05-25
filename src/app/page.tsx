"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Project } from "@/types";
import { getAllProjects, deleteProject } from "@/lib/projects";
import { DashboardCard } from "@/components/DashboardCard";

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleOpen = (project: Project) => {
    router.push(`/surah/${project.surahId}`);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-col items-center gap-2">
        <h1 className="text-3xl font-bold">AyahClip</h1>
        <p className="text-sm text-gray-400">
          Create beautiful Quran recitation clips
        </p>
      </header>

      <div className="mb-8 flex justify-center">
        <button
          onClick={() => router.push("/browse")}
          className="rounded-xl bg-emerald-600 px-6 py-3 font-medium transition-colors hover:bg-emerald-500"
        >
          + Create New Video
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      ) : projects.length > 0 ? (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-300">
            Recent Projects
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {projects.map((p) => (
              <DashboardCard
                key={p.id}
                project={p}
                onOpen={() => handleOpen(p)}
                onDelete={() => handleDelete(p.id)}
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="py-20 text-center">
          <p className="text-lg text-gray-500">No projects yet</p>
          <p className="mt-2 text-sm text-gray-600">
            Create your first Quran video clip
          </p>
        </div>
      )}
    </main>
  );
}
