import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, basename, resolve } from "path";
import { homedir } from "os";
import { existsSync } from "fs";

const EXPORTS_DIR = join(homedir(), "Documents", "AyahClip", "Exports");
const ALLOWED_EXT = new Set([".mp4", ".webm"]);
const MAX_SIZE = 500 * 1024 * 1024; // 500 MB

export async function POST(req: NextRequest) {
  // Only the local dev origin (or a device on the LAN, e.g. the phone) may write
  // to disk. Parse the hostname — a startsWith check matches evil lookalikes
  // like http://localhost.attacker.com.
  const origin = req.headers.get("origin") ?? "";
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).hostname;
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    const isLan =
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
    if (!isLocal && !isLan) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  let name = basename(file.name || "export.mp4");
  if (name.startsWith(".") || name === "") name = "export.mp4";

  const ext = name.match(/\.\w+$/)?.[0]?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  await mkdir(EXPORTS_DIR, { recursive: true });

  const resolved = resolve(EXPORTS_DIR, name);
  if (!resolved.startsWith(resolve(EXPORTS_DIR) + "/")) {
    return NextResponse.json({ error: "Bad name" }, { status: 400 });
  }

  if (existsSync(resolved)) {
    const base = name.replace(/\.\w+$/, "");
    let i = 1;
    while (existsSync(join(EXPORTS_DIR, `${base} (${i})${ext}`))) {
      i++;
    }
    name = `${base} (${i})${ext}`;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(EXPORTS_DIR, name), buffer);

  return NextResponse.json({ saved: name, path: join(EXPORTS_DIR, name) });
}
