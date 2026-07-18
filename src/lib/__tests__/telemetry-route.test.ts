import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/telemetry/route";
import { resetRateLimitsForTests } from "../server-rate-limit";

const validEvent = {
  event: "export_succeeded",
  journeyId: "6bbbf0a1-76a4-44bf-9e3c-8c83a9b1b114",
  path: "/studio",
  deviceClass: "desktop",
  browserFamily: "chromium",
  durationBucket: "1_to_3m",
  exportAction: "download",
  exportPath: "webcodecs",
};

function request(body: unknown, address = "203.0.113.10"): Request {
  return new Request("https://ayahclip.test/api/telemetry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": address,
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  resetRateLimitsForTests();
  vi.restoreAllMocks();
});

describe("telemetry route", () => {
  it("writes one privacy-safe, versioned structured log", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await POST(request({
      ...validEvent,
      fileName: "private-recitation.mov",
      transcript: "must stay in the browser",
    }));

    expect(response.status).toBe(204);
    expect(info).toHaveBeenCalledOnce();
    const logged = JSON.parse(String(info.mock.calls[0][0]));
    expect(logged).toMatchObject({
      type: "ayahclip_product_event",
      schemaVersion: 1,
      ...validEvent,
    });
    expect(logged).not.toHaveProperty("fileName");
    expect(logged).not.toHaveProperty("transcript");
  });

  it("handles a same-client concurrent burst deterministically", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const responses = await Promise.all(
      Array.from({ length: 601 }, () => POST(request(validEvent)))
    );
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 204)).toHaveLength(600);
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
    expect(info).toHaveBeenCalledTimes(600);
  });

  it("rejects cross-site, malformed and semantically incomplete events", async () => {
    const crossSite = request(validEvent);
    crossSite.headers.set("sec-fetch-site", "cross-site");

    expect((await POST(crossSite)).status).toBe(403);
    expect((await POST(request({ ...validEvent, exportPath: undefined }))).status).toBe(400);
    expect((await POST(request({ ...validEvent, journeyId: "short" }))).status).toBe(400);
  });
});
