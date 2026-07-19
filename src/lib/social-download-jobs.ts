import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SourcePlatform } from "@/lib/source-link";
import { releaseRateLimitByKey } from "@/lib/server-rate-limit";

export type SourceImportQuality = "fast" | "hd";
export type SocialDownloadPhase = "starting" | "downloading" | "processing" | "ready" | "error";

export const MAX_FILE_BYTES = 750 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 300_000;
const BULK_DOWNLOAD_TIMEOUT_MS = 9 * 60_000;
// Finished files stay fetchable for a while so a flaky connection can retry
// the transfer without re-running yt-dlp; failed jobs only need to live long
// enough for the next status poll to read the error.
const READY_TTL_MS = 15 * 60_000;
const ERROR_TTL_MS = 5 * 60_000;
const STDERR_TAIL_LIMIT = 4_096;

// A distinctive prefix keeps progress lines trivially separable from the rest
// of yt-dlp's stdout. Fields: downloaded, total, total_estimate, eta.
const PROGRESS_PREFIX = "AC|";
const PROGRESS_TEMPLATE = `download:${PROGRESS_PREFIX}%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.eta)s`;

// YouTube frequently throttles 720p/1080p DASH streams to close to playback
// speed. Its 480p H.264 stream is commonly delivered at ordinary download
// speed and remains sufficient for split-screen/mobile compositions. Keep HD
// as an explicit creator choice rather than making every draft wait for it.
const YOUTUBE_FORMATS: Record<SourceImportQuality, string> = {
  fast: "bv*[height<=480][fps<=30][vcodec^=avc1]+ba[ext=m4a]/b[height<=480][fps<=30][ext=mp4]",
  hd: "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4]",
};

