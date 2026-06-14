import { NextRequest } from "next/server";

const QCF_BASE = "https://quran.com/fonts/quran/hafs/v2/woff2";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page");

  if (!page || !/^\d{1,3}$/.test(page)) {
    return new Response("Invalid page", { status: 400 });
  }

  const pageNum = parseInt(page, 10);
  if (pageNum < 1 || pageNum > 604) {
    return new Response("Page out of range", { status: 400 });
  }

  const res = await fetch(`${QCF_BASE}/p${pageNum}.woff2`);
  if (!res.ok) {
    return new Response("Font not found", { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "font/woff2",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
