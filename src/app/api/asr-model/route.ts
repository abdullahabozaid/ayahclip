export const runtime = "edge";

const GITHUB_URL =
  "https://github.com/abdullahabozaid/ayahclip/releases/download/asr-model-v1/fastconformer_ar_ctc_q8.onnx";

export async function GET() {
  const upstream = await fetch(GITHUB_URL, { redirect: "follow" });
  if (!upstream.ok) {
    return new Response("Model not available", { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": upstream.headers.get("content-length") || "",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
