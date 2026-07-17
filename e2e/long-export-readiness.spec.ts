import { expect, test } from "@playwright/test";

function longToneWav(durationSeconds = 181, sampleRate = 16_000): Buffer {
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
    const edge = sampleRate * 0.15;
    const envelope = i < edge || i > sampleCount - edge ? 0 : 1;
    wav.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 196 * i) / sampleRate) * 0.12 * 32767 * envelope),
      44 + i * 2,
    );
  }
  return wav;
}

test("a constrained-memory browser exports a several-minute MP4", async ({ page }) => {
  test.slow();
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 4 });
  });
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
  await page.goto("/import");
  await expect(page.evaluate(() => (navigator as Navigator & { deviceMemory?: number }).deviceMemory)).resolves.toBe(4);
  await page.locator('input[type="file"]').setInputFiles({
    name: "three-minute-recitation.wav",
    mimeType: "audio/wav",
    buffer: longToneWav(),
  });
  await expect(page.getByRole("button", { name: /three-minute-recitation\.wav/ })).toContainText("Loaded", { timeout: 30_000 });
  await page.getByRole("combobox", { name: "Surah" }).selectOption("51");
  await page.getByRole("spinbutton", { name: "From" }).fill("1");
  await page.getByRole("spinbutton", { name: "To" }).fill("2");
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await page.getByRole("button", { name: "Choose a template" }).click();
  const template = page.locator("article").filter({
    has: page.getByRole("heading", { level: 2, name: "Reciter Split Fade" }),
  });
  await template.getByRole("button", { name: "Use template" }).click();
  await page.getByRole("button", { name: "Preview the final MP4" }).click();
  const dialog = page.getByRole("dialog", { name: "Final MP4 preview" });
  await expect(dialog).toBeVisible({ timeout: 120_000 });
  const video = dialog.locator("video");
  await expect.poll(
    () => video.evaluate((element: HTMLVideoElement) => element.readyState),
    { timeout: 20_000 },
  ).toBeGreaterThanOrEqual(1);
  const result = await video.evaluate(async (element: HTMLVideoElement) => {
    const blob = await fetch(element.src).then((response) => response.blob());
    return { duration: element.duration, size: blob.size, type: blob.type };
  });
  expect(result.type).toBe("video/mp4");
  expect(result.size).toBeGreaterThan(500_000);
  expect(result.duration).toBeGreaterThan(180);
  expect(result.duration).toBeLessThan(182);
});
