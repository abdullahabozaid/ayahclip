import { del, get, set } from "idb-keyval";
import type { Verse } from "@/types";
import type {
  BulkArabicLineLimit,
  BulkAyahsPerClip,
  BulkClipCandidate,
  BulkClipCount,
  BulkDetectedAyah,
  BulkGroupingMode,
  BulkIdealClipSeconds,
} from "./bulk-clips";
import type { StyleSnapshot } from "./style-snapshot";

export const BULK_JOB_SCHEMA_VERSION = 3 as const;
const ACTIVE_JOB_KEY = "ayahclip:bulk:active:v1";
const JOB_INDEX_KEY = "ayahclip:bulk:index:v1";
const jobKey = (id: string) => `ayahclip:bulk:job:${id}:v1`;
const sourceKey = (id: string) => `ayahclip:bulk:source:${id}:v1`;
const audioKey = (id: string) => `ayahclip:bulk:audio:${id}:v1`;
const outputKey = (jobId: string, candidateId: string) => `ayahclip:bulk:output:${jobId}:${candidateId}:v1`;

export type BulkJobStage = "source" | "analysing" | "results" | "rendering" | "complete";
export type BulkRenderStatus = "idle" | "queued" | "rendering" | "ready" | "failed" | "cancelled";

export interface BulkRenderTask {
  candidateId: string;
  status: BulkRenderStatus;
  progress: number;
  outputName?: string;
  outputType?: string;
  outputSize?: number;
  librarySaved?: boolean;
  error?: string;
}

export interface BulkUnresolvedWindow {
  start: number;
  end: number;
  reason: string;
}

export interface BulkJob {
  schemaVersion: typeof BULK_JOB_SCHEMA_VERSION;
  id: string;
  createdAt: number;
  updatedAt: number;
  stage: BulkJobStage;
  sourceName: string;
  sourceType: string;
  duration: number;
  requestedCount: BulkClipCount;
  idealClipSeconds: BulkIdealClipSeconds;
  groupingMode: BulkGroupingMode;
  ayahsPerClip: BulkAyahsPerClip;
  smartCaptionSplits: boolean;
  maxArabicLines: BulkArabicLineLimit;
  sourceQuality: "fast" | "hd";
  visualMode: "source" | "template";
  // "captions" overlays AyahClip's verified Arabic + translation. "original"
  // keeps the source video as-is with NO text overlay — for clips whose source
  // already has burned-in captions, so they aren't double-captioned.
  captionMode: "captions" | "original";
  templateId: string;
  /** Whether applying a template to the batch may also replace clip media. */
  templateReplacesMedia?: boolean;
  /** A look captured from one clip in Studio, applied to every clip. */
  styleOverride?: StyleSnapshot | null;
  nextWindowIndex: number;
  detectedAyahs: BulkDetectedAyah[];
  unresolvedWindows: BulkUnresolvedWindow[];
  candidates: BulkClipCandidate[];
  verses: Verse[];
  renderTasks: BulkRenderTask[];
}

