export function timelinePointerTime({
  clientX,
  trackLeft,
  trackWidth,
  duration,
  precision,
  pointerStartX,
  initialTargetTime,
}: {
  clientX: number;
  trackLeft: number;
  trackWidth: number;
  duration: number;
  precision: boolean;
  pointerStartX: number;
  initialTargetTime: number;
}): number {
  if (duration <= 0 || trackWidth <= 0) return 0;
  const raw = precision
    ? initialTargetTime + ((clientX - pointerStartX) / trackWidth) * duration * 0.18
    : ((clientX - trackLeft) / trackWidth) * duration;
  return Math.min(duration, Math.max(0, raw));
}

export function pinchZoom({
  startZoom,
  startDistance,
  currentDistance,
  min = 1,
  max = 24,
}: {
  startZoom: number;
  startDistance: number;
  currentDistance: number;
  min?: number;
  max?: number;
}): number {
  if (startDistance <= 0) return Math.min(max, Math.max(min, startZoom));
  return Math.min(max, Math.max(min, +(startZoom * (currentDistance / startDistance)).toFixed(2)));
}
