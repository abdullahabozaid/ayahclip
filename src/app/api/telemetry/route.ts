import { parseProductEvent } from "@/lib/telemetry-schema";
import { checkRateLimit, rateLimitHeaders } from "@/lib/server-rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const rateLimit = checkRateLimit(request, {
    namespace: "telemetry",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many events" },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_048) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }
  let parsed: unknown;
  try {
    const text = await request.text();
    if (text.length > 2_048) return Response.json({ error: "Payload too large" }, { status: 413 });
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  const event = parseProductEvent(parsed);
  if (!event) return Response.json({ error: "Bad event" }, { status: 400 });

  // Vercel captures structured stdout in Runtime Logs. Do not add request IP,
  // headers, user-agent, referrer, free-form messages, or creator content here.
  console.info(JSON.stringify({
    type: "ayahclip_product_event",
    receivedAt: new Date().toISOString(),
    ...event,
  }));
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
