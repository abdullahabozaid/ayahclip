import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SourcePlatform } from "@/lib/source-link";
import { releaseRateLimitByKey } from "@/lib/server-rate-limit";

export type SourceImportQuality = "fast" | "hd";
export type SocialDownloadPhase = "starting" | "downloading" | "processing" | "ready" | "error";

export const MAX_FILE_BYTES = 750 * 1024 * 1024;
// Generous ceilings: full-strategy downloads finish in seconds-to-minutes,
// but a 60-minute range from a very long source still section-streams at
// roughly playback speed and legitimately needs most of this.
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;
const BULK_DOWNLOAD_TIMEOUT_MS = 35 * 60_000;
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
//
// The resolution cap MUST use yt-dlp's `res` sort field, not a `[height<=N]`
// format filter. A filter on pixel height silently downgrades PORTRAIT/vertical
// videos: a "720p" vertical clip is 720 WIDE (e.g. 720x1280), so its height is
// >720 and `[height<=720]` rejects it, falling back to the 480p rung with no
// error — the HD toggle produced no quality gain. `res` is min(width, height),
// i.e. the shorter side, exactly what YouTube's "p" label denotes, and yt-dlp
// caps at (never exceeds) the requested value in both orientations.
const YOUTUBE_FORMAT_SELECTOR = "bv*[vcodec^=avc1]+ba[ext=m4a]/bv*+ba/b";
const YOUTUBE_FORMAT_SORT: Record<SourceImportQuality, string> = {
  fast: "res:480,vcodec:h264",
  hd: "res:720,vcodec:h264",
};

// Sentinel thrown when the resolved source is larger than MAX_FILE_BYTES, so
// the user gets an actionable message (pick Fast, or a shorter section) instead
// of the generic "could not import" copy.
export const SOURCE_TOO_LARGE = "AYAHCLIP_SOURCE_TOO_LARGE";

export function downloadErrorMessage(stderr: string, platform: SourcePlatform): string {
  const lower = stderr.toLowerCase();
  if (lower.includes(SOURCE_TOO_LARGE.toLowerCase()) || lower.includes("import limit")) {
    return "That import is too large. Choose Fast (480p) instead of HD, or import a shorter section.";
  }
  // YouTube's datacenter bot-check: the video is public but the server IP is
  // being challenged. Tell the operator plainly rather than blaming the times.
  if (lower.includes("confirm you") || lower.includes("not a bot") || lower.includes("sign in to")) {
    return "YouTube is temporarily blocking automated downloads from this server. Please try again shortly.";
  }
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
    // A section request streams through ffmpeg at roughly playback speed;
    // callers should only pass start/end here when the full-file strategy was
    // ruled out (very long videos). Omitting them downloads the whole file on
    // the fast native downloader and the caller trims locally.
    if (typeof startSeconds === "number" && typeof endSeconds === "number") {
      args.push(
        "--download-sections", `*${startSeconds}-${endSeconds}`,
        "--no-force-keyframes-at-cuts",
        // Ranged downloads are delegated to ffmpeg, which bypasses yt-dlp's
        // progress hooks entirely; ffmpeg's own machine-readable progress on
        // stdout (out_time_us) is the only live signal for these jobs.
        "--downloader-args", "ffmpeg:-progress pipe:1 -nostats",
      );
    }
    args.push(
      "--merge-output-format", "mp4",
      "--remux-video", "mp4",
      "--format", YOUTUBE_FORMAT_SELECTOR,
      "--format-sort", YOUTUBE_FORMAT_SORT[quality],
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

// Cap concurrent heavy subprocesses so a burst of imports cannot OOM the 2 GB
// container. Each active job can run a yt-dlp + ffmpeg pair using hundreds of MB.
const MAX_ACTIVE_JOBS = Math.max(1, Number(process.env.AYAHCLIP_MAX_ACTIVE_IMPORTS ?? "3") || 3);

/** Thrown by startSocialDownloadJob when MAX_ACTIVE_JOBS are already running. */
export class ImportBusyError extends Error {
  constructor() {
    super("The import queue is full right now.");
    this.name = "ImportBusyError";
  }
}

function activeJobCount(): number {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.phase === "starting" || job.phase === "downloading" || job.phase === "processing") count += 1;
  }
  return count;
}

