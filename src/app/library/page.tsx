"use client";

// Clip library + content calendar: every export lands here as a draft; clips
// can be scheduled to a date/platform (storage only — no actual posting),
// browsed by reciter, previewed, downloaded, and marked posted.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LibraryClip,
  ClipStatus,
  ClipPlatform,
  listClips,
  saveClip,
  updateClip,
  deleteClip,
  getClipBlob,
  libraryTotalBytes,
  listFolders,
  createFolder,
  deleteFolder,
  captureThumbnail,
  generateClipId,
} from "@/lib/clip-library";

const PLATFORM_LABELS: Record<ClipPlatform, string> = {
  tiktok: "TikTok",
  reels: "Reels",
  shorts: "Shorts",
  other: "Other",
};

const STATUS_STYLE: Record<ClipStatus, string> = {
  draft: "bg-white/10 text-[var(--muted)]",
  scheduled: "bg-[var(--gold)]/15 text-gold-soft ring-1 ring-[var(--gold)]/30",
  posted: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30",
};

function fmtBytes(n: number): string {
  if (n > 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function LibraryPage() {
  const [clips, setClips] = useState<LibraryClip[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"grid" | "calendar">("grid");
  const [reciterFilter, setReciterFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ClipStatus>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [uploading, setUploading] = useState(false);
  // iOS WebKit only opens the picker reliably from a real <input> the button forwards to.
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([listClips(), listFolders()]).then(([c, f]) => {
      setClips(c);
      setFolders(f);
      setLoaded(true);
    });
  }, []);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const meta: LibraryClip = {
          id: generateClipId(),
          title: file.name.replace(/\.\w+$/, ""),
          surahName: "—",
          verseRange: "—",
          reciterName: "Uploaded",
          videoFormat: "—",
          mimeType: file.type || "video/mp4",
          size: file.size,
          createdAt: Date.now(),
          thumbnail: await captureThumbnail(file),
          status: "draft",
          folder: folderFilter !== "all" && folderFilter !== "none" ? folderFilter : undefined,
        };
        const ok = await saveClip(meta, file);
        if (ok) setClips((cs) => [meta, ...cs]);
        else alert(`Could not store "${file.name}" — storage may be full.`);
      }
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const addFolder = async () => {
    const name = prompt("Folder name");
    if (!name?.trim()) return;
    setFolders(await createFolder(name));
    setFolderFilter(name.trim());
  };

  const removeFolder = async (name: string) => {
    if (!confirm(`Delete folder "${name}"? Clips inside move back to the library.`)) return;
    setFolders(await deleteFolder(name));
    setClips((cs) => cs.map((c) => (c.folder === name ? { ...c, folder: undefined } : c)));
    if (folderFilter === name) setFolderFilter("all");
  };

  useEffect(() => {
    return () => {
      if (playingUrl) URL.revokeObjectURL(playingUrl);
    };
  }, [playingUrl]);

  const reciterNames = useMemo(
    () => Array.from(new Set(clips.map((c) => c.reciterName))).sort(),
    [clips]
  );

  const filtered = clips.filter(
    (c) =>
      (reciterFilter === "all" || c.reciterName === reciterFilter) &&
      (statusFilter === "all" || c.status === statusFilter) &&
      (folderFilter === "all" ||
        (folderFilter === "none" ? !c.folder : c.folder === folderFilter))
  );

  const counts = {
    draft: clips.filter((c) => c.status === "draft").length,
    scheduled: clips.filter((c) => c.status === "scheduled").length,
    posted: clips.filter((c) => c.status === "posted").length,
  };

  const patch = async (id: string, p: Partial<Omit<LibraryClip, "id">>) => {
    const next = await updateClip(id, p);
    if (next) setClips((cs) => cs.map((c) => (c.id === id ? next : c)));
  };

  const remove = async (clip: LibraryClip) => {
    if (!confirm(`Delete "${clip.title}"? The stored video is removed too.`)) return;
    await deleteClip(clip.id);
    setClips((cs) => cs.filter((c) => c.id !== clip.id));
    if (playingId === clip.id) {
      setPlayingId(null);
      setPlayingUrl(null);
    }
  };

  const togglePlay = async (clip: LibraryClip) => {
    if (playingId === clip.id) {
      setPlayingId(null);
      setPlayingUrl(null);
      return;
    }
    const blob = await getClipBlob(clip.id);
    if (!blob) return alert("Video data missing for this clip.");
    setPlayingId(clip.id);
    setPlayingUrl(URL.createObjectURL(blob));
  };

  const download = async (clip: LibraryClip) => {
    const blob = await getClipBlob(clip.id);
    if (!blob) return alert("Video data missing for this clip.");
    const ext = clip.mimeType.includes("mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clip.title.replace(/[^\w\-– ]+/g, "")}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calendar view: scheduled clips grouped by date (ascending), then the rest.
  const byDate = useMemo(() => {
    const sched = filtered
      .filter((c) => c.status === "scheduled" && c.scheduledFor)
      .sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));
    const groups = new Map<string, LibraryClip[]>();
    for (const c of sched) {
      const g = groups.get(c.scheduledFor!) ?? [];
      g.push(c);
      groups.set(c.scheduledFor!, g);
    }
    return groups;
  }, [filtered]);

  const unscheduled = filtered.filter((c) => c.status !== "scheduled");

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-parchment">Clip Library</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {clips.length} clips · {fmtBytes(libraryTotalBytes(clips))} stored ·{" "}
            <span className="text-gold-soft">{counts.scheduled} scheduled</span> ·{" "}
            {counts.draft} drafts · {counts.posted} posted
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={uploadInputRef}
            type="file"
            accept="video/*"
            multiple
            className="sr-only"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploading}
            className="btn-gold rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {uploading ? "Storing…" : "+ Upload clips"}
          </button>
          <select
            value={reciterFilter}
            onChange={(e) => setReciterFilter(e.target.value)}
            className="field px-3 py-2 text-sm"
          >
            <option value="all">All reciters</option>
            {reciterNames.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="field px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="draft">Drafts</option>
            <option value="scheduled">Scheduled</option>
            <option value="posted">Posted</option>
          </select>
          <div className="flex gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1">
            {(["grid", "calendar"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                  view === v
                    ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                    : "text-[var(--muted)] hover:text-parchment"
                }`}
              >
                {v === "grid" ? "Grid" : "Calendar"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Folder chips */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {[
          { id: "all", label: "All" },
          { id: "none", label: "No folder" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFolderFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              folderFilter === f.id
                ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                : "border border-[var(--hairline-soft)] text-[var(--muted)] hover:text-parchment"
            }`}
          >
            {f.label}
          </button>
        ))}
        {folders.map((f) => (
          <span
            key={f}
            className={`group flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-colors ${
              folderFilter === f
                ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                : "border border-[var(--hairline-soft)] text-[var(--muted)] hover:text-parchment"
            }`}
          >
            <button onClick={() => setFolderFilter(f)}>📁 {f}</button>
            <button
              onClick={() => removeFolder(f)}
              aria-label={`Delete folder ${f}`}
              className="opacity-40 transition-opacity hover:opacity-100"
            >
              ×
            </button>
          </span>
        ))}
        <button
          onClick={addFolder}
          className="rounded-full border border-dashed border-[var(--hairline)] px-3 py-1.5 text-xs text-gold-soft/80 transition-colors hover:border-gold hover:text-gold"
        >
          + New folder
        </button>
      </div>

      {loaded && clips.length === 0 && (
        <div className="rounded-2xl border border-[var(--hairline-soft)] py-20 text-center">
          <p className="font-display text-xl text-parchment">No clips yet</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Every video you export is kept here automatically, ready to schedule.
          </p>
        </div>
      )}

      {view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              folders={folders}
              playing={playingId === clip.id ? playingUrl : null}
              scheduling={schedulingId === clip.id}
              onToggleSchedule={() =>
                setSchedulingId(schedulingId === clip.id ? null : clip.id)
              }
              onPatch={(p) => patch(clip.id, p)}
              onPlay={() => togglePlay(clip)}
              onDownload={() => download(clip)}
              onDelete={() => remove(clip)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {byDate.size === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Nothing scheduled yet — open a clip in the grid and pick a date.
            </p>
          )}
          {[...byDate.entries()].map(([date, dayClips]) => (
            <section key={date}>
              <h2 className="mb-3 flex items-baseline gap-3 font-display text-lg text-gold-soft">
                {fmtDate(date)}
                <span className="text-xs text-[var(--muted)]">
                  {dayClips.length} clip{dayClips.length > 1 ? "s" : ""}
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {dayClips.map((clip) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    folders={folders}
                    playing={playingId === clip.id ? playingUrl : null}
                    scheduling={schedulingId === clip.id}
                    onToggleSchedule={() =>
                      setSchedulingId(schedulingId === clip.id ? null : clip.id)
                    }
                    onPatch={(p) => patch(clip.id, p)}
                    onPlay={() => togglePlay(clip)}
                    onDownload={() => download(clip)}
                    onDelete={() => remove(clip)}
                  />
                ))}
              </div>
            </section>
          ))}
          {unscheduled.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg text-[var(--muted)]">
                Unscheduled
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {unscheduled.map((clip) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    folders={folders}
                    playing={playingId === clip.id ? playingUrl : null}
                    scheduling={schedulingId === clip.id}
                    onToggleSchedule={() =>
                      setSchedulingId(schedulingId === clip.id ? null : clip.id)
                    }
                    onPatch={(p) => patch(clip.id, p)}
                    onPlay={() => togglePlay(clip)}
                    onDownload={() => download(clip)}
                    onDelete={() => remove(clip)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function ClipCard({
  clip,
  folders,
  playing,
  scheduling,
  onToggleSchedule,
  onPatch,
  onPlay,
  onDownload,
  onDelete,
}: {
  clip: LibraryClip;
  folders: string[];
  playing: string | null;
  scheduling: boolean;
  onToggleSchedule: () => void;
  onPatch: (p: Partial<Omit<LibraryClip, "id">>) => void;
  onPlay: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--hairline-soft)] bg-[var(--surface)]">
      <button
        onClick={onPlay}
        className="relative block aspect-[9/16] w-full bg-black"
        aria-label={playing ? "Stop preview" : "Play preview"}
      >
        {playing ? (
          <video
            src={playing}
            autoPlay
            controls
            playsInline
            className="h-full w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        ) : clip.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-3xl text-gold/40">
            ﷽
          </span>
        )}
        {!playing && (
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 backdrop-blur">
              <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-0.5 text-white" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        )}
      </button>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-parchment">{clip.title}</p>
            <p className="truncate text-[11px] text-[var(--muted)]">
              {clip.folder ? `📁 ${clip.folder} · ` : ""}{clip.reciterName} · {clip.videoFormat} · {fmtBytes(clip.size)}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] capitalize ${STATUS_STYLE[clip.status]}`}
          >
            {clip.status}
          </span>
        </div>

        {clip.status === "scheduled" && clip.scheduledFor && !scheduling && (
          <p className="text-[11px] text-gold-soft">
            {fmtDate(clip.scheduledFor)}
            {clip.platform ? ` · ${PLATFORM_LABELS[clip.platform]}` : ""}
          </p>
        )}

        {scheduling && (
          <div className="space-y-2 rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-2">
            <input
              type="date"
              value={clip.scheduledFor ?? ""}
              onChange={(e) =>
                onPatch({
                  scheduledFor: e.target.value || undefined,
                  status: e.target.value ? "scheduled" : "draft",
                })
              }
              className="field w-full px-2 py-1.5 text-xs"
            />
            <select
              value={clip.platform ?? ""}
              onChange={(e) =>
                onPatch({ platform: (e.target.value || undefined) as ClipPlatform | undefined })
              }
              className="field w-full px-2 py-1.5 text-xs"
            >
              <option value="">Platform…</option>
              {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={clip.folder ?? ""}
              onChange={(e) => onPatch({ folder: e.target.value || undefined })}
              className="field w-full px-2 py-1.5 text-xs"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  📁 {f}
                </option>
              ))}
            </select>
            {clip.status === "scheduled" && (
              <button
                onClick={() => onPatch({ status: "draft", scheduledFor: undefined })}
                className="w-full rounded-lg py-1 text-[11px] text-[var(--muted)] hover:text-parchment"
              >
                Unschedule
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            onClick={onToggleSchedule}
            className="flex-1 rounded-lg border border-[var(--hairline)] py-1.5 text-[11px] text-parchment transition-colors hover:border-gold"
          >
            {clip.status === "scheduled" ? "Reschedule" : "Schedule"}
          </button>
          {clip.status !== "posted" ? (
            <button
              onClick={() => onPatch({ status: "posted" })}
              className="flex-1 rounded-lg border border-emerald-400/30 py-1.5 text-[11px] text-emerald-300 transition-colors hover:bg-emerald-500/10"
            >
              Posted ✓
            </button>
          ) : (
            <button
              onClick={() => onPatch({ status: clip.scheduledFor ? "scheduled" : "draft" })}
              className="flex-1 rounded-lg border border-[var(--hairline)] py-1.5 text-[11px] text-[var(--muted)] hover:text-parchment"
            >
              Unmark
            </button>
          )}
          <button
            onClick={onDownload}
            aria-label="Download"
            className="rounded-lg border border-[var(--hairline)] p-1.5 text-parchment transition-colors hover:border-gold"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete"
            className="rounded-lg border border-[var(--hairline)] p-1.5 text-[var(--muted)] transition-colors hover:border-red-400/50 hover:text-red-300"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-7 0l1 13h6l1-13" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