export function createBulkJob({
  source,
  duration,
  requestedCount,
  templateId,
  idealClipSeconds = 45,
  groupingMode = "duration",
  ayahsPerClip = 2,
  smartCaptionSplits = true,
  maxArabicLines = 2,
  sourceQuality = "fast",
  visualMode = "source",
  captionMode = "captions",
}: {
  source: File;
  duration: number;
  requestedCount: BulkClipCount;
  templateId: string;
  idealClipSeconds?: BulkIdealClipSeconds;
  groupingMode?: BulkGroupingMode;
  ayahsPerClip?: BulkAyahsPerClip;
  smartCaptionSplits?: boolean;
  maxArabicLines?: BulkArabicLineLimit;
  sourceQuality?: "fast" | "hd";
  visualMode?: "source" | "template";
  captionMode?: "captions" | "original";
}): BulkJob {
  const now = Date.now();
  return {
    schemaVersion: BULK_JOB_SCHEMA_VERSION,
    id: `bulk-${now}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: now,
    updatedAt: now,
    stage: "source",
    sourceName: source.name,
    sourceType: source.type,
    duration,
    requestedCount,
    idealClipSeconds,
    groupingMode,
    ayahsPerClip,
    smartCaptionSplits,
    maxArabicLines,
    sourceQuality,
    visualMode,
    captionMode,
    templateId,
    nextWindowIndex: 0,
    detectedAyahs: [],
    unresolvedWindows: [],
    candidates: [],
    verses: [],
    renderTasks: [],
  };
}

function parseBulkJob(value: unknown): BulkJob | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<Omit<BulkJob, "schemaVersion">> & { schemaVersion?: number };
  const valid = ([1, 2, BULK_JOB_SCHEMA_VERSION] as number[]).includes(item.schemaVersion ?? 0)
    && typeof item.id === "string"
    && typeof item.sourceName === "string"
    && typeof item.duration === "number"
    && Array.isArray(item.detectedAyahs)
    && Array.isArray(item.unresolvedWindows)
    && Array.isArray(item.candidates)
    && Array.isArray(item.verses)
    && Array.isArray(item.renderTasks);
  if (!valid) return null;
  return {
    ...item,
    schemaVersion: BULK_JOB_SCHEMA_VERSION,
    idealClipSeconds: item.idealClipSeconds ?? 45,
    groupingMode: item.groupingMode ?? "duration",
    ayahsPerClip: item.ayahsPerClip ?? 2,
    smartCaptionSplits: item.smartCaptionSplits ?? true,
    maxArabicLines: item.maxArabicLines ?? 2,
    sourceQuality: item.sourceQuality ?? "fast",
    visualMode: item.visualMode ?? "source",
    captionMode: item.captionMode ?? "captions",
  } as BulkJob;
}

export async function saveBulkJob(job: BulkJob): Promise<BulkJob> {
  const next = { ...job, updatedAt: Date.now() };
  const ids = await get(JOB_INDEX_KEY) as string[] | undefined;
  const index = [next.id, ...(ids ?? []).filter((id) => id !== next.id)];
  await Promise.all([set(ACTIVE_JOB_KEY, next.id), set(JOB_INDEX_KEY, index), set(jobKey(next.id), next)]);
  return next;
}

export async function saveBulkSource(jobId: string, source: Blob, audio: Blob): Promise<void> {
  await Promise.all([set(sourceKey(jobId), source), set(audioKey(jobId), audio)]);
}

export async function loadActiveBulkJob(): Promise<BulkJob | null> {
  const id = await get(ACTIVE_JOB_KEY) as string | undefined;
  if (!id) return null;
  const value = await get(jobKey(id));
  return parseBulkJob(value);
}

export async function loadBulkJob(id: string): Promise<BulkJob | null> {
  return parseBulkJob(await get(jobKey(id)));
}

export async function loadBulkJobs(): Promise<BulkJob[]> {
  const indexed = await get(JOB_INDEX_KEY) as string[] | undefined;
  const active = await get(ACTIVE_JOB_KEY) as string | undefined;
  const ids = indexed?.length ? indexed : active ? [active] : [];
  const jobs = (await Promise.all(ids.map(loadBulkJob))).filter((job): job is BulkJob => Boolean(job));
  return jobs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function activateBulkJob(id: string): Promise<void> {
  await set(ACTIVE_JOB_KEY, id);
}

export async function loadBulkSource(jobId: string): Promise<{ source: Blob; audio: Blob } | null> {
  const [source, audio] = await Promise.all([
    get(sourceKey(jobId)) as Promise<Blob | undefined>,
    get(audioKey(jobId)) as Promise<Blob | undefined>,
  ]);
  return source && audio ? { source, audio } : null;
}

export async function saveBulkOutput(jobId: string, candidateId: string, output: Blob): Promise<void> {
  await set(outputKey(jobId, candidateId), output);
}

export async function loadBulkOutput(jobId: string, candidateId: string): Promise<Blob | undefined> {
  return await get(outputKey(jobId, candidateId)) as Blob | undefined;
}

export async function deleteBulkOutput(jobId: string, candidateId: string): Promise<void> {
  await del(outputKey(jobId, candidateId));
}

export async function deleteBulkJob(job: BulkJob): Promise<void> {
  const ids = await get(JOB_INDEX_KEY) as string[] | undefined;
  const nextIds = (ids ?? []).filter((id) => id !== job.id);
  const active = await get(ACTIVE_JOB_KEY) as string | undefined;
  await Promise.all([
    active === job.id ? (nextIds[0] ? set(ACTIVE_JOB_KEY, nextIds[0]) : del(ACTIVE_JOB_KEY)) : Promise.resolve(),
    set(JOB_INDEX_KEY, nextIds),
    del(jobKey(job.id)),
    del(sourceKey(job.id)),
    del(audioKey(job.id)),
    ...job.renderTasks.map((task) => del(outputKey(job.id, task.candidateId))),
  ]);
}
