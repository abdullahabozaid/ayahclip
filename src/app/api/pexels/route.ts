import { NextRequest } from "next/server";

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

export async function GET(request: NextRequest) {
  if (!PEXELS_API_KEY || PEXELS_API_KEY === "your_pexels_api_key_here") {
    return Response.json(
      { error: "Pexels API key not configured. Add PEXELS_API_KEY to .env.local" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "nature";
  const page = searchParams.get("page") ?? "1";
  const perPage = searchParams.get("per_page") ?? "15";

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&orientation=portrait`;

  const res = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
  });

  if (!res.ok) {
    return Response.json({ error: "Pexels API error" }, { status: res.status });
  }

  const data = await res.json();
  return Response.json(data);
}
