// Capture the live studio preview canvas as a small JPEG cover. Browser-only.
//
// Used for the dashboard project cover: the "Set as cover" button (manual) and
// an automatic default on save when no cover has been picked. The optional
// dark-frame guard prevents saving a black/heavily-faded frame (e.g. captured
// during the clip-start fade or before a video background's first frame).

const PREVIEW_CANVAS_SELECTOR = "section canvas";

/** Mean luma below this reads as black / mid-fade — not worth saving as a cover. */
const DARK_LUMA_THRESHOLD = 2.5;

export function captureSceneThumbnail(opts: { skipIfDark?: boolean } = {}): string | undefined {
  if (typeof document === "undefined") return undefined;
  const canvas = document.querySelector(PREVIEW_CANVAS_SELECTOR) as HTMLCanvasElement | null;
  if (!canvas || !canvas.width || !canvas.height) return undefined;

  const w = 480;
  const h = Math.round((canvas.height / canvas.width) * w) || 854;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;

  try {
    ctx.drawImage(canvas, 0, 0, w, h);
  } catch {
    return undefined;
  }

  if (opts.skipIfDark) {
    try {
      const d = ctx.getImageData(0, 0, w, h).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }
      if (sum / (d.length / 4) < DARK_LUMA_THRESHOLD) return undefined;
    } catch {
      /* can't read pixels (shouldn't happen for our own canvas) — use the frame */
    }
  }

  return off.toDataURL("image/jpeg", 0.85);
}
