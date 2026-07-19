import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  bulkYoutubeRangeError,
  validateSourceLink,
  youtubeRangeError,
  type SourcePlatform,
} from "@/lib/source-link";
import { checkRateLimit, rateLimitHeaders, releaseRateLimit } from "@/lib/server-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 750 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 300_000;
const BULK_DOWNLOAD_TIMEOUT_MS = 9 * 60_000;
export type SourceImportQuality = "fast" | "hd";

// YouTube frequently throttles 720p/1080p DASH streams to close to playback
// speed. Its 480p H.264 stream is commonly delivered at ordinary download
// speed and remains sufficient for split-screen/mobile compositions. Keep HD
// as an explicit creator choice rather than making every draft wait for it.
const YOUTUBE_FORMATS: Record<SourceImportQuality, string> = {
  fast: "bv*[height<=480][fps<=30][vcodec^=avc1]+ba[ext=m4a]/b[height<=480][fps<=30][ext=mp4]",
  hd: "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4]",
};
const SOURCE_IMPORT_RATE_LIMIT = {
  namespace: "source-import",
  // A shared home, school, mosque, or mobile-carrier address must not lock out
  // legitimate creators during a review session. Completed imports alone use
  // this allowance; validation and extractor failures release their slot.
  limit: 30,
  windowMs: 10 * 60_000,
};
function downloadErrorMessage(stderr: string, platform: SourcePlatform): string {
  const lower = stderr.toLowerCase();
  if (lower.includes("login") || lower.includes("private") || lower.includes("not available")) {
    return platform === "youtube"
      ? "That YouTube video is private, restricted, or unavailable. Public videos and your permitted uploads are supported."
      : "That post is private, restricted, or unavailable. Try a public TikTok or Instagram post.";
  }
  if (lower.includes("unsupported url")) {
    return "That link is not a supported YouTube, TikTok, or Instagram video.";
  }
  return platform === "youtube"
    ? "AyahClip could not import that public segment right now. Check the times and try once more."
    : "AyahClip could not resolve that post right now. Check the link and try again.";
}

export function buildSourceDownloadArgs({
  platform,
  url,
  outputTemplate,
  startSeconds,
  endSeconds,
  quality = "fast",
}: {
  platform: SourcePlatform;
  url: string;
  outputTemplate: string;
  startSeconds?: number;
  endSeconds?: number;
  quality?: SourceImportQuality;
}): string[] {
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--restrict-filenames",
    "--socket-timeout", "25",
    "--retries", "2",
    "--concurrent-fragments", "4",
  ];
  if (platform === "youtube") {
    args.push(
      "--download-sections", `*${startSeconds}-${endSeconds}`,
      "--no-force-keyframes-at-cuts",
      "--merge-output-format", "mp4",
      "--remux-video", "mp4",
      "--format", YOUTUBE_FORMATS[quality],
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
    bulk?: unknown;
    quality?: unknown;
  };
  const source = validateSourceLink(input?.url);
  if (!source) {
    return Response.json({ error: "Paste a supported YouTube, TikTok, or Instagram video link." }, { status: 400 });
  }

  let startSeconds: number | undefined;
  let endSeconds: number | undefined;
  const quality: SourceImportQuality = input.quality === "hd" ? "hd" : "fast";
  if (source.platform === "youtube") {
    if (input.attestedRights !== true) {
      return Response.json(
        { error: "Confirm that you own this YouTube video or have permission to edit it." },
        { status: 400 },
      );
    }
    startSeconds = typeof input.startSeconds === "number" ? input.startSeconds : NaN;
    endSeconds = typeof input.endSeconds === "number" ? input.endSeconds : NaN;
    const rangeError = input.bulk === true
      ? bulkYoutubeRangeError(startSeconds, endSeconds)
      : youtubeRangeError(startSeconds, endSeconds);
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
    const ytDlpPath = process.env.AYAHCLIP_YTDLP_PATH || "yt-dlp";
    const commandOptions = {
      timeout: input.bulk === true ? BULK_DOWNLOAD_TIMEOUT_MS : DOWNLOAD_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    };

    const processingStartedAt = Date.now();
    await execFileAsync(ytDlpPath, buildSourceDownloadArgs({
      platform: source.platform,
      url: source.url.toString(),
      outputTemplate,
      startSeconds,
      endSeconds,
      quality,
    }), commandOptions);

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
        "X-AyahClip-Import-Quality": source.platform === "youtube" ? quality : "source",
        "X-AyahClip-Processing-Ms": String(Date.now() - processingStartedAt),
      },
    });
  } catch (error) {
    await rm(workDirectory, { recursive: true, force: true });
    // Failed extractor/network attempts should not lock a legitimate creator
    // out. Only completed imports consume the rolling anti-abuse allowance.
    releaseRateLimit(request, SOURCE_IMPORT_RATE_LIMIT);
    const stderr = typeof error === "object" && error && "stderr" in error
      ? String((error as { stderr?: unknown }).stderr ?? "")
      : error instanceof Error ? error.message : "";
    return Response.json({ error: downloadErrorMessage(stderr, source.platform) }, { status: 422 });
  }
}
