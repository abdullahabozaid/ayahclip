"use client";

// Clip library + content calendar: every export lands here as a draft; clips
// can be scheduled to a date/platform (storage only — no actual posting),
// browsed by reciter, previewed, downloaded, and marked posted.
import { useEffect, useMemo, useRef, useState } from "react";
import { NewClipLink } from "@/components/NewClipLink";
import { InlineActionPrompt } from "@/components/InlineActionPrompt";
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
  migrateLegacyClips,
} from "@/lib/clip-library";

type LibraryDeleteRequest =
  | { kind: "folder"; name: string }
  | { kind: "clips"; ids: string[]; title: string };

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
  const [notice, setNotice] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [deleteRequest, setDeleteRequest] = useState<LibraryDeleteRequest | null>(null);
  const [deleting, setDeleting] = useState(false);
  // iOS WebKit only opens the picker reliably from a real <input> the button forwards to.
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Move any clips from the old per-browser IndexedDB store into the shared
    // server store, then load everything from the server.
    migrateLegacyClips()
      .then(() => Promise.all([listClips(), listFolders()]))
      .then(([c, f]) => {
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
        else setNotice(`Could not store “${file.name}”. Browser storage may be full; free some space and try again.`);
      }
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const addFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    setFolders(await createFolder(name));
    setFolderFilter(name);
    setFolderName("");
    setCreatingFolder(false);
  };

  const removeFolder = (name: string) => {
    setDeleteRequest({ kind: "folder", name });
  };

  // Multi-select for bulk move/delete.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkMove = async (folder: string) => {
    const ids = visibleSelected;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    await Promise.all(ids.map((id) => updateClip(id, { folder: folder || undefined })));
    setClips((cs) =>
      cs.map((c) => (idSet.has(c.id) ? { ...c, folder: folder || undefined } : c))
    );
    setSelected(new Set());
  };

  const bulkDelete = () => {
    const ids = visibleSelected;
    if (ids.length === 0) return;
    setDeleteRequest({ kind: "clips", ids, title: `Delete ${ids.length} selected clip${ids.length === 1 ? "" : "s"}?` });
  };

  const [sharing, setSharing] = useState(false);
  // Mass AirDrop / share: load every selected clip's video and hand them all to
  // the OS share sheet at once. On macOS Safari / iOS that sheet includes
  // AirDrop, so this is "select many → AirDrop them together". Browsers that
  // can't share files (e.g. desktop Chrome) get a per-file download fallback.
  const bulkShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const visibleIds = new Set(visibleSelected);
      const chosen = clips.filter((c) => visibleIds.has(c.id));
      const files: File[] = [];
      for (const c of chosen) {
        const blob = await getClipBlob(c.id);
        if (!blob) continue;
        const ext = c.mimeType.includes("mp4") ? "mp4" : "webm";
        files.push(
          new File([blob], `${c.title.replace(/[^\w\-– ]+/g, "")}.${ext}`, {
            type: c.mimeType,
          })
        );
      }
      if (files.length === 0) {
        setNotice("No stored video data was found for the selected clips.");
        return;
      }
      if (typeof navigator.canShare === "function" && navigator.canShare({ files })) {
        try {
          await navigator.share({ files, title: "AyahClip clips" });
          setSelected(new Set());
          return;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return; // user cancelled
          // Otherwise fall through to download.
        }
      } else {
        setNotice("AirDrop and file sharing need Safari on Mac or iPhone. The clips are being downloaded so you can share them from Finder.");
      }
      // Fallback: download each clip (small stagger so the browser allows them all).
      for (const file of files) {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 250));
      }
      setSelected(new Set());
    } finally {
      setSharing(false);
    }
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

  // Bulk actions must only ever touch what the user can SEE. `selected` is keyed
  // by id and survives filter changes, so a stale id (its clip filtered out of
  // view) would otherwise be silently deleted/moved by a bulk action. Intersect
  // with the visible set before any action reads it.
  const filteredIds = new Set(filtered.map((c) => c.id));
  const visibleSelected = useMemo(
    () => [...selected].filter((id) => filteredIds.has(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, filtered]
  );
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const counts = {
    draft: clips.filter((c) => c.status === "draft").length,
    scheduled: clips.filter((c) => c.status === "scheduled").length,
    posted: clips.filter((c) => c.status === "posted").length,
  };

  const patch = async (id: string, p: Partial<Omit<LibraryClip, "id">>) => {
    const next = await updateClip(id, p);
    if (next) setClips((cs) => cs.map((c) => (c.id === id ? next : c)));
  };

  const remove = (clip: LibraryClip) => {
    setDeleteRequest({ kind: "clips", ids: [clip.id], title: `Delete “${clip.title}”?` });
  };

  const confirmDelete = async () => {
    if (!deleteRequest || deleting) return;
    setDeleting(true);
    try {
      if (deleteRequest.kind === "folder") {
        const name = deleteRequest.name;
        setFolders(await deleteFolder(name));
        setClips((current) => current.map((clip) => clip.folder === name ? { ...clip, folder: undefined } : clip));
        if (folderFilter === name) setFolderFilter("all");
      } else {
        const idSet = new Set(deleteRequest.ids);
        await Promise.all(deleteRequest.ids.map((id) => deleteClip(id)));
        setClips((current) => current.filter((clip) => !idSet.has(clip.id)));
        setSelected((current) => new Set([...current].filter((id) => !idSet.has(id))));
        if (playingId && idSet.has(playingId)) {
          setPlayingId(null);
          setPlayingUrl(null);
        }
      }
      setDeleteRequest(null);
    } finally {
      setDeleting(false);
    }
  };

  const togglePlay = async (clip: LibraryClip) => {
    if (playingId === clip.id) {
      setPlayingId(null);
      setPlayingUrl(null);
      return;
    }
    const blob = await getClipBlob(clip.id);
    if (!blob) {
      setNotice("This clip’s video data is missing. Re-export the source project to create a complete copy.");
      return;
    }
    setPlayingId(clip.id);
    setPlayingUrl(URL.createObjectURL(blob));
  };

  const download = async (clip: LibraryClip) => {
    const blob = await getClipBlob(clip.id);
    if (!blob) {
      setNotice("This clip’s video data is missing. Re-export the source project to create a complete copy.");
      return;
    }
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
            aria-label="Upload video clips"
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
            aria-label="Filter by reciter"
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
            aria-label="Filter by status"
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

      {deleteRequest && (
        <div className="mb-5">
          <InlineActionPrompt
            title={deleteRequest.kind === "folder" ? `Delete folder “${deleteRequest.name}”?` : deleteRequest.title}
            description={deleteRequest.kind === "folder" ? "The clips will stay in your library and move to No folder." : "The stored video files will be permanently removed from this browser."}
            confirmLabel={deleteRequest.kind === "folder" ? "Delete folder" : deleteRequest.ids.length === 1 ? "Delete clip" : `Delete ${deleteRequest.ids.length} clips`}
            onConfirm={confirmDelete}
            onCancel={() => setDeleteRequest(null)}
            busy={deleting}
          />
        </div>
      )}

      {notice && (
        <div role="status" className="mb-5 flex items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-white/[0.035] px-4 py-3 text-sm text-parchment/80">
          <p className="min-w-0 flex-1">{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-white/[0.04] hover:text-parchment">×</button>
        </div>
      )}

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
          onClick={() => setCreatingFolder(true)}
          className="rounded-full border border-dashed border-[var(--hairline)] px-3 py-1.5 text-xs text-gold-soft/80 transition-colors hover:border-gold hover:text-gold"
        >
          + New folder
        </button>
        {creatingFolder && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void addFolder();
            }}
            className="flex w-full items-center gap-2 pt-2 sm:w-auto sm:pt-0"
          >
            <label className="sr-only" htmlFor="new-folder-name">Folder name</label>
            <input
              id="new-folder-name"
              autoFocus
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Folder name"
              className="field min-h-11 min-w-0 flex-1 px-3 text-sm sm:w-48"
            />
            <button type="submit" disabled={!folderName.trim()} className="btn-gold min-h-11 rounded-full px-4 text-sm disabled:opacity-40">Create</button>
            <button type="button" onClick={() => { setCreatingFolder(false); setFolderName(""); }} className="min-h-11 rounded-full px-3 text-sm text-[var(--muted)] hover:text-parchment">Cancel</button>
          </form>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="sticky top-[72px] z-30 mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--gold)]/30 bg-[var(--ink-deep)]/95 px-4 py-2.5 backdrop-blur">
          <button
            onClick={() => {
              setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((c) => c.id)));
            }}
            className="rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-xs text-parchment transition-colors hover:border-gold"
          >
            {allVisibleSelected ? "Deselect All" : "Select All"}
          </button>
          {visibleSelected.length > 0 && (
            <span className="text-sm text-gold-soft">{visibleSelected.length} selected</span>
          )}
          {visibleSelected.length > 0 && (
            <>
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value === "__none__") bulkMove("");
                  else if (e.target.value) bulkMove(e.target.value);
                  e.target.value = "";
                }}
                className="field px-3 py-1.5 text-xs"
              >
                <option value="" disabled>
                  Move to folder…
                </option>
                <option value="__none__">No folder</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    📁 {f}
                  </option>
                ))}
              </select>
              <button
                onClick={bulkShare}
                disabled={sharing}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--gold)]/40 px-3 py-1.5 text-xs text-gold-soft transition-colors hover:bg-[var(--gold)]/10 disabled:opacity-50"
                title="Share the selected clips via the OS sheet (AirDrop on Mac/iPhone)"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14" />
                </svg>
                {sharing ? "Preparing…" : "Share / AirDrop"}
              </button>
              <button
                onClick={bulkDelete}
                className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
              >
                Delete
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="ml-auto text-xs text-[var(--muted)] hover:text-parchment"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {loaded && clips.length === 0 && (
        <div className="panel mx-auto max-w-lg px-8 py-16 text-center">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--hairline)] text-2xl text-gold-soft">
            ﷽
          </span>
          <h2 className="font-display text-2xl text-parchment">Your library is empty</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
            Every clip you export is saved here automatically, ready to preview,
            gather into folders, and schedule across TikTok, Reels, and Shorts.
          </p>
          <NewClipLink href="/browse" className="btn-gold mt-7 inline-block rounded-full px-6 py-3 text-sm">
            Make your first clip
          </NewClipLink>
        </div>
      )}

      {view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              folders={folders}
              selected={selected.has(clip.id)}
              onToggleSelect={() => toggleSelect(clip.id)}
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
                    selected={selected.has(clip.id)}
                    onToggleSelect={() => toggleSelect(clip.id)}
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
                    selected={selected.has(clip.id)}
                    onToggleSelect={() => toggleSelect(clip.id)}
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
  selected,
  onToggleSelect,
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
  selected: boolean;
  onToggleSelect: () => void;
  playing: string | null;
  scheduling: boolean;
  onToggleSchedule: () => void;
  onPatch: (p: Partial<Omit<LibraryClip, "id">>) => void;
  onPlay: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // While previewing, freeze the current frame as the clip's thumbnail —
  // scrub to the moment you want, then tap the camera.
  const setThumbFromFrame = () => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    const w = 480;
    const h = Math.round((v.videoHeight / v.videoWidth) * w);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    onPatch({ thumbnail: canvas.toDataURL("image/jpeg", 0.85) });
  };

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-[var(--surface)] transition-colors ${
        selected ? "border-[var(--gold)]" : "border-[var(--hairline-soft)]"
      }`}
    >
      <div className="relative">
        <button
          onClick={onPlay}
          className="relative block aspect-[9/16] w-full bg-black"
          aria-label={playing ? "Stop preview" : "Play preview"}
        >
          {playing ? (
            <video
              ref={videoRef}
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          aria-label={selected ? "Deselect clip" : "Select clip"}
          className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] backdrop-blur transition-colors ${
            selected
              ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--ink-deep)]"
              : "border-white/40 bg-black/40 text-transparent hover:border-white"
          }`}
        >
          ✓
        </button>
        {playing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setThumbFromFrame();
            }}
            className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1.5 text-[11px] text-white backdrop-blur transition-colors hover:bg-black/80"
            title="Use the current frame as this clip's thumbnail"
          >
            📷 Set thumbnail
          </button>
        )}
      </div>

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
