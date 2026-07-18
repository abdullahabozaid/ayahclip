import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 750 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 150_000;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT = 6;
const requestWindows = new Map<string, number[]>();
const SUPPORTED_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "instagram.com",
  "www.instagram.com",
]);

function validatedPostURL(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !SUPPORTED_HOSTS.has(url.hostname.toLowerCase())) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function downloadErrorMessage(stderr: string): string {
  const lower = stderr.toLowerCase();
  if (lower.includes("login") || lower.includes("private") || lower.includes("not available")) {
    return "That post is private, restricted, or unavailable. Try a public TikTok or Instagram post.";
  }
  if (lower.includes("unsupported url")) {
    return "That link is not a supported TikTok or Instagram post.";
  }
  return "AyahClip could not resolve that post right now. Check the link and try again.";
}

function isRateLimited(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || request.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  const recent = (requestWindows.get(key) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    requestWindows.set(key, recent);
    return true;
  }
  recent.push(now);
  requestWindows.set(key, recent);
  if (requestWindows.size > 2_000) {
    for (const [candidate, times] of requestWindows) {
      if (times.every((time) => now - time >= RATE_WINDOW_MS)) requestWindows.delete(candidate);
    }
  }
  return false;
}

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return Response.json(
      { error: "Too many link imports. Wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Paste a complete TikTok or Instagram link." }, { status: 400 });
  }

  const postURL = validatedPostURL((body as { url?: unknown })?.url);
  if (!postURL) {
    return Response.json({ error: "Paste a public TikTok or Instagram post link." }, { status: 400 });
  }

  const workDirectory = await mkdtemp(join(tmpdir(), "ayahclip-social-"));
  const outputTemplate = join(workDirectory, "%(extractor)s-%(id)s.%(ext)s");
  try {
    await execFileAsync("yt-dlp", [
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--restrict-filenames",
      "--socket-timeout", "25",
      "--retries", "2",
      "--max-filesize", String(MAX_FILE_BYTES),
      // Prefer an iPhone-compatible, non-watermarked platform source. TikTok's
      // explicit `download` format is labelled watermarked by its extractor;
      // the H.264 playback variants are the clean source SnapTik-style tools use.
      "--format", "b[format_note!*=watermarked][vcodec^=h264]/b[format_note!*=watermarked]/b",
      "--output", outputTemplate,
      postURL.toString(),
    ], {
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    const files = await readdir(workDirectory);
    const filename = files.find((item) => item.toLowerCase().endsWith(".mp4"));
    if (!filename) throw new Error("No MP4 source was returned");
    const filePath = join(workDirectory, filename);
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile() || fileInfo.size <= 0 || fileInfo.size > MAX_FILE_BYTES) {
      throw new Error("Resolved source exceeded the import limit");
    }

    const nodeStream = createReadStream(filePath);
    nodeStream.once("close", () => void rm(workDirectory, { recursive: true, force: true }));
    nodeStream.once("error", () => void rm(workDirectory, { recursive: true, force: true }));
    return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(fileInfo.size),
        "Content-Disposition": `attachment; filename="${filename.replace(/["\\]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    await rm(workDirectory, { recursive: true, force: true });
    const stderr = typeof error === "object" && error && "stderr" in error
      ? String((error as { stderr?: unknown }).stderr ?? "")
      : error instanceof Error ? error.message : "";
    return Response.json({ error: downloadErrorMessage(stderr) }, { status: 422 });
  }
}
