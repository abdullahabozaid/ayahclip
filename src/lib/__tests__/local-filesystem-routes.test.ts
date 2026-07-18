import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as saveExport } from "@/app/api/save-export/route";
import { POST as saveLibraryClip } from "@/app/api/library/route";

function post(path: string, origin: string): NextRequest {
  return new NextRequest(`http://192.168.1.10:3000${path}`, {
    method: "POST",
    headers: {
      host: "192.168.1.10:3000",
      origin,
    },
  });
}

describe("local filesystem route boundaries", () => {
  it("rejects writes submitted by another private-LAN origin", async () => {
    const hostileOrigin = "http://192.168.1.20:3000";
    expect((await saveExport(post("/api/save-export", hostileOrigin))).status).toBe(403);
    expect((await saveLibraryClip(post("/api/library", hostileOrigin))).status).toBe(403);
  });

  it("passes exact-origin requests through to normal body validation", async () => {
    const exactOrigin = "http://192.168.1.10:3000";
    expect((await saveExport(post("/api/save-export", exactOrigin))).status).toBe(400);
    expect((await saveLibraryClip(post("/api/library", exactOrigin))).status).toBe(400);
  });
});