function sweepExpiredJobs(now = Date.now()): void {
  for (const [id, job] of jobs) {
    if (job.expiresAt <= now && job.phase !== "downloading" && job.phase !== "starting" && job.phase !== "processing") {
      jobs.delete(id);
      void rm(job.workDirectory, { recursive: true, force: true });
    }
  }
}

// Reclaim temp dirs from crashed/abandoned jobs on a timer, not only when new
// traffic happens to call in. Guarded against duplicate registration under dev
// hot-reload; unref'd so it never keeps the process (or a test run) alive.
{
  const g = globalThis as Record<string, unknown>;
  const SWEEP_KEY = "__ayahclipSocialDownloadSweep";
  if (!g[SWEEP_KEY]) {
    const timer = setInterval(() => sweepExpiredJobs(), 60_000);
    timer.unref?.();
    g[SWEEP_KEY] = timer;
  }
}

function releaseSlotOnce(job: SocialDownloadJob): void {
  if (job.rateLimitReleased) return;
  job.rateLimitReleased = true;
  releaseRateLimitByKey(job.rateLimitKey);
}

/** Phase read that survives TS narrowing — cancel mutates it across awaits. */
function jobFailed(job: SocialDownloadJob): boolean {
  return job.phase === "error";
}

function failJob(job: SocialDownloadJob, message: string): void {
  if (job.phase === "ready" || job.phase === "error") return;
  // Capture whether real subprocess work had begun BEFORE flipping to error.
  const startedRealWork = job.phase === "downloading" || job.phase === "processing";
  job.phase = "error";
  job.error = message;
  job.expiresAt = Date.now() + ERROR_TTL_MS;
  // Refund the anti-abuse slot only for cheap early failures (validation/probe,
  // still "starting") so a real typo doesn't lock a creator out. Anything that
  // reached download/processing did expensive work and KEEPS its slot — otherwise
  // start→cancel churn could spawn yt-dlp/ffmpeg forever without exhausting quota.
  if (!startedRealWork) releaseSlotOnce(job);
  void rm(job.workDirectory, { recursive: true, force: true });
}

const PROBE_TIMEOUT_MS = 20_000;
// Below this source length the whole file downloads on the fast fragmented
// path and gets stream-copy trimmed locally — measured ~10× quicker than
// ffmpeg section streaming, which YouTube paces at roughly playback speed
// (yt-dlp#6513). Longer sources fall back to section streaming so a small
// clip never pays for a multi-GB download. 90 min at capped 480/720p stays
// safely under MAX_FILE_BYTES.
const FULL_STRATEGY_MAX_VIDEO_SECONDS = 90 * 60;

// Full-strategy source files are cached so repeat clips from the same
// recitation skip the download entirely. Simple LRU by mtime, bounded so the
// container disk cannot fill.
const SOURCE_CACHE_DIR = process.env.AYAHCLIP_SOCIAL_CACHE_DIR || join(tmpdir(), "ayahclip-social-cache");
const SOURCE_CACHE_MAX_BYTES = Number(process.env.AYAHCLIP_SOCIAL_CACHE_MAX_BYTES) || 4 * 1024 * 1024 * 1024;

function sourceCacheKey(url: string, quality: SourceImportQuality): string {
  return createHash("sha256").update(`${url}|${quality}`).digest("hex");
}

/** Path of a cached source, with its recency refreshed — or null on miss. */
async function readSourceCache(key: string): Promise<string | null> {
  const path = join(SOURCE_CACHE_DIR, `${key}.mp4`);
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size <= 0) return null;
    const now = new Date();
    await utimes(path, now, now);
    return path;
  } catch {
    return null;
  }
}

async function writeSourceCache(key: string, sourcePath: string, jobId: string): Promise<void> {
  try {
    await mkdir(SOURCE_CACHE_DIR, { recursive: true });
    // Copy to a job-unique name first so concurrent writers of the same key
    // never expose a half-written file; rename is atomic within the dir.
    const staging = join(SOURCE_CACHE_DIR, `${key}.${jobId}.tmp`);
    await copyFile(sourcePath, staging);
    await rename(staging, join(SOURCE_CACHE_DIR, `${key}.mp4`));
    await evictSourceCache();
  } catch {
    // The cache is an optimization — a failed write must never fail the job.
  }
}

