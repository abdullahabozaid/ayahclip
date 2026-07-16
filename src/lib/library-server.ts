// Server-side clip library store. Clips live on disk under the user's Documents
// folder, so every browser hitting this local server (Chrome, Safari, …) shares
// ONE library — IndexedDB was per-browser. Metadata is one JSON file per clip;
// the video is a sibling file. No DB engine needed: the filesystem is the store,
// and the files are human-visible/back-up-able.
import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { NextRequest } from "next/server";
import type { LibraryClip } from "./clip-library";

const ROOT = join(homedir(), "Documents", "AyahClip", "Library");
const VIDEOS = join(ROOT, "videos");
const META = join(ROOT, "meta");
const FOLDERS_FILE = join(ROOT, "folders.json");

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

async function ensureDirs(): Promise<void> {
  await fs.mkdir(VIDEOS, { recursive: true });
  await fs.mkdir(META, { recursive: true });
}

/** Reject anything that isn't one of our generated ids — blocks path traversal. */
function safeId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("invalid clip id");
  return id;
}

/**
 * Reduce a client-supplied content type to one of our two known-safe video
 * types, ignoring any `;codecs=…` suffix. Returns null for anything else so the
 * upload can be rejected — this prevents a stored clip from carrying an
 * arbitrary Content-Type (e.g. text/html) that the video route would later echo
 * back on the same origin (stored XSS).
 */
export function canonicalVideoType(
  mimeType: string
): "video/mp4" | "video/webm" | null {
  const base = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (base === "video/mp4") return "video/mp4";
  if (base === "video/webm") return "video/webm";
  return null;
}

function videoExt(mimeType: string): string {
  return mimeType.includes("webm") ? "webm" : "mp4";
}

function videoPath(id: string, mimeType: string): string {
  return join(VIDEOS, `${safeId(id)}.${videoExt(mimeType)}`);
}

export async function listMeta(): Promise<LibraryClip[]> {
  await ensureDirs();
  const files = await fs.readdir(META).catch(() => [] as string[]);
  const clips: LibraryClip[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      clips.push(JSON.parse(await fs.readFile(join(META, f), "utf8")) as LibraryClip);
    } catch {
      /* skip a corrupt entry rather than failing the whole list */
    }
  }
  return clips.sort((a, b) => b.createdAt - a.createdAt);
}

export async function readMeta(id: string): Promise<LibraryClip | null> {
  try {
    return JSON.parse(await fs.readFile(join(META, `${safeId(id)}.json`), "utf8")) as LibraryClip;
  } catch {
    return null;
  }
}

/**
 * Write metadata atomically. A bare writeFile that is interrupted (crash, disk
 * full) leaves truncated JSON, which listMeta then silently skips — the clip
 * disappears from the UI while its video leaks on disk forever. rename() within
 * a filesystem is atomic, so a reader sees either the old file or the new one.
 */
export async function writeMeta(meta: LibraryClip): Promise<void> {
  await ensureDirs();
  const target = join(META, `${safeId(meta.id)}.json`);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(meta));
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp).catch(() => {});
    throw err;
  }
}

export async function writeVideo(id: string, mimeType: string, data: Buffer): Promise<void> {
  await ensureDirs();
  await fs.writeFile(videoPath(id, mimeType), data);
}

export async function readVideo(meta: LibraryClip): Promise<Buffer | null> {
  try {
    return await fs.readFile(videoPath(meta.id, meta.mimeType));
  } catch {
    return null;
  }
}

export async function removeClip(meta: LibraryClip): Promise<void> {
  await fs.rm(join(META, `${safeId(meta.id)}.json`)).catch(() => {});
  await fs.rm(videoPath(meta.id, meta.mimeType)).catch(() => {});
}

export async function listFolders(): Promise<string[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(FOLDERS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((f) => typeof f === "string") : [];
  } catch {
    return [];
  }
}

export async function writeFolders(folders: string[]): Promise<void> {
  await ensureDirs();
  const tmp = `${FOLDERS_FILE}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(folders));
    await fs.rename(tmp, FOLDERS_FILE);
  } catch (err) {
    await fs.rm(tmp).catch(() => {});
    throw err;
  }
}

/**
 * Only the local dev origin (or a LAN device, e.g. the phone) may mutate the
 * on-disk store. Browsers always send Origin on POST, so a missing Origin means
 * a non-browser client → deny. Mirrors the save-export route's guard.
 */
export function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  return (
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

/** The disk-backed library is a localhost/LAN feature. Public deployments use
 * private browser storage and must never expose a shared server filesystem. */
export function localRequestAllowed(req: NextRequest): boolean {
  const host = req.nextUrl.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  return (
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}
