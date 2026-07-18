import { expect, test } from "@playwright/test";

test("public API boundaries reject cross-site and oversized requests", async ({ request }) => {
  const pexels = await request.get("/api/pexels?query=nature", {
    headers: { "sec-fetch-site": "cross-site" },
  });
  expect(pexels.status()).toBe(403);

  const checkout = await request.post("/api/support/checkout", {
    headers: { origin: "https://attacker.example" },
    data: { amount: 5, frequency: "one-time" },
  });
  expect(checkout.status()).toBe(403);

  const sameOrigin = new URL((await request.get("/")).url()).origin;
  const oversizedCheckout = await request.post("/api/support/checkout", {
    headers: { origin: sameOrigin, "content-type": "application/json" },
    data: { amount: 5, frequency: "one-time", junk: "x".repeat(2_100) },
  });
  expect(oversizedCheckout.status()).toBe(413);

  const validCheckout = await request.post("/api/support/checkout", {
    headers: { origin: sameOrigin },
    data: { amount: 5, frequency: "one-time" },
  });
  expect(validCheckout.status()).not.toBe(403);
  expect(validCheckout.status()).not.toBe(413);

  const telemetry = await request.post("/api/telemetry", {
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    data: { junk: "x".repeat(2_100) },
  });
  expect(telemetry.status()).toBe(413);
});

test("disk-backed creator storage is unreachable on the public deployment", async ({ request }) => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, "public filesystem boundary requires a deployed host");

  expect((await request.get("/api/library")).status()).toBe(404);
  expect((await request.get("/api/library/folders")).status()).toBe(404);
  expect((await request.get("/api/library/not-a-real-clip/video")).status()).toBe(404);

  const save = await request.post("/api/save-export", {
    headers: { origin: process.env.PLAYWRIGHT_BASE_URL! },
    multipart: {
      file: { name: "probe.mp4", mimeType: "video/mp4", buffer: Buffer.from("probe") },
    },
  });
  expect(save.status()).toBe(403);
});
