import { del, get, set } from "idb-keyval";
import type { Verse } from "@/types";
import type { BulkClipCandidate, BulkClipCount, BulkDetectedAyah } from "./bulk-clips";

export const BULK_JOB_SCHEMA_VERSION = 1 as const;
const ACTIVE_JOB_KEY = "ayahclip:bulk:active:v1";
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
  templateId: string;
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
}: {
  source: File;
  duration: number;
  requestedCount: BulkClipCount;
  templateId: string;
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
    templateId,
    nextWindowIndex: 0,
    detectedAyahs: [],
    unresolvedWindows: [],
    candidates: [],
    verses: [],
    renderTasks: [],
  };
}

function isBulkJob(value: unknown): value is BulkJob {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BulkJob>;
  return item.schemaVersion === BULK_JOB_SCHEMA_VERSION
    && typeof item.id === "string"
    && typeof item.sourceName === "string"
    && typeof item.duration === "number"
    && Array.isArray(item.detectedAyahs)
    && Array.isArray(item.unresolvedWindows)
    && Array.isArray(item.candidates)
    && Array.isArray(item.verses)
    && Array.isArray(item.renderTasks);
}

export async function saveBulkJob(job: BulkJob): Promise<BulkJob> {
  const next = { ...job, updatedAt: Date.now() };
  await Promise.all([set(ACTIVE_JOB_KEY, next.id), set(jobKey(next.id), next)]);
  return next;
}

export async function saveBulkSource(jobId: string, source: Blob, audio: Blob): Promise<void> {
  await Promise.all([set(sourceKey(jobId), source), set(audioKey(jobId), audio)]);
}

export async function loadActiveBulkJob(): Promise<BulkJob | null> {
  const id = await get(ACTIVE_JOB_KEY) as string | undefined;
  if (!id) return null;
  const value = await get(jobKey(id));
  return isBulkJob(value) ? value : null;
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
  await Promise.all([
    del(ACTIVE_JOB_KEY),
    del(jobKey(job.id)),
    del(sourceKey(job.id)),
    del(audioKey(job.id)),
    ...job.renderTasks.map((task) => del(outputKey(job.id, task.candidateId))),
  ]);
}
