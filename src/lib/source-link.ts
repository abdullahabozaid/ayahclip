export const MAX_YOUTUBE_SEGMENT_SECONDS = 8 * 60;
export const MIN_YOUTUBE_SEGMENT_SECONDS = 1;

export type SourcePlatform = "youtube" | "tiktok" | "instagram";

export type ValidatedSourceLink = {
  platform: SourcePlatform;
  url: URL;
};

const HOST_PLATFORM: Record<string, SourcePlatform> = {
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "youtu.be": "youtube",
  "tiktok.com": "tiktok",
  "www.tiktok.com": "tiktok",
  "m.tiktok.com": "tiktok",
  "vm.tiktok.com": "tiktok",
  "vt.tiktok.com": "tiktok",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
};

function isYouTubeVideoURL(url: URL): boolean {
  if (url.hostname.toLowerCase() === "youtu.be") {
    return url.pathname.split("/").filter(Boolean).length === 1;
  }
  if (url.pathname === "/watch") return Boolean(url.searchParams.get("v"));
  const [kind, id] = url.pathname.split("/").filter(Boolean);
  return (kind === "shorts" || kind === "live") && Boolean(id);
}

export function validateSourceLink(value: unknown): ValidatedSourceLink | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value.trim());
    const platform = HOST_PLATFORM[url.hostname.toLowerCase()];
    if (url.protocol !== "https:" || !platform) return null;
    if (platform === "youtube" && !isYouTubeVideoURL(url)) return null;
    url.hash = "";
    if (platform === "youtube") {
      url.searchParams.delete("list");
      url.searchParams.delete("index");
    }
    return { platform, url };
  } catch {
    return null;
  }
}

export function sourcePlatform(value: string): SourcePlatform | null {
  return validateSourceLink(value)?.platform ?? null;
}

export function parseTimecode(value: string): number | null {
  const normalized = value.trim();
  if (!normalized || !/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(normalized)) return null;
  const parts = normalized.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length > 1 && parts.slice(1).some((part) => part >= 60)) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function formatTimecode(value: number): string {
  const seconds = Math.max(0, Math.round(value));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function youtubeRangeError(startSeconds: number | null, endSeconds: number | null): string | null {
  if (startSeconds === null || endSeconds === null) return "Use a time like 0:00 or 1:30.";
  if (endSeconds <= startSeconds) return "End time must be after the start time.";
  const duration = endSeconds - startSeconds;
  if (duration < MIN_YOUTUBE_SEGMENT_SECONDS) return "Choose at least one second.";
  if (duration > MAX_YOUTUBE_SEGMENT_SECONDS) return "Choose a segment of 8 minutes or less.";
  return null;
}
