/** Convert low-level encoder/media/font failures into the action the creator
 * can actually take. Keep this pure so both export and final-preview surfaces
 * report the same problem. */
export function exportFailureMessage(error: unknown): string {
  const raw = error instanceof Error
    ? `${error.name} ${error.message}`
    : String(error ?? "");

  if (/imported audio is no longer available|re-import/i.test(raw)) {
    return "The imported audio is missing from this saved clip. Re-import the source file, then export again.";
  }
  if (/selected Quran font did not finish loading|QCF font|font.*load/i.test(raw)) {
    return "The selected Quran font did not finish loading. Check your connection and retry so the export never records a fallback Arabic face.";
  }
  if (/out of memory|memory|allocation|array buffer|typed array/i.test(raw)) {
    return "This export exceeded the browser's available memory. Close memory-heavy tabs or export a shorter clip.";
  }
  if (/background video has no usable duration|decode.*video|video.*decode/i.test(raw)) {
    return "The background video could not be decoded. Replace it with an MP4 or WebM file and retry.";
  }
  if (/fetch|network|offline|audio.*load|failed to load/i.test(raw)) {
    return "Required audio or media could not be loaded. Check your connection and retry; your edits are still saved.";
  }
  if (/encoder|encoding|webcodecs|mediarecorder|not supported|unsupported/i.test(raw)) {
    return "This browser could not encode the video. Try the latest Chrome or Edge, or export a shorter clip.";
  }
  return "The video could not be rendered. Your edits are unchanged; try a shorter clip or retry in the latest Chrome or Edge.";
}
