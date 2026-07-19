import type { BulkClipCandidate } from "./bulk-clips";

function waitForEvent(target: EventTarget, event: string, errorEvent = "error"): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("The source frame could not be read."));
    };
    const cleanup = () => {
      target.removeEventListener(event, done);
      target.removeEventListener(errorEvent, failed);
    };
    target.addEventListener(event, done, { once: true });
    target.addEventListener(errorEvent, failed, { once: true });
  });
}

/** Capture one compact 9:16 review frame per candidate using one shared decoder. */
export async function captureBulkThumbnails(
  sourceUrl: string,
  candidates: readonly BulkClipCandidate[],
  onProgress?: (complete: number, total: number) => void,
): Promise<Record<string, string>> {
  if (typeof document === "undefined" || candidates.length === 0) return {};
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;
  if (video.readyState < 1) await waitForEvent(video, "loadedmetadata");

  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  if (!context) return {};
  const output: Record<string, string> = {};

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const seek = Math.min(video.duration || candidate.end, candidate.start + Math.min(4, candidate.duration / 2));
    const targetTime = Math.max(0, Math.min(seek, Math.max(0, video.duration - 0.05)));
    if (Math.abs(video.currentTime - targetTime) > 0.02) {
      video.currentTime = targetTime;
      await waitForEvent(video, "seeked");
    }
    const sourceRatio = video.videoWidth / Math.max(1, video.videoHeight);
    const targetRatio = canvas.width / canvas.height;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;
    let sourceX = 0;
    let sourceY = 0;
    if (sourceRatio > targetRatio) {
      sourceWidth = video.videoHeight * targetRatio;
      sourceX = (video.videoWidth - sourceWidth) / 2;
    } else {
      sourceHeight = video.videoWidth / targetRatio;
      sourceY = (video.videoHeight - sourceHeight) / 2;
    }
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    output[candidate.id] = canvas.toDataURL("image/jpeg", 0.68);
    onProgress?.(index + 1, candidates.length);
  }
  video.removeAttribute("src");
  video.load();
  return output;
}
