import { NextResponse } from "next/server";
import { readMeta, readVideo, canonicalVideoType } from "@/lib/library-server";

export const runtime = "nodejs";

// GET /api/library/[id]/video → stream the stored clip's video bytes.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meta = await readMeta(id);
  if (!meta) return new NextResponse("Not found", { status: 404 });
  const data = await readVideo(meta);
  if (!data) return new NextResponse("Video missing", { status: 404 });
  // Force a safe Content-Type derived from the stored type (never echo arbitrary
  // client input), with nosniff so the browser can't reinterpret the bytes.
  const type = canonicalVideoType(meta.mimeType) ?? "video/mp4";
  const ext = type === "video/webm" ? "webm" : "mp4";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename="clip.${ext}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
