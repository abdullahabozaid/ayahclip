// Clip library client. Public deployments keep each visitor's videos private in
// IndexedDB. Localhost/LAN development uses the disk-backed API so browsers on
// the same editing machine can share one library.
import { get, set, keys, del } from "idb-keyval";

export type ClipStatus = "draft" | "scheduled" | "posted";
export type ClipPlatform = "tiktok" | "reels" | "shorts" | "other";
export type ClipKind = "import" | "export";

export interface LibraryClip {
  id: string;
  title: string;
  surahName: string;
  /** e.g. "1:1–7" */
  verseRange: string;
  reciterName: string;
  videoFormat: string;
  mimeType: string;
  /** Bytes of the stored video. */
  size: number;
  createdAt: number;
  /** Whether the file came from the user or an AyahClip render. Older records
   * omit this field and are treated as exports for backwards compatibility. */
  kind?: ClipKind;
  /** Tiny JPEG data URL of the first frame, for the library grid. */
  thumbnail?: string;
  status: ClipStatus;
  /** ISO date (yyyy-mm-dd) the clip is planned to go out. */
  scheduledFor?: string;
  platform?: ClipPlatform;
  notes?: string;
  /** User folder the clip lives in; undefined = top level. */
  folder?: string;
}

function warn(op: string, err: unknown): void {
  console.warn(`[clip-library] ${op} failed`, err);
}

const META_PREFIX = "clip:";
const BLOB_PREFIX = "clipblob:";
const FOLDERS_KEY = "clipfolders:list";

/** Public hosting has no durable per-user filesystem. Keep each visitor's
 * library private in their browser; localhost/LAN retains the shared disk API. */
function browserLibraryMode(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const lan = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
  return !local && !lan;
}

/**
 * Pick the timestamp (seconds) to grab a clip's thumbnail from. The first ~1s
 * is unusable — it's the clip-start fade (black) and, for video backgrounds, a
 * black t=0 frame — so we aim ~5s in, clamped just shy of the end, and fall
 * back to the midpoint for very short clips.
 */
export function thumbnailSeekTime(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 5; // unknown → aim ~5s; the browser clamps if shorter
  if (durationSec <= 1.2) return durationSec / 2; // too short to skip the fade — use the midpoint
  return Math.min(5, durationSec - 0.2);
}

export function generateClipId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function saveClip(meta: LibraryClip, video: Blob): Promise<boolean> {
  try {
    if (browserLibraryMode()) {
      await Promise.all([
        set(`${META_PREFIX}${meta.id}`, meta),
        set(`${BLOB_PREFIX}${meta.id}`, video),
      ]);
      return true;
    }
    const form = new FormData();
    form.append("file", video, `${meta.id}`);
    form.append("meta", JSON.stringify(meta));
    const res = await fetch("/api/library", { method: "POST", body: form });
    return res.ok;
  } catch (err) {
    warn("saveClip", err);
    return false;
  }
}

