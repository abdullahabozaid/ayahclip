import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  validateSourceLink,
  youtubeRangeError,
  type SourcePlatform,
} from "@/lib/source-link";
import { checkRateLimit, rateLimitHeaders } from "@/lib/server-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 750 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 300_000;
const SOURCE_IMPORT_RATE_LIMIT = {
  namespace: "source-import",
  limit: 12,
  windowMs: 10 * 60_000,
};
function downloadErrorMessage(stderr: string, platform: SourcePlatform): string {
  const lower = stderr.toLowerCase();
  if (lower.includes("login") || lower.includes("private") || lower.includes("not available")) {
    return platform === "youtube"
      ? "That YouTube video is private, restricted, or unavailable. You can download your upload in YouTube Studio and add the file instead."
      : "That post is private, restricted, or unavailable. Try a public TikTok or Instagram post.";
  }
  if (lower.includes("unsupported url")) {
    return "That link is not a supported YouTube, TikTok, or Instagram video.";
  }
  return platform === "youtube"
    ? "AyahClip could not import that segment. Check the times, or download your upload in YouTube Studio and add the file instead."
    : "AyahClip could not resolve that post right now. Check the link and try again.";
}

export function buildSourceDownloadArgs({
  platform,
  url,
  outputTemplate,
  startSeconds,
  endSeconds,
}: {
  platform: SourcePlatform;
  url: string;
  outputTemplate: string;
  startSeconds?: number;
  endSeconds?: number;
}): string[] {
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--restrict-filenames",
    "--socket-timeout", "25",
    "--retries", "2",
  ];
  if (platform === "youtube") {
    args.push(
      "--download-sections", `*${startSeconds}-${endSeconds}`,
      "--force-keyframes-at-cuts",
      "--merge-output-format", "mp4",
      "--recode-video", "mp4",
      "--format", "bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/b[height<=1080][vcodec^=avc1]",
    );
  } else {
    // Prefer an iPhone-compatible, non-watermarked platform source. TikTok's
    // explicit `download` format is labelled watermarked by its extractor;
    // the H.264 playback variants are the clean source Repost-style tools use.
    args.push(
      "--max-filesize", String(MAX_FILE_BYTES),
      "--format", "b[format_note!*=watermarked][vcodec^=h264]/b[format_note!*=watermarked]/b",
    );
  }
  args.push("--output", outputTemplate, url);
  return args;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Paste a complete YouTube, TikTok, or Instagram video link." }, { status: 400 });
  }

  const input = body as {
    url?: unknown;
    startSeconds?: unknown;
    endSeconds?: unknown;
    attestedRights?: unknown;
  };
  const source = validateSourceLink(input?.url);
  if (!source) {
    return Response.json({ error: "Paste a supported YouTube, TikTok, or Instagram video link." }, { status: 400 });
  }

  let startSeconds: number | undefined;
  let endSeconds: number | undefined;
  if (source.platform === "youtube") {
    if (input.attestedRights !== true) {
      return Response.json(
        { error: "Confirm that you own this YouTube video or have permission to edit it." },
        { status: 400 },
      );
    }
    startSeconds = typeof input.startSeconds === "number" ? input.startSeconds : NaN;
    endSeconds = typeof input.endSeconds === "number" ? input.endSeconds : NaN;
    const rangeError = youtubeRangeError(startSeconds, endSeconds);
    if (rangeError) return Response.json({ error: rangeError }, { status: 400 });
  }

  // Only a validated request that is about to start yt-dlp consumes quota.
  // Typos, rights prompts, malformed timestamps, and API readiness probes must
  // not lock a creator out of the real import they are trying to make.
  const rateLimit = checkRateLimit(request, SOURCE_IMPORT_RATE_LIMIT);
  if (!rateLimit.allowed) {
    const minutes = Math.max(1, Math.ceil(rateLimit.retryAfterSeconds / 60));
    return Response.json(
      { error: `Too many completed import attempts from this connection. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  const workDirectory = await mkdtemp(join(tmpdir(), "ayahclip-social-"));
  const outputTemplate = join(workDirectory, "%(extractor)s-%(id)s.%(ext)s");
  try {
    await execFileAsync(process.env.AYAHCLIP_YTDLP_PATH || "yt-dlp", buildSourceDownloadArgs({
      platform: source.platform,
      url: source.url.toString(),
      outputTemplate,
      startSeconds,
      endSeconds,
    }), {
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
    return Response.json({ error: downloadErrorMessage(stderr, source.platform) }, { status: 422 });
  }
}
