"use client";

import { Project } from "@/types";
import { BackgroundThumb } from "./BackgroundThumb";

interface DashboardCardProps {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function DashboardCard({
  project,
  onOpen,
  onDelete,
  selectable = false,
  selected = false,
  onToggleSelect,
}: DashboardCardProps) {
  const { settings } = project;
  const overlay = settings?.overlayOpacity ?? 40;
  const textColor = settings?.textColor ?? "#ece7da";

  return (
    <div
      onClick={selectable ? onToggleSelect : onOpen}
      className={`card-lift panel group relative cursor-pointer overflow-hidden p-2.5 ${
        selected ? "ring-2 ring-[var(--gold)]" : ""
      }`}
    >
      <div className="relative mb-3 aspect-[9/16] overflow-hidden rounded-xl bg-[var(--ink-deep)]">
        {/* Actual clip background */}
        {project.thumbnail ? (
          // Canvas thumbnails are data URLs and bypass the Next image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.thumbnail}
            alt={project.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : settings?.background ? (
          <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
            <BackgroundThumb background={settings.background} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-gold-soft/30">
            <span className="font-arabic text-4xl">﷽</span>
          </div>
        )}

        {/* Dark overlay matching the clip's setting */}
        {settings?.background && !project.thumbnail && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: `rgba(0,0,0,${overlay / 100})` }}
          />
        )}

        {/* Verse name overlaid like the real clip composition */}
        {settings?.background && !project.thumbnail && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
            <span
              className="font-arabic text-center text-lg leading-snug"
              style={{ color: textColor, textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}
            >
              ﴾ {project.surahName} ﴿
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--ink-deep)]/70 via-transparent to-transparent" />

        {/* Selection checkbox (selection mode only) */}
        {selectable && (
          <span
            className={`pointer-events-none absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 backdrop-blur-sm transition-colors ${
              selected
                ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--ink-deep)]"
                : "border-white/70 bg-[var(--ink-deep)]/50 text-transparent"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete project"
          className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ink-deep)]/70 text-[var(--muted)] opacity-0 backdrop-blur-sm transition-all hover:text-red-400 group-hover:opacity-100 ${
            selectable ? "hidden" : ""
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="px-1 pb-1">
        <h3 className="truncate font-display text-sm tracking-wide text-parchment">
          {project.name}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span>{project.surahName}</span>
          <span className="text-gold/40">·</span>
          <span>{project.selectedVerseNumbers.length} verses</span>
        </p>
        <p className="mt-1.5 text-[11px] text-[var(--muted-deep)]">
          {formatTimeAgo(project.updatedAt)}
        </p>
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
