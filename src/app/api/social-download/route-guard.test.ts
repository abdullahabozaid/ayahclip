import { afterEach, describe, expect, it, vi } from "vitest";
import { resetRateLimitsForTests } from "@/lib/server-rate-limit";

// Mock the jobs module so we control startSocialDownloadJob (and can make it
// report a full queue). Kept in its own file so the pure-function tests in
// route.test.ts still exercise the real social-download-jobs implementation.
vi.mock("@/lib/social-download-jobs", () => {
  class ImportBusyError extends Error {
    constructor() {
      super("The import queue is full right now.");
      this.name = "ImportBusyError";
    }
  }
  return {
    ImportBusyError,
    startSocialDownloadJob: vi.fn(async () => "job-123"),
  };
});

import { POST } from "./route";
import { ImportBusyError, startSocialDownloadJob } from "@/lib/social-download-jobs";

afterEach(() => {
  resetRateLimitsForTests();
  vi.clearAllMocks();
});

function request(headers: Record<string, string> = {}) {
  return new Request("https://ayahclip.test/api/social-download", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.50",
      ...headers,
    },
    // A real, allow-listed TikTok URL so validateSourceLink (not mocked) passes.
    body: JSON.stringify({ url: "https://www.tiktok.com/@creator/video/123" }),
  });
}

describe("social-download POST guards", () => {
  it("rejects cross-site requests before starting any job", async () => {
    const res = await POST(request({ "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
    expect(startSocialDownloadJob).not.toHaveBeenCalled();
  });

  it("allows same-origin and header-less requests through to a job", async () => {
    const sameOrigin = await POST(request({ "sec-fetch-site": "same-origin" }));
    expect(sameOrigin.status).toBe(202);
    const headerless = await POST(request());
    expect(headerless.status).toBe(202);
    expect(startSocialDownloadJob).toHaveBeenCalledTimes(2);
  });

  it("returns 503 with retry-after (not a job) when the import queue is full", async () => {
    vi.mocked(startSocialDownloadJob).mockRejectedValueOnce(new ImportBusyError());
    const res = await POST(request({ "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain("queue is full");
  });
});
