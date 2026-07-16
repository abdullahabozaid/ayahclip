import { NextRequest, NextResponse } from "next/server";
import { listFolders, writeFolders, originAllowed, localRequestAllowed } from "@/lib/library-server";

export const runtime = "nodejs";

// GET /api/library/folders → the folder name list.
export async function GET(req: NextRequest) {
  if (!localRequestAllowed(req)) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  return NextResponse.json({ folders: await listFolders() });
}

// PUT /api/library/folders → replace the folder name list.
export async function PUT(req: NextRequest) {
  if (!localRequestAllowed(req) || !originAllowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { folders?: unknown };
  try {
    body = (await req.json()) as { folders?: unknown };
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const folders = Array.isArray(body.folders)
    ? body.folders.filter((f): f is string => typeof f === "string")
    : [];
  await writeFolders(folders);
  return NextResponse.json({ folders });
}
