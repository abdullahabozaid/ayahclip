import { NextRequest, NextResponse } from "next/server";
import type { LibraryClip } from "@/lib/clip-library";
import { readMeta, writeMeta, removeClip, originAllowed } from "@/lib/library-server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/library/[id] → merge a metadata patch (schedule, folder, status…).
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!originAllowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const existing = await readMeta(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let patch: Partial<LibraryClip>;
  try {
    patch = (await req.json()) as Partial<LibraryClip>;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  // id is immutable; mimeType would orphan the video file.
  const next: LibraryClip = { ...existing, ...patch, id: existing.id, mimeType: existing.mimeType };
  await writeMeta(next);
  return NextResponse.json({ clip: next });
}

// DELETE /api/library/[id] → remove metadata + video file.
export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!originAllowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const existing = await readMeta(id);
  if (existing) await removeClip(existing);
  return new NextResponse(null, { status: 204 });
}
