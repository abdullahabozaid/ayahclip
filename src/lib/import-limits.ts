export const RECOMMENDED_IMPORT_BYTES = 250 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 750 * 1024 * 1024;
export const RECOMMENDED_RECOGNITION_SECONDS = 3 * 60;
export const MAX_RECOGNITION_SECONDS = 8 * 60;
export const LOW_MEMORY_MAX_RECOGNITION_SECONDS = 4 * 60;

export function importSizeError(bytes: number): string | null {
  if (bytes <= MAX_IMPORT_BYTES) return null;
  return "This file is over 750 MB. Trim it first, then import the shorter clip to avoid exhausting browser memory.";
}

export function recognitionDurationLimit(deviceMemoryGb?: number): number {
  return deviceMemoryGb !== undefined && deviceMemoryGb <= 4
    ? LOW_MEMORY_MAX_RECOGNITION_SECONDS
    : MAX_RECOGNITION_SECONDS;
}

export function recognitionDurationError(
  durationSeconds: number,
  deviceMemoryGb?: number,
): string | null {
  const limit = recognitionDurationLimit(deviceMemoryGb);
  if (durationSeconds <= limit) return null;
  const minutes = Math.round(limit / 60);
  return `Automatic Quran recognition is limited to ${minutes} minutes on this device to prevent the browser running out of memory. Trim the source to the passage you want, then retry.`;
}

export function recognitionDurationWarning(durationSeconds: number): string | null {
  if (durationSeconds <= RECOMMENDED_RECOGNITION_SECONDS) return null;
  return "This is a long recognition job. It may take several minutes and use substantial memory; trimming to the intended passage will be faster and more accurate.";
}

export function browserDeviceMemoryGb(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
