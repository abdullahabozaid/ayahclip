const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);

export const VIDEO_FILE_ACCEPT = "video/mp4,video/webm,video/quicktime,.mov,.m4v";

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Phone photo libraries do not report a consistent MIME type. Safari normally
 * uses video/quicktime for MOV, while some document providers return an empty
 * string or application/octet-stream. Keep the allowlist narrow, then fall
 * back to the filename extension.
 */
export function isSupportedVideoFile(file: Pick<File, "name" | "type">): boolean {
  return file.type === "video/mp4"
    || file.type === "video/webm"
    || file.type === "video/quicktime"
    || VIDEO_EXTENSIONS.has(extension(file.name));
}

export function isImageFile(file: Pick<File, "type">): boolean {
  return file.type.startsWith("image/");
}
