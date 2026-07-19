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
// The fast path temporarily holds both the source and the exact cut. Keep this
// deliberately below the public import cap so concurrent requests cannot turn
// the speed improvement into an avoidable disk-pressure spike.
const FAST_PATH_MAX_SOURCE_BYTES = 150 * 1024 * 1024;
const FAST_PATH_MAX_SOURCE_SECONDS = 15 * 60;
const DOWNLOAD_TIMEOUT_MS = 300_000;
const BULK_DOWNLOAD_TIMEOUT_MS = 9 * 60_000;
const YOUTUBE_FORMAT = "bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/b[height<=1080][vcodec^=avc1]";
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
      "--downloader-args", "ffmpeg_o:-preset veryfast",
      "--format", YOUTUBE_FORMAT,
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

export function buildYoutubeProbeArgs(url: string): string[] {
  return [
    "--no-playlist",
    "--no-warnings",
    "--simulate",
    "--socket-timeout", "25",
    "--retries", "2",
    "--format", YOUTUBE_FORMAT,
    "--print", "%(duration)s|%(filesize_approx)s",
    url,
  ];
}

export function parseYoutubeProbe(stdout: string): { durationSeconds: number; sourceBytes: number } | null {
  const [durationValue, sizeValue] = stdout.trim().split("|");
  const durationSeconds = Number(durationValue);
  const sourceBytes = Number(sizeValue);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  if (!Number.isFinite(sourceBytes) || sourceBytes <= 0) return null;
  return { durationSeconds, sourceBytes };
}

export function youtubeFastPathAllowed(probe: { durationSeconds: number; sourceBytes: number } | null): boolean {
  return Boolean(
    probe
    && probe.durationSeconds <= FAST_PATH_MAX_SOURCE_SECONDS
    && probe.sourceBytes <= FAST_PATH_MAX_SOURCE_BYTES,
  );
}

export function buildYoutubeFullDownloadArgs(url: string, outputTemplate: string): string[] {
  return [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--restrict-filenames",
    "--socket-timeout", "25",
    "--retries", "2",
    "--max-filesize", String(FAST_PATH_MAX_SOURCE_BYTES),
    "--merge-output-format", "mp4",
    "--remux-video", "mp4",
    "--format", YOUTUBE_FORMAT,
    "--output", outputTemplate,
    url,
  ];
}

export function buildExactCutArgs({
  sourcePath,
  outputPath,
  startSeconds,
  endSeconds,
}: {
  sourcePath: string;
  outputPath: string;
  startSeconds: number;
  endSeconds: number;
}): string[] {
  return [
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(startSeconds),
    "-i", sourcePath,
    "-t", String(endSeconds - startSeconds),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ];
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

    let usedFastPath = false;
    if (source.platform === "youtube" && startSeconds !== undefined && endSeconds !== undefined) {
      let fastPathStage = "probe";
      try {
        const probeResult = await execFileAsync(ytDlpPath, buildYoutubeProbeArgs(source.url.toString()), commandOptions);
        if (youtubeFastPathAllowed(parseYoutubeProbe(probeResult.stdout))) {
          fastPathStage = "download";
          const sourceTemplate = join(workDirectory, "source.%(ext)s");
          await execFileAsync(
            ytDlpPath,
            buildYoutubeFullDownloadArgs(source.url.toString(), sourceTemplate),
            commandOptions,
          );
          const sourceFiles = await readdir(workDirectory);
          fastPathStage = "locate-source";
          const sourceFilename = sourceFiles.find((item) => item.startsWith("source.") && item.endsWith(".mp4"));
          if (!sourceFilename) throw new Error("No MP4 source was returned for the fast path");
          fastPathStage = "cut";
          await execFileAsync(
            process.env.AYAHCLIP_FFMPEG_PATH || "ffmpeg",
            buildExactCutArgs({
              sourcePath: join(workDirectory, sourceFilename),
              outputPath: join(workDirectory, "youtube-segment.mp4"),
              startSeconds,
              endSeconds,
            }),
            commandOptions,
          );
          fastPathStage = "cleanup-source";
          await rm(join(workDirectory, sourceFilename), { force: true });
          usedFastPath = true;
        }
      } catch (error) {
        console.warn("[source-import] YouTube fast path unavailable", {
          stage: fastPathStage,
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        // Metadata can be missing or a source can change between probing and
        // download. The bounded range path below remains the safe fallback.
        const partialFiles = await readdir(workDirectory);
        await Promise.all(partialFiles.map((item) => rm(join(workDirectory, item), { force: true })));
      }
    }

    if (!usedFastPath) {
      await execFileAsync(ytDlpPath, buildSourceDownloadArgs({
        platform: source.platform,
        url: source.url.toString(),
        outputTemplate,
        startSeconds,
        endSeconds,
      }), commandOptions);
    }

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
    // Failed extractor/network attempts should not lock a legitimate creator
    // out. Only completed imports consume the rolling anti-abuse allowance.
    releaseRateLimit(request, SOURCE_IMPORT_RATE_LIMIT);
    const stderr = typeof error === "object" && error && "stderr" in error
      ? String((error as { stderr?: unknown }).stderr ?? "")
      : error instanceof Error ? error.message : "";
    return Response.json({ error: downloadErrorMessage(stderr, source.platform) }, { status: 422 });
  }
}
