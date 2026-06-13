import { NextResponse } from "next/server";
import { readMeta, readVideo } from "@/lib/library-server";

export const runtime = "nodejs";

// GET /api/library/[id]/video → stream the stored clip's video bytes.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meta = await readMeta(id);
  if (!meta) return new NextResponse("Not found", { status: 404 });
  const data = await readVideo(meta);
  if (!data) return new NextResponse("Video missing", { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": meta.mimeType || "video/mp4",
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
