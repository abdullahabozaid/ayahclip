import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { getSocialDownloadFile } from "@/lib/social-download-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const file = getSocialDownloadFile(jobId);
  if (!file) {
    return Response.json({ error: "That import is not ready or no longer available." }, { status: 404 });
  }
  // The temp dir is NOT deleted after a read: the job's TTL sweep owns cleanup
  // so a dropped connection can simply re-fetch the finished file.
  const nodeStream = createReadStream(file.filePath);
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(file.fileBytes),
      "Content-Disposition": `attachment; filename="${file.fileName.replace(/["\\]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-AyahClip-Import-Quality": file.quality,
    },
  });
}
