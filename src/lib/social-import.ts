export interface SocialImportProgress {
  phase: "starting" | "downloading" | "processing" | "transferring";
  percent: number;
  downloadedBytes?: number;
  totalBytes?: number | null;
  etaSeconds?: number | null;
}

interface JobStatusPayload {
  status: "starting" | "downloading" | "processing" | "ready" | "error";
  percent: number;
  downloadedBytes: number;
  totalBytes: number | null;
  etaSeconds: number | null;
  fileBytes?: number;
  error?: string;
}

const POLL_INTERVAL_MS = 1_000;

function abortError(): DOMException {
  return new DOMException("The import was cancelled.", "AbortError");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Server-side yt-dlp import as a polled job: create → poll status → fetch the
 * finished file. Keeps every network request short-lived, so the flow survives
 * proxies and mobile connections that kill long-idle requests, and gives the
 * UI real progress for both the remote download and the local transfer.
 */
export async function importSocialSource({
  url,
  startSeconds,
  endSeconds,
  attestedRights,
  bulk,
  quality,
  signal,
  onProgress,
}: {
  url: string;
  startSeconds?: number | null;
  endSeconds?: number | null;
  attestedRights?: boolean;
  bulk?: boolean;
  quality?: "fast" | "hd";
  signal?: AbortSignal;
  onProgress?: (progress: SocialImportProgress) => void;
}): Promise<{ blob: Blob; fileName: string | null }> {
  if (signal?.aborted) throw abortError();
  onProgress?.({ phase: "starting", percent: 0 });

  const createResponse = await fetch("/api/social-download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      ...(typeof startSeconds === "number" ? { startSeconds } : {}),
      ...(typeof endSeconds === "number" ? { endSeconds } : {}),
      ...(attestedRights !== undefined ? { attestedRights } : {}),
      ...(bulk !== undefined ? { bulk } : {}),
      ...(quality !== undefined ? { quality } : {}),
    }),
    signal,
  });
  if (!createResponse.ok) {
    const payload = await createResponse.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? "The source could not be imported.");
  }
  const { jobId } = await createResponse.json() as { jobId: string };

  const cancelJob = () => {
    // keepalive lets the cancel land even while the page navigates away.
    void fetch(`/api/social-download/jobs/${jobId}`, { method: "DELETE", keepalive: true }).catch(() => {});
  };

  try {
    for (;;) {
      if (signal?.aborted) throw abortError();
      const statusResponse = await fetch(`/api/social-download/jobs/${jobId}`, { signal });
      if (!statusResponse.ok) {
        const payload = await statusResponse.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "The import stopped unexpectedly. Try again.");
      }
      const status = await statusResponse.json() as JobStatusPayload;
      if (status.status === "error") {
        throw new Error(status.error ?? "The source could not be imported.");
      }
      if (status.status === "ready") break;
      onProgress?.({
        phase: status.status === "processing" ? "processing" : status.status === "downloading" ? "downloading" : "starting",
        percent: status.percent,
        downloadedBytes: status.downloadedBytes,
        totalBytes: status.totalBytes,
        etaSeconds: status.etaSeconds,
      });
      await delay(POLL_INTERVAL_MS, signal);
    }

    const fileResponse = await fetch(`/api/social-download/jobs/${jobId}/file`, { signal });
    if (!fileResponse.ok || !fileResponse.body) {
      const payload = await fileResponse.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? "The imported file could not be transferred. Try again.");
    }
    const totalBytes = Number(fileResponse.headers.get("content-length")) || null;
    const disposition = fileResponse.headers.get("content-disposition") ?? "";
    const fileName = disposition.match(/filename="([^"]+)"/i)?.[1] ?? null;

    const reader = fileResponse.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    onProgress?.({ phase: "transferring", percent: 0, downloadedBytes: 0, totalBytes });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onProgress?.({
        phase: "transferring",
        percent: totalBytes ? Math.min(99, Math.round((received / totalBytes) * 100)) : 0,
        downloadedBytes: received,
        totalBytes,
      });
    }
    return { blob: new Blob(chunks, { type: "video/mp4" }), fileName };
  } catch (reason) {
    if (signal?.aborted || (reason instanceof DOMException && reason.name === "AbortError")) {
      cancelJob();
      throw abortError();
    }
    throw reason;
  }
}

export function describeImportProgress(progress: SocialImportProgress | null): string {
  if (!progress || progress.phase === "starting") return "Contacting the source…";
  if (progress.phase === "processing") return "Preparing the video…";
  const megabytes = (bytes: number) => `${Math.max(0.1, bytes / (1024 * 1024)).toFixed(1)} MB`;
  const label = progress.phase === "transferring" ? "Receiving the video" : "Downloading";
  const size = progress.totalBytes && progress.downloadedBytes !== undefined
    ? ` · ${megabytes(progress.downloadedBytes)} of ${megabytes(progress.totalBytes)}`
    : "";
  const eta = progress.phase === "downloading" && typeof progress.etaSeconds === "number" && progress.etaSeconds > 0
    ? ` · ~${progress.etaSeconds}s left`
    : "";
  return `${label} · ${progress.percent}%${size}${eta}`;
}