export async function listClips(): Promise<LibraryClip[]> {
  try {
    if (browserLibraryMode()) {
      const allKeys = await keys();
      const clips = await Promise.all(
        allKeys
          .filter((key) => String(key).startsWith(META_PREFIX))
          .map((key) => get(key) as Promise<LibraryClip | undefined>)
      );
      return clips.filter((clip): clip is LibraryClip => !!clip)
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    const res = await fetch("/api/library");
    if (!res.ok) return [];
    const { clips } = (await res.json()) as { clips: LibraryClip[] };
    return clips ?? [];
  } catch (err) {
    warn("listClips", err);
    return [];
  }
}

export async function updateClip(
  id: string,
  patch: Partial<Omit<LibraryClip, "id">>
): Promise<LibraryClip | undefined> {
  try {
    if (browserLibraryMode()) {
      const existing = await get(`${META_PREFIX}${id}`) as LibraryClip | undefined;
      if (!existing) return undefined;
      const next = { ...existing, ...patch, id: existing.id };
      await set(`${META_PREFIX}${id}`, next);
      return next;
    }
    const res = await fetch(`/api/library/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return undefined;
    const { clip } = (await res.json()) as { clip: LibraryClip };
    return clip;
  } catch (err) {
    warn("updateClip", err);
    return undefined;
  }
}

export async function deleteClip(id: string): Promise<void> {
  try {
    if (browserLibraryMode()) {
      await Promise.all([del(`${META_PREFIX}${id}`), del(`${BLOB_PREFIX}${id}`)]);
      return;
    }
    await fetch(`/api/library/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (err) {
    warn("deleteClip", err);
  }
}

export async function getClipBlob(id: string): Promise<Blob | undefined> {
  try {
    if (browserLibraryMode()) {
      return await get(`${BLOB_PREFIX}${id}`) as Blob | undefined;
    }
    const res = await fetch(`/api/library/${encodeURIComponent(id)}/video`);
    if (!res.ok) return undefined;
    return await res.blob();
  } catch (err) {
    warn("getClipBlob", err);
    return undefined;
  }
}

// ---- Folders ----
// A plain name list (so empty folders persist); a clip's membership lives on its
// own `folder` field.
export async function listFolders(): Promise<string[]> {
  try {
    if (browserLibraryMode()) {
      return (await get(FOLDERS_KEY) as string[] | undefined) ?? [];
    }
    const res = await fetch("/api/library/folders");
    if (!res.ok) return [];
    const { folders } = (await res.json()) as { folders: string[] };
    return folders ?? [];
  } catch (err) {
    warn("listFolders", err);
    return [];
  }
}

async function writeFolders(folders: string[]): Promise<string[]> {
  try {
    if (browserLibraryMode()) {
      await set(FOLDERS_KEY, folders);
      return folders;
    }
    const res = await fetch("/api/library/folders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folders }),
    });
    if (!res.ok) return folders;
    const out = (await res.json()) as { folders: string[] };
    return out.folders ?? folders;
  } catch (err) {
    warn("writeFolders", err);
    return folders;
  }
}

export async function createFolder(name: string): Promise<string[]> {
  const trimmed = name.trim();
  const folders = await listFolders();
  if (!trimmed || folders.includes(trimmed)) return folders;
  return writeFolders([...folders, trimmed].sort((a, b) => a.localeCompare(b)));
}

/** Remove a folder; clips inside it move back to the top level. */
export async function deleteFolder(name: string): Promise<string[]> {
  const folders = (await listFolders()).filter((f) => f !== name);
  const next = await writeFolders(folders);
  const clips = await listClips();
  await Promise.all(
    clips.filter((c) => c.folder === name).map((c) => updateClip(c.id, { folder: undefined }))
  );
  return next;
}

/** Total bytes of stored clip videos — surfaced in the library. */
export function libraryTotalBytes(clips: LibraryClip[]): number {
  return clips.reduce((a, c) => a + (c.size || 0), 0);
}

/**
 * One-time move of clips from the old per-browser IndexedDB store into the
 * shared server store. Runs in whichever browser still holds legacy clips; once
 * uploaded they appear in every browser. Skips entirely if the server is
 * unreachable (so the flag isn't set prematurely) or already migrated.
 */
export async function migrateLegacyClips(): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (browserLibraryMode()) return 0;
  if (localStorage.getItem("ayahclip:library-migrated") === "1") return 0;
  // Bail if the server store isn't reachable — try again next load.
  try {
    const ping = await fetch("/api/library");
    if (!ping.ok) return 0;
  } catch {
    return 0;
  }

  let migrated = 0;
  try {
    const allKeys = await keys();
    const metaKeys = allKeys.filter((k) => String(k).startsWith("clip:"));
    for (const mk of metaKeys) {
      const meta = (await get(mk)) as LibraryClip | undefined;
      if (!meta?.id) continue;
      const blob = (await get(`clipblob:${meta.id}`)) as Blob | undefined;
      if (!blob) continue;
      if (await saveClip(meta, blob)) {
        migrated++;
        await del(mk).catch(() => {});
        await del(`clipblob:${meta.id}`).catch(() => {});
      }
    }
    const legacyFolders = (await get("clipfolders:list")) as string[] | undefined;
    if (legacyFolders?.length) {
      const current = await listFolders();
      const merged = Array.from(new Set([...current, ...legacyFolders])).sort((a, b) =>
        a.localeCompare(b)
      );
      await writeFolders(merged);
      await del("clipfolders:list").catch(() => {});
    }
    localStorage.setItem("ayahclip:library-migrated", "1");
  } catch (err) {
    warn("migrateLegacyClips", err);
  }
  return migrated;
}

/**
 * Capture a small first-frame thumbnail from a video blob. Best effort: any
 * failure (codec, autoplay policy) returns undefined and the clip just shows a
 * placeholder in the grid.
 */
export async function captureThumbnail(video: Blob): Promise<string | undefined> {
  if (typeof document === "undefined") return undefined;
  const url = URL.createObjectURL(video);
  const el = document.createElement("video");
  try {
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.src = url;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("thumbnail timeout")), 5000);
      el.addEventListener("loadeddata", () => {
        clearTimeout(timer);
        resolve();
      });
      el.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("video load error"));
      });
    });
    // Seek past the clip-start fade (and a video background's black t=0 frame)
    // to a representative frame ~5s in before drawing.
    try {
      el.currentTime = thumbnailSeekTime(el.duration);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2500);
        el.addEventListener(
          "seeked",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      });
    } catch {
      /* draw whatever frame we have */
    }
    const w = 480;
    const h = Math.round((el.videoHeight / Math.max(1, el.videoWidth)) * w) || 854;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(el, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch (err) {
    warn("captureThumbnail", err);
    return undefined;
  } finally {
    // Detach before revoking, or the element keeps retrying the dead blob URL
    // and spams ERR_FILE_NOT_FOUND in the console.
    el.removeAttribute("src");
    el.load();
    URL.revokeObjectURL(url);
  }
}
