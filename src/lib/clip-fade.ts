// Pure helpers for the clip-start fade: a single fade-in of the whole frame
// (and optionally the audio) over the first N ms of a clip. Kept free of any
// canvas/audio I/O so the same math drives the live preview and both export
// paths — preview == export.

/**
 * Progress of the clip-start fade at `elapsedMs` since the clip began, given a
 * fade window of `clipFadeMs`. Returns 1 (fully visible) when disabled, and
 * clamps to [0, 1]. 0 = fully faded out (black), 1 = fully shown.
 */
export function clipFadeProgress(elapsedMs: number, clipFadeMs: number): number {
  if (!(clipFadeMs > 0)) return 1;
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= clipFadeMs) return 1;
  return elapsedMs / clipFadeMs;
}

/**
 * Multiply the first `fadeMs` of one channel's samples by a 0→1 ramp, in place.
 * Applied to the concatenated clip audio at sample 0 so the audio rises in sync
 * with the visual fade. No-op when `fadeMs` is non-positive.
 */
export function applyAudioFadeIn(
  channel: Float32Array,
  sampleRate: number,
  fadeMs: number
): void {
  if (!(fadeMs > 0) || sampleRate <= 0) return;
  const n = Math.min(channel.length, Math.ceil((fadeMs / 1000) * sampleRate));
  for (let i = 0; i < n; i++) channel[i] *= i / n;
}
