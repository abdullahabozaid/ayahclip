export const runtime = "edge";

const GITHUB_URL =
  "https://github.com/abdullahabozaid/ayahclip/releases/download/asr-model-v1/fastconformer_ar_ctc_q8.onnx";
const MODEL_BYTES = 131_652_337;

export async function GET() {
  let upstream: Response;
  try {
    // This 131 MB binary is already cached by the browser/CDN. Do not ask the
    // Next.js data cache to serialize it as one entry; that exceeds its item
    // limit and previously produced a misleading recognition failure signal.
    upstream = await fetch(GITHUB_URL, { redirect: "follow", cache: "no-store" });
  } catch {
    return new Response("Model temporarily unavailable", { status: 502 });
  }
  if (!upstream.ok) {
    return new Response("Model temporarily unavailable", { status: 502 });
  }
  const contentLength = Number(upstream.headers.get("content-length"));
  if (contentLength !== MODEL_BYTES || !upstream.body) {
    await upstream.body?.cancel();
    return new Response("Model integrity check failed", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(MODEL_BYTES),
      "Cache-Control": "public, max-age=31536000, immutable",
      "CDN-Cache-Control": "public, max-age=31536000, immutable",
      "Vercel-CDN-Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
