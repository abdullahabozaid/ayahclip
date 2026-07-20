import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.PLAYWRIGHT_BASE_URL, "production smoke runs only against an explicit deployed URL");

function toneWav(durationSeconds = 1.2, sampleRate = 16_000): Buffer {
  const sampleCount = Math.round(durationSeconds * sampleRate);
  const dataSize = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < sampleCount; i++) {
    const edge = sampleRate * 0.1;
    const envelope = i < edge || i > sampleCount - edge ? 0 : 1;
    const sample = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.18 * 32767 * envelope);
    wav.writeInt16LE(sample, 44 + i * 2);
  }
  return wav;
}

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("deployed AyahClip completes a real MP4 journey in Google Chrome", async ({ page, request }) => {
  test.slow();
  const errors = collectBrowserErrors(page);
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));

  const homepage = await request.get("/");
  expect(homepage.status()).toBe(200);
  expect(homepage.headers()["x-content-type-options"]).toBe("nosniff");
  expect(homepage.headers()["x-frame-options"]).toBe("DENY");
  expect(homepage.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(homepage.headers()["strict-transport-security"]).toContain("max-age=63072000");
  expect(homepage.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(homepage.headers()["permissions-policy"]).toContain("browsing-topics=()");

  const model = await request.head("/api/asr-model");
  expect(model.status()).toBe(200);
  expect(model.headers()["content-type"]).toContain("application/octet-stream");
  expect(model.headers()["cache-control"]).toContain("immutable");

  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "production-smoke.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: /production-smoke\.wav/ })).toContainText("Loaded");

  await page.getByRole("combobox", { name: "Surah" }).selectOption("51");
  await page.getByRole("spinbutton", { name: "From" }).fill("1");
  await page.getByRole("spinbutton", { name: "To" }).fill("2");
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await page.getByRole("button", { name: "Choose a template" }).click();

  const template = page.locator("article").filter({
    has: page.getByRole("heading", { level: 2, name: "Reciter Split Fade" }),
  });
  await template.getByRole("button", { name: "Use template" }).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(page.getByText("Verse Editor", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Preview the final MP4" }).click();
  const preview = page.getByRole("dialog", { name: "Final MP4 preview" });
  await expect(preview).toBeVisible({ timeout: 60_000 });
  const video = preview.locator("video");
  await expect.poll(
    () => video.evaluate((element: HTMLVideoElement) => element.readyState),
    { timeout: 20_000 },
  ).toBeGreaterThanOrEqual(1);
  const rendered = await video.evaluate(async (element: HTMLVideoElement) => {
    const blob = await fetch(element.src).then((response) => response.blob());
    return { duration: element.duration, size: blob.size, type: blob.type };
  });
  expect(rendered).toMatchObject({ type: "video/mp4" });
  expect(rendered.size).toBeGreaterThan(10_000);
  expect(rendered.duration).toBeGreaterThan(0.8);
  expect(rendered.duration).toBeLessThan(1.3);
  expect(errors).toEqual([]);
});

test("deployed recognition bundle targets the reviewed same-origin model asset", async ({ page }) => {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/models/fastconformer_ar_ctc_q8.onnx", (route) =>
    route.fulfill({ status: 503, body: "test stop" })
  );
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "recognition-route.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: /recognition-route\.wav/ })).toContainText("Loaded");

  const modelRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname === "/models/fastconformer_ar_ctc_q8.onnx"
  );
  await page.getByRole("button", { name: "Recognise verses" }).click();
  expect(new URL((await modelRequest).url()).origin).toBe(new URL(page.url()).origin);
});