async function evictSourceCache(): Promise<void> {
  const entries = await readdir(SOURCE_CACHE_DIR);
  const files = (await Promise.all(entries
    .filter((name) => name.endsWith(".mp4"))
    .map(async (name) => {
      const path = join(SOURCE_CACHE_DIR, name);
      try {
        const info = await stat(path);
        return { path, size: info.size, mtimeMs: info.mtimeMs };
      } catch {
        return null;
      }
    }))).filter((item): item is NonNullable<typeof item> => item !== null);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (total <= SOURCE_CACHE_MAX_BYTES) break;
    await rm(file.path, { force: true });
    total -= file.size;
  }
}

/**
 * Run one job subprocess: wires progress parsing, stderr capture, the kill
 * timer, and cancellation. Resolves true only on a clean zero exit.
 */
function runJobProcess(
  job: SocialDownloadJob,
  command: string,
  args: string[],
  timeoutMs: number,
  { markDownloading = false }: { markDownloading?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: { ...process.env, PYTHONUNBUFFERED: "1" } });
    job.child = child;
    const killTimer = setTimeout(() => {
      failJob(job, downloadErrorMessage("", job.platform));
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
        if (!markDownloading) continue;
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
      job.child = null;
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(killTimer);
      job.child = null;
      resolve(code === 0 && job.phase !== "error");
    });
  });
}

