import { buildProductEventLog, parseProductEvent } from "@/lib/telemetry-schema";
import { checkRateLimit, rateLimitHeaders } from "@/lib/server-rate-limit";

export const dynamic = "force-dynamic";
const MAX_TELEMETRY_BYTES = 2_048;
const TELEMETRY_EVENTS_PER_MINUTE = 600;

export async function POST(request: Request): Promise<Response> {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_TELEMETRY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }
  const rateLimit = checkRateLimit(request, {
    namespace: "telemetry",
    // Telemetry is cheap structured logging. A higher per-IP ceiling avoids
    // throttling unrelated creators behind a school, mosque, office or mobile
    // carrier NAT while still bounding accidental loops on a warm instance.
    limit: TELEMETRY_EVENTS_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many events" },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }
  let parsed: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_TELEMETRY_BYTES) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  const event = parseProductEvent(parsed);
  if (!event) return Response.json({ error: "Bad event" }, { status: 400 });

  // The container runtime captures structured stdout. Do not add request IP,
  // headers, user-agent, referrer, free-form messages, or creator content here.
  console.info(JSON.stringify(buildProductEventLog(event)));
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
