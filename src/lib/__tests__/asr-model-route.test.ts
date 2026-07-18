import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/asr-model/route";

const MODEL_BYTES = 131_652_337;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ASR model delivery route", () => {
  it("streams only the expected versioned model with immutable CDN caching", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Uint8Array([1]), {
      headers: { "content-length": String(MODEL_BYTES) },
    }));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-length")).toBe(String(MODEL_BYTES));
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("vercel-cdn-cache-control")).toContain("immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects an upstream asset whose declared size does not match the reviewed model", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Uint8Array([1]), {
      headers: { "content-length": "1" },
    }));

    expect((await GET()).status).toBe(502);
  });

  it("returns a fixed gateway error when the model host is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("private upstream detail"));

    const response = await GET();
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Model temporarily unavailable");
  });
});