/** Fetch the source duration so the download strategy can be chosen. */
async function probeDurationSeconds(ytDlpPath: string, url: string, job: SocialDownloadJob): Promise<number | null> {
  let output = "";
  const collected = await new Promise<boolean>((resolve) => {
    const child = spawn(ytDlpPath, ["--no-playlist", "--no-warnings", "--skip-download", "--print", "duration", url], {
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    job.child = child;
    const killTimer = setTimeout(() => child.kill("SIGKILL"), PROBE_TIMEOUT_MS);
    killTimer.unref?.();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { output += chunk; });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      job.stderrTail = (job.stderrTail + chunk).slice(-STDERR_TAIL_LIMIT);
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => { job.child = null; resolve(code === 0); });
  });
  if (!collected) return null;
  const duration = Number.parseFloat(output.trim().split("\n")[0] ?? "");
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export function chooseYoutubeStrategy({
  durationSeconds,
  startSeconds,
  endSeconds,
}: {
  durationSeconds: number | null;
  startSeconds: number;
  endSeconds: number;
}): { mode: "full" | "section"; trim: { startSeconds: number; durationSeconds: number } | null } {
  if (durationSeconds === null || durationSeconds > FULL_STRATEGY_MAX_VIDEO_SECONDS) {
    return { mode: "section", trim: null };
  }
  // A range that already spans the whole source needs no trim pass at all.
  const wholeVideo = startSeconds <= 1 && endSeconds >= durationSeconds - 1;
  return {
    mode: "full",
    trim: wholeVideo ? null : { startSeconds, durationSeconds: endSeconds - startSeconds },
  };
}

async function finalizeJobFile(job: SocialDownloadJob): Promise<void> {
  const files = await readdir(job.workDirectory);
  const filename = files.find((item) => item.toLowerCase().endsWith(".mp4"));
  if (!filename) throw new Error("No MP4 source was returned");
  const filePath = join(job.workDirectory, filename);
  const fileInfo = await stat(filePath);
  if (!fileInfo.isFile() || fileInfo.size <= 0 || fileInfo.size > MAX_FILE_BYTES) {
    throw new Error(`${SOURCE_TOO_LARGE}: resolved source exceeded the import limit`);
  }
  job.filePath = filePath;
  job.fileName = filename;
  job.fileBytes = fileInfo.size;
  job.phase = "ready";
  job.expiresAt = Date.now() + READY_TTL_MS;
}

async function orchestrateJob(job: SocialDownloadJob, {
  url,
  startSeconds,
  endSeconds,
  quality,
  timeoutMs,
  ytDlpPath,
  outputTemplate,
}: {
  url: string;
  startSeconds?: number;
  endSeconds?: number;
  quality: SourceImportQuality;
  timeoutMs: number;
  ytDlpPath: string;
  outputTemplate: string;
}): Promise<void> {
  try {
    let trim: { startSeconds: number; durationSeconds: number } | null = null;
    let sectionArgs: { startSeconds?: number; endSeconds?: number } = {};
    let fullStrategy = false;
    if (job.platform === "youtube" && typeof startSeconds === "number" && typeof endSeconds === "number") {
      const durationSeconds = await probeDurationSeconds(ytDlpPath, url, job);
      if (jobFailed(job)) return;
      const strategy = chooseYoutubeStrategy({ durationSeconds, startSeconds, endSeconds });
      if (strategy.mode === "section") {
        sectionArgs = { startSeconds, endSeconds };
      } else {
        fullStrategy = true;
        trim = strategy.trim;
      }
    }

    // Creators typically cut many clips from one recitation: full-strategy
    // source files are cached by URL+quality so only the first import pays
    // for the download.
    const cacheKey = fullStrategy ? sourceCacheKey(url, quality) : null;
    const cachedPath = cacheKey ? await readSourceCache(cacheKey) : null;
    let sourcePath: string | null = null;
    if (cachedPath) {
      job.phase = "processing";
      sourcePath = cachedPath;
    } else {
      const downloaded = await runJobProcess(job, ytDlpPath, buildSourceDownloadArgs({
        platform: job.platform,
        url,
        outputTemplate,
        quality,
        ...sectionArgs,
      }), timeoutMs, { markDownloading: true });
      if (jobFailed(job)) return;
      if (!downloaded) {
        failJob(job, downloadErrorMessage(job.stderrTail, job.platform));
        return;
      }
      job.phase = "processing";
      const files = await readdir(job.workDirectory);
      const source = files.find((item) => item.toLowerCase().endsWith(".mp4"));
      if (!source) throw new Error("No MP4 source was returned");
      sourcePath = join(job.workDirectory, source);
      if (cacheKey) await writeSourceCache(cacheKey, sourcePath, job.id);
    }

    if (trim) {
      const trimmedPath = join(job.workDirectory, "trimmed-source.mp4");
      // Stream copy keeps this near-instant; cuts land on the nearest
      // keyframe, matching what --download-sections produced before.
      const trimmed = await runJobProcess(job, "ffmpeg", [
        "-y", "-loglevel", "error",
        "-ss", String(trim.startSeconds),
        "-i", sourcePath,
        "-t", String(trim.durationSeconds),
        "-c", "copy",
        trimmedPath,
      ], timeoutMs);
      if (jobFailed(job)) return;
      if (!trimmed) throw new Error("Trimming the imported range failed");
      job.phase = "processing";
      if (sourcePath.startsWith(job.workDirectory)) await rm(sourcePath, { force: true });
    } else if (cachedPath) {
      // Whole-video request served from cache: copy it into the job dir so
      // the job's TTL owns its file lifecycle, not the cache's eviction.
      await copyFile(cachedPath, join(job.workDirectory, "cached-source.mp4"));
    }
    await finalizeJobFile(job);
  } catch (err) {
    // Fold any thrown reason (e.g. the source-too-large sentinel) into the text
    // downloadErrorMessage inspects, so internal failures surface a specific,
    // actionable message instead of the generic fallback.
    const detail = err instanceof Error ? err.message : "";
    if (job.phase !== "error") {
      failJob(job, downloadErrorMessage(`${job.stderrTail}\n${detail}`, job.platform));
    }
  }
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
  // Bound concurrent heavy subprocesses before doing any filesystem work.
  if (activeJobCount() >= MAX_ACTIVE_JOBS) throw new ImportBusyError();
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
    expiresAt: Date.now() + timeoutMs + PROBE_TIMEOUT_MS + ERROR_TTL_MS,
  };
  jobs.set(job.id, job);

  void orchestrateJob(job, { url, startSeconds, endSeconds, quality, timeoutMs, ytDlpPath, outputTemplate });
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
