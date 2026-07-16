export const RECOMMENDED_IMPORT_BYTES = 250 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 750 * 1024 * 1024;

export function importSizeError(bytes: number): string | null {
  if (bytes <= MAX_IMPORT_BYTES) return null;
  return "This file is over 750 MB. Trim it first, then import the shorter clip to avoid exhausting browser memory.";
}
