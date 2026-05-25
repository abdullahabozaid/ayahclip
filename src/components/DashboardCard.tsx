"use client";

import { Project } from "@/types";

interface DashboardCardProps {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
}

export function DashboardCard({ project, onOpen, onDelete }: DashboardCardProps) {
  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer rounded-xl border border-white/10 bg-white/5 p-3 transition-all hover:border-white/20 hover:bg-white/10"
    >
      <div className="mb-3 aspect-video overflow-hidden rounded-lg bg-black/50">
        {project.thumbnail ? (
          <img
            src={project.thumbnail}
            alt={project.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-gray-600">
            ﷽
          </div>
        )}
      </div>
      <h3 className="truncate text-sm font-medium">{project.name}</h3>
      <p className="mt-1 text-xs text-gray-400">
        {project.surahName} · {project.selectedVerseNumbers.length} verses
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {formatTimeAgo(project.updatedAt)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-xs text-gray-500 opacity-0 transition-all group-hover:opacity-100 hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
