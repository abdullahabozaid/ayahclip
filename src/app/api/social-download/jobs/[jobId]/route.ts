import { cancelSocialDownloadJob, getSocialDownloadJobStatus } from "@/lib/social-download-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const status = getSocialDownloadJobStatus(jobId);
  if (!status) {
    return Response.json({ error: "That import is no longer available. Start it again." }, { status: 404 });
  }
  return Response.json(status, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  cancelSocialDownloadJob(jobId);
  return new Response(null, { status: 204 });
}
