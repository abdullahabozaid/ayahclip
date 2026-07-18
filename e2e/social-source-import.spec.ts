import { expect, test } from "@playwright/test";

test("social source import rejects non-platform URLs before resolving them", async ({ request }) => {
  const response = await request.post("/api/social-download", {
    data: { url: "https://example.com/video/123" },
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "Paste a public TikTok or Instagram post link.",
  });
});

test("a real public social post resolves to an editable MP4", async ({ request }) => {
  const url = process.env.SOCIAL_RESOLVER_SMOKE_URL;
  test.skip(!url, "Set SOCIAL_RESOLVER_SMOKE_URL to run the live resolver smoke test.");
  test.setTimeout(180_000);

  const response = await request.post("/api/social-download", { data: { url } });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("video/mp4");
  expect(Number(response.headers()["content-length"])).toBeGreaterThan(100_000);
  expect((await response.body()).subarray(4, 8).toString("ascii")).toBe("ftyp");
});
