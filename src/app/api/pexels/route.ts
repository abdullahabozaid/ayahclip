import { NextRequest } from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/server-rate-limit";

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

export async function GET(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const rateLimit = checkRateLimit(request, {
    namespace: "pexels-search",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many searches" },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }
  if (!PEXELS_API_KEY || PEXELS_API_KEY === "your_pexels_api_key_here") {
    return Response.json(
      { error: "Pexels API key not configured. Add PEXELS_API_KEY to .env.local" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "nature").trim().slice(0, 80) || "nature";
  const page = Math.min(1000, Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1));
  const perPage = Math.min(40, Math.max(1, Number.parseInt(searchParams.get("per_page") ?? "15", 10) || 15));

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&orientation=portrait`;

  const res = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    return Response.json({ error: "Pexels API error" }, { status: res.status });
  }

  const data = await res.json();
  return Response.json(data);
}
