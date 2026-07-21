import {
  bulkYoutubeRangeError,
  validateSourceLink,
  youtubeRangeError,
} from "@/lib/source-link";
import { checkRateLimit, rateLimitClientKey, rateLimitHeaders, releaseRateLimit } from "@/lib/server-rate-limit";
import { ImportBusyError, startSocialDownloadJob, type SourceImportQuality } from "@/lib/social-download-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const SOURCE_IMPORT_RATE_LIMIT = {
  namespace: "source-import",
  // A shared home, school, mosque, or mobile-carrier address must not lock out
  // legitimate creators during a review session. Completed imports alone use
  // this allowance; validation and extractor failures release their slot.
  limit: 30,
  windowMs: 10 * 60_000,
};

export async function POST(request: Request) {
  // Block cross-site browser traffic (same trade-off as telemetry/social-caption):
  // real same-origin fetches send same-origin/none; non-browser clients omit the
  // header and still pass. Stops any page on the internet spawning yt-dlp jobs.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Paste a complete YouTube, TikTok, or Instagram video link." }, { status: 400 });
  }

  const input = body as {
    url?: unknown;
    startSeconds?: unknown;
    endSeconds?: unknown;
    attestedRights?: unknown;
    bulk?: unknown;
    quality?: unknown;
  };
  const source = validateSourceLink(input?.url);
  if (!source) {
    return Response.json({ error: "Paste a supported YouTube, TikTok, or Instagram video link." }, { status: 400 });
  }

  let startSeconds: number | undefined;
  let endSeconds: number | undefined;
  const quality: SourceImportQuality = input.quality === "hd" ? "hd" : "fast";
  if (source.platform === "youtube") {
    if (input.attestedRights !== true) {
      return Response.json(
        { error: "Confirm that you own this YouTube video or have permission to edit it." },
        { status: 400 },
      );
    }
    startSeconds = typeof input.startSeconds === "number" ? input.startSeconds : NaN;
    endSeconds = typeof input.endSeconds === "number" ? input.endSeconds : NaN;
    const rangeError = input.bulk === true
      ? bulkYoutubeRangeError(startSeconds, endSeconds)
      : youtubeRangeError(startSeconds, endSeconds);
    if (rangeError) return Response.json({ error: rangeError }, { status: 400 });
  }

  // Only a validated request that is about to start yt-dlp consumes quota.
  // Typos, rights prompts, malformed timestamps, and API readiness probes must
  // not lock a creator out of the real import they are trying to make.
  const rateLimit = checkRateLimit(request, SOURCE_IMPORT_RATE_LIMIT);
  if (!rateLimit.allowed) {
    const minutes = Math.max(1, Math.ceil(rateLimit.retryAfterSeconds / 60));
    return Response.json(
      { error: `Too many completed import attempts from this connection. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  let jobId: string;
  try {
    jobId = await startSocialDownloadJob({
      platform: source.platform,
      url: source.url.toString(),
      startSeconds,
      endSeconds,
      quality,
      bulk: input.bulk === true,
      rateLimitKey: rateLimitClientKey(request, SOURCE_IMPORT_RATE_LIMIT),
    });
  } catch (err) {
    if (err instanceof ImportBusyError) {
      // A full queue did no real work for this creator, so refund the slot the
      // rate-limit check just reserved and ask them to retry shortly.
      releaseRateLimit(request, SOURCE_IMPORT_RATE_LIMIT);
      return Response.json(
        { error: "The import queue is full right now. Try again in about a minute." },
        { status: 503, headers: { "retry-after": "60" } },
      );
    }
    throw err;
  }
  return Response.json({ jobId }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
}
