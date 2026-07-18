import { expect, test } from "@playwright/test";

test("social source import rejects non-platform URLs before resolving them", async ({ request }) => {
  const response = await request.post("/api/social-download", {
    data: { url: "https://example.com/video/123" },
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "Paste a supported YouTube, TikTok, or Instagram video link.",
  });
});

test("YouTube source imports require a bounded segment and ownership confirmation", async ({ request }) => {
  const url = "https://www.youtube.com/watch?v=owned-video";
  const missingRights = await request.post("/api/social-download", {
    data: { url, startSeconds: 0, endSeconds: 180 },
  });
  expect(missingRights.status()).toBe(400);
  await expect(missingRights.json()).resolves.toEqual({
    error: "Confirm that you own this YouTube video or have permission to edit it.",
  });

  const excessiveRange = await request.post("/api/social-download", {
    data: { url, startSeconds: 0, endSeconds: 481, attestedRights: true },
  });
  expect(excessiveRange.status()).toBe(400);
  await expect(excessiveRange.json()).resolves.toEqual({
    error: "Choose a segment of 8 minutes or less.",
  });
});

test("validation mistakes do not consume the resolver quota", async ({ request }) => {
  const headers = { "x-forwarded-for": "203.0.113.77" };
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const response = await request.post("/api/social-download", {
      headers,
      data: { url: `https://example.com/not-a-source/${attempt}` },
    });
    expect(response.status()).toBe(400);
  }

  const rightsPrompt = await request.post("/api/social-download", {
    headers,
    data: {
      url: "https://youtu.be/owned-video",
      startSeconds: 0,
      endSeconds: 60,
    },
  });
  expect(rightsPrompt.status()).toBe(400);
  await expect(rightsPrompt.json()).resolves.toMatchObject({
    error: expect.stringContaining("Confirm that you own"),
  });
});

test("desktop link import reveals precise YouTube segment controls", async ({ page }) => {
  await page.goto("/import");
  const linkField = page.getByLabel("Import from a link");
  await linkField.fill("https://www.youtube.com/watch?v=owned-video");

  await expect(page.getByLabel("Start")).toHaveValue("0:00");
  await expect(page.getByLabel("End")).toHaveValue("3:00");
  const importButton = page.getByRole("button", { name: "Import 3:00 segment" });
  await expect(importButton).toBeDisabled();

  await page.getByRole("button", { name: "5 min" }).click();
  await expect(page.getByLabel("End")).toHaveValue("5:00");
  await page.getByText("I own this video or have permission", { exact: false }).click();
  await expect(page.getByRole("button", { name: "Import 5:00 segment" })).toBeEnabled();
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

test("a permitted YouTube segment resolves to an editable MP4", async ({ request }) => {
  const url = process.env.YOUTUBE_SOURCE_SMOKE_URL;
  test.skip(!url, "Set YOUTUBE_SOURCE_SMOKE_URL to an upload you own before running this live test.");
  test.setTimeout(360_000);

  const response = await request.post("/api/social-download", {
    data: { url, startSeconds: 0, endSeconds: 30, attestedRights: true },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("video/mp4");
  expect(Number(response.headers()["content-length"])).toBeGreaterThan(100_000);
  expect((await response.body()).subarray(4, 8).toString("ascii")).toBe("ftyp");
});
