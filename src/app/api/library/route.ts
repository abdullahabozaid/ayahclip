import { NextRequest, NextResponse } from "next/server";
import type { LibraryClip } from "@/lib/clip-library";
import {
  listMeta,
  listFolders,
  writeMeta,
  writeVideo,
  originAllowed,
  canonicalVideoType,
  MAX_VIDEO_BYTES,
  localRequestAllowed,
} from "@/lib/library-server";

export const runtime = "nodejs";

// GET /api/library → every stored clip's metadata + the folder list.
export async function GET(req: NextRequest) {
  if (!localRequestAllowed(req)) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const [clips, folders] = await Promise.all([listMeta(), listFolders()]);
  return NextResponse.json({ clips, folders });
}

// POST /api/library → save a clip (multipart: `file` video + `meta` JSON).
export async function POST(req: NextRequest) {
  if (!localRequestAllowed(req) || !originAllowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const file = form.get("file");
  const metaRaw = form.get("meta");
  if (!(file instanceof File) || typeof metaRaw !== "string") {
    return NextResponse.json({ error: "Missing file or meta" }, { status: 400 });
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  let meta: LibraryClip;
  try {
    meta = JSON.parse(metaRaw) as LibraryClip;
  } catch {
    return NextResponse.json({ error: "Bad meta JSON" }, { status: 400 });
  }
  if (!meta.id || typeof meta.id !== "string") {
    return NextResponse.json({ error: "meta.id required" }, { status: 400 });
  }

  // Only store known video types, and normalize the stored mimeType to the
  // canonical base — so the video route can never echo an attacker-chosen
  // Content-Type (e.g. text/html) back on this origin.
  const canonType = canonicalVideoType(meta.mimeType);
  if (!canonType) {
    return NextResponse.json({ error: "Unsupported video type" }, { status: 415 });
  }
  meta.mimeType = canonType;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeVideo(meta.id, meta.mimeType, buffer);
    await writeMeta(meta);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "write failed" },
      { status: 400 }
    );
  }
  return NextResponse.json({ clip: meta });
}