export function downloadErrorMessage(stderr: string, platform: SourcePlatform): string {
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
    "--newline",
    "--progress-template", PROGRESS_TEMPLATE,
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
      // Ranged downloads are delegated to ffmpeg, which bypasses yt-dlp's
      // progress hooks entirely; ffmpeg's own machine-readable progress on
      // stdout (out_time_us) is the only live signal for these jobs.
      "--downloader-args", "ffmpeg:-progress pipe:1 -nostats",
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

export interface ProgressSample {
  downloadedBytes: number;
  totalBytes: number | null;
  etaSeconds: number | null;
}

/**
 * Parse one ffmpeg `-progress pipe:1` line into processed media seconds.
 * ffmpeg's `out_time_ms` key is microseconds despite its name; `out_time_us`
 * is the honestly-named duplicate newer builds emit.
 */
export function parseFfmpegProgressSeconds(line: string): number | null {
  const match = line.trim().match(/^out_time_(?:us|ms)=(\d+)$/);
  if (!match) return null;
  const seconds = Number(match[1]) / 1_000_000;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/** Parse one `--progress-template` stdout line; null for non-progress lines. */
export function parseProgressLine(line: string): ProgressSample | null {
  const start = line.indexOf(PROGRESS_PREFIX);
  if (start === -1) return null;
  const fields = line.slice(start + PROGRESS_PREFIX.length).trim().split("|");
  if (fields.length !== 4) return null;
  const numeric = (value: string | undefined): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const downloaded = numeric(fields[0]);
  if (downloaded === null) return null;
  return {
    downloadedBytes: downloaded,
    totalBytes: numeric(fields[1]) ?? numeric(fields[2]),
    etaSeconds: numeric(fields[3]),
  };
}

export interface SocialDownloadJobStatus {
  status: SocialDownloadPhase;
  percent: number;
  downloadedBytes: number;
  totalBytes: number | null;
  etaSeconds: number | null;
  fileBytes?: number;
  error?: string;
}

interface SocialDownloadJob {
  id: string;
  phase: SocialDownloadPhase;
  platform: SourcePlatform;
  quality: SourceImportQuality | "source";
  downloadedBytes: number;
  totalBytes: number | null;
  etaSeconds: number | null;
  sectionSeconds: number | null;
  mediaPercent: number;
  workDirectory: string;
  filePath: string | null;
  fileName: string | null;
  fileBytes: number | null;
  error: string | null;
  stderrTail: string;
  child: ChildProcessWithoutNullStreams | null;
  rateLimitKey: string;
  rateLimitReleased: boolean;
  expiresAt: number;
}

// Jobs are per-process memory. Production is a single container, and the temp
// files live on its local disk anyway, so a shared store would buy nothing.
const jobs = new Map<string, SocialDownloadJob>();

function sweepExpiredJobs(now = Date.now()): void {
  for (const [id, job] of jobs) {
    if (job.expiresAt <= now && job.phase !== "downloading" && job.phase !== "starting" && job.phase !== "processing") {
      jobs.delete(id);
      void rm(job.workDirectory, { recursive: true, force: true });
    }
  }
}

function releaseSlotOnce(job: SocialDownloadJob): void {
  if (job.rateLimitReleased) return;
  job.rateLimitReleased = true;
  releaseRateLimitByKey(job.rateLimitKey);
}

function failJob(job: SocialDownloadJob, message: string): void {
  if (job.phase === "ready" || job.phase === "error") return;
  job.phase = "error";
  job.error = message;
  job.expiresAt = Date.now() + ERROR_TTL_MS;
  // Failed extractor/network attempts should not lock a legitimate creator
  // out. Only completed imports consume the rolling anti-abuse allowance.
  releaseSlotOnce(job);
  void rm(job.workDirectory, { recursive: true, force: true });
}

export async function startSocialDownloadJob({
  platform,
  url,
  startSeconds,
  endSeconds,
  quality,
  bulk,
  rateLimitKey,
}: {
  platform: SourcePlatform;
  url: string;
  startSeconds?: number;
  endSeconds?: number;
  quality: SourceImportQuality;
  bulk: boolean;
  rateLimitKey: string;
}): Promise<string> {
  sweepExpiredJobs();
  const workDirectory = await mkdtemp(join(tmpdir(), "ayahclip-social-"));
  const outputTemplate = join(workDirectory, "%(extractor)s-%(id)s.%(ext)s");
  const ytDlpPath = process.env.AYAHCLIP_YTDLP_PATH || "yt-dlp";
  const timeoutMs = bulk ? BULK_DOWNLOAD_TIMEOUT_MS : DOWNLOAD_TIMEOUT_MS;

  const job: SocialDownloadJob = {
    id: randomUUID(),
    phase: "starting",
    platform,
    quality: platform === "youtube" ? quality : "source",
    downloadedBytes: 0,
    totalBytes: null,
    etaSeconds: null,
    sectionSeconds:
      typeof startSeconds === "number" && typeof endSeconds === "number" && endSeconds > startSeconds
        ? endSeconds - startSeconds
        : null,
    mediaPercent: 0,
    workDirectory,
    filePath: null,
    fileName: null,
    fileBytes: null,
    error: null,
    stderrTail: "",
    child: null,
    rateLimitKey,
    rateLimitReleased: false,
    expiresAt: Date.now() + timeoutMs + ERROR_TTL_MS,
  };
  jobs.set(job.id, job);

  const child = spawn(ytDlpPath, buildSourceDownloadArgs({
    platform,
    url,
    outputTemplate,
    startSeconds,
    endSeconds,
    quality,
  }), { env: { ...process.env, PYTHONUNBUFFERED: "1" } });
  job.child = child;

  const killTimer = setTimeout(() => {
    failJob(job, downloadErrorMessage("", platform));
    child.kill("SIGKILL");
  }, timeoutMs);
  killTimer.unref?.();

  let stdoutRemainder = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutRemainder += chunk;
    const lines = stdoutRemainder.split("\n");
    stdoutRemainder = lines.pop() ?? "";
    for (const line of lines) {
      const sample = parseProgressLine(line);
      if (sample) {
        job.phase = "downloading";
        job.downloadedBytes = sample.downloadedBytes;
        // bv*+ba downloads run as two sequential streams; keep the largest
        // total seen so the bar does not jump backwards on the audio leg.
        if (sample.totalBytes !== null && (job.totalBytes === null || sample.totalBytes > job.totalBytes)) {
          job.totalBytes = sample.totalBytes;
        }
        job.etaSeconds = sample.etaSeconds;
        continue;
      }
      const mediaSeconds = parseFfmpegProgressSeconds(line);
      if (mediaSeconds !== null && job.sectionSeconds) {
        job.phase = "downloading";
        // Sequential video + audio ffmpeg legs each restart out_time from
        // zero; keeping the max seen holds the bar monotonic through both.
        job.mediaPercent = Math.max(
          job.mediaPercent,
          Math.min(97, Math.round((mediaSeconds / job.sectionSeconds) * 100)),
        );
      }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    job.stderrTail = (job.stderrTail + chunk).slice(-STDERR_TAIL_LIMIT);
  });
  child.on("error", () => {
    clearTimeout(killTimer);
    failJob(job, downloadErrorMessage(job.stderrTail, platform));
  });
  child.on("close", (code) => {
    clearTimeout(killTimer);
    job.child = null;
    if (job.phase === "error") return;
    if (code !== 0) {
      failJob(job, downloadErrorMessage(job.stderrTail, platform));
      return;
    }
    job.phase = "processing";
    void (async () => {
      try {
        const files = await readdir(workDirectory);
        const filename = files.find((item) => item.toLowerCase().endsWith(".mp4"));
        if (!filename) throw new Error("No MP4 source was returned");
        const filePath = join(workDirectory, filename);
        const fileInfo = await stat(filePath);
        if (!fileInfo.isFile() || fileInfo.size <= 0 || fileInfo.size > MAX_FILE_BYTES) {
          throw new Error("Resolved source exceeded the import limit");
        }
        job.filePath = filePath;
        job.fileName = filename;
        job.fileBytes = fileInfo.size;
        job.phase = "ready";
        job.expiresAt = Date.now() + READY_TTL_MS;
      } catch {
        failJob(job, downloadErrorMessage(job.stderrTail, platform));
      }
    })();
  });

  return job.id;
}

export function getSocialDownloadJobStatus(jobId: string): SocialDownloadJobStatus | null {
  sweepExpiredJobs();
  const job = jobs.get(jobId);
  if (!job) return null;
  const bytesPercent = job.totalBytes
    ? Math.min(99, Math.round((job.downloadedBytes / job.totalBytes) * 100))
    : 0;
  const percent = job.phase === "ready" || job.phase === "processing"
    ? 100
    : Math.max(bytesPercent, job.mediaPercent);
  return {
    status: job.phase,
    percent,
    downloadedBytes: job.downloadedBytes,
    totalBytes: job.totalBytes,
    etaSeconds: job.etaSeconds,
    ...(job.fileBytes !== null ? { fileBytes: job.fileBytes } : {}),
    ...(job.error !== null ? { error: job.error } : {}),
  };
}

export function getSocialDownloadFile(jobId: string): {
  filePath: string;
  fileName: string;
  fileBytes: number;
  quality: string;
} | null {
  const job = jobs.get(jobId);
  if (!job || job.phase !== "ready" || !job.filePath || !job.fileName || job.fileBytes === null) return null;
  return { filePath: job.filePath, fileName: job.fileName, fileBytes: job.fileBytes, quality: job.quality };
}

/** Cancel a job: kill yt-dlp, free its slot, delete its files. */
export function cancelSocialDownloadJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  const child = job.child;
  failJob(job, "The import was cancelled.");
  child?.kill("SIGKILL");
  jobs.delete(jobId);
  void rm(job.workDirectory, { recursive: true, force: true });
  return true;
}

/** Test-only reset so suites do not share job state. */
export function resetSocialDownloadJobsForTests(): void {
  for (const [id] of jobs) cancelSocialDownloadJob(id);
  jobs.clear();
}
