// Clip library: every exported video can be kept here with scheduling metadata,
// so the user can build a content calendar (later.com-style) without leaving
// the app. Storage only — no actual posting. Metadata and video blobs live in
// IndexedDB under separate keys so listing the library never loads the videos.
import { get, set, del, keys, getMany } from "idb-keyval";

export type ClipStatus = "draft" | "scheduled" | "posted";
export type ClipPlatform = "tiktok" | "reels" | "shorts" | "other";

export interface LibraryClip {
  id: string;
  title: string;
  surahName: string;
  /** e.g. "1:1–7" */
  verseRange: string;
  reciterName: string;
  videoFormat: string;
  mimeType: string;
  /** Bytes of the stored video blob. */
  size: number;
  createdAt: number;
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

const META_PREFIX = "clip:";
const BLOB_PREFIX = "clipblob:";

function warn(op: string, err: unknown): void {
  console.warn(`[clip-library] ${op} failed`, err);
}

export function generateClipId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function saveClip(meta: LibraryClip, video: Blob): Promise<boolean> {
  try {
    await set(`${BLOB_PREFIX}${meta.id}`, video);
    await set(`${META_PREFIX}${meta.id}`, meta);
    return true;
  } catch (err) {
    warn("saveClip", err);
    return false;
  }
}

export async function listClips(): Promise<LibraryClip[]> {
  try {
    const allKeys = await keys();
    const metaKeys = allKeys.filter((k) => String(k).startsWith(META_PREFIX));
    if (metaKeys.length === 0) return [];
    const clips = (await getMany(metaKeys)) as LibraryClip[];
    return clips.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
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
    const meta = (await get(`${META_PREFIX}${id}`)) as LibraryClip | undefined;
    if (!meta) return undefined;
    const next = { ...meta, ...patch };
    await set(`${META_PREFIX}${id}`, next);
    return next;
  } catch (err) {
    warn("updateClip", err);
    return undefined;
  }
}

export async function deleteClip(id: string): Promise<void> {
  try {
    await del(`${META_PREFIX}${id}`);
    await del(`${BLOB_PREFIX}${id}`);
  } catch (err) {
    warn("deleteClip", err);
  }
}

export async function getClipBlob(id: string): Promise<Blob | undefined> {
  try {
    return await get(`${BLOB_PREFIX}${id}`);
  } catch (err) {
    warn("getClipBlob", err);
    return undefined;
  }
}

// ---- Folders ----
// Stored as a plain name list so empty folders persist; a clip's membership
// lives on its own metadata (`folder` field).
const FOLDERS_KEY = "clipfolders:list";

export async function listFolders(): Promise<string[]> {
  try {
    return ((await get(FOLDERS_KEY)) as string[] | undefined) ?? [];
  } catch (err) {
    warn("listFolders", err);
    return [];
  }
}

export async function createFolder(name: string): Promise<string[]> {
  const trimmed = name.trim();
  const folders = await listFolders();
  if (!trimmed || folders.includes(trimmed)) return folders;
  const next = [...folders, trimmed].sort((a, b) => a.localeCompare(b));
  try {
    await set(FOLDERS_KEY, next);
  } catch (err) {
    warn("createFolder", err);
  }
  return next;
}

/** Remove a folder; clips inside it move back to the top level. */
export async function deleteFolder(name: string): Promise<string[]> {
  const folders = (await listFolders()).filter((f) => f !== name);
  try {
    await set(FOLDERS_KEY, folders);
    const clips = await listClips();
    await Promise.all(
      clips
        .filter((c) => c.folder === name)
        .map((c) => updateClip(c.id, { folder: undefined }))
    );
  } catch (err) {
    warn("deleteFolder", err);
  }
  return folders;
}

/** Total bytes of stored clip videos — surfaced in the library so the user
 *  knows when IndexedDB quota is getting eaten. */
export function libraryTotalBytes(clips: LibraryClip[]): number {
  return clips.reduce((a, c) => a + (c.size || 0), 0);
}

/**
 * Capture a small first-frame thumbnail from a video blob. Best effort: any
 * failure (codec, autoplay policy) returns undefined and the clip just shows
 * a placeholder in the grid.
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
    // Nudge off frame 0 (often black) then draw.
    try {
      el.currentTime = Math.min(0.3, (el.duration || 1) / 4);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1500);
        el.addEventListener("seeked", () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    } catch {
      /* draw whatever frame we have */
    }
    const w = 180;
    const h = Math.round((el.videoHeight / Math.max(1, el.videoWidth)) * w) || 320;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(el, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.7);
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
