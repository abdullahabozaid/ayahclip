import { expect, test, type Page } from "@playwright/test";

type VideoFormat = "9:16" | "16:9" | "1:1" | "4:5";

const EXPECTED_DIMENSIONS: Record<VideoFormat, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

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
  for (let index = 0; index < sampleCount; index++) {
    const edge = sampleRate * 0.1;
    const envelope = index < edge || index > sampleCount - edge ? 0 : 1;
    const sample = Math.round(
      Math.sin((2 * Math.PI * 220 * index) / sampleRate) * 0.18 * 32_767 * envelope,
    );
    wav.writeInt16LE(sample, 44 + index * 2);
  }
  return wav;
}

async function openStudio(page: Page) {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "format-parity.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: /format-parity\.wav/ })).toContainText("Loaded");
  await page.getByRole("combobox", { name: "Surah" }).selectOption("51");
  await page.getByRole("spinbutton", { name: "From" }).fill("1");
  await page.getByRole("spinbutton", { name: "To" }).fill("1");
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await page.getByRole("button", { name: "Choose a template" }).click();
  const template = page.locator("article").filter({
    has: page.getByRole("heading", { level: 2, name: "Reciter Split Fade" }),
  });
  await template.getByRole("button", { name: "Use template" }).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(page.getByText("Verse Editor", { exact: true })).toBeVisible();
}

async function chooseFormat(page: Page, format: VideoFormat) {
  const settings = page.getByRole("button", { name: "Toggle settings", exact: true });
  if ((await settings.getAttribute("aria-expanded")) !== "true") await settings.click();
  const section = page.getByRole("button", { name: "Format", exact: true });
  if ((await section.getAttribute("aria-expanded")) !== "true") await section.click();
  await page.getByRole("button", { name: `${format} format`, exact: true }).click();
  await expect(page.getByRole("button", { name: `${format} format`, exact: true }))
    .toHaveAttribute("aria-pressed", "true");
}

async function expectPreviewAndExactMp4(
  page: Page,
  expected: { width: number; height: number },
) {
  const preview = page.getByLabel(/(?:Clip|Media|Frame) preview/);
  await expect(preview).toBeVisible();
  // The preview backing store tracks on-screen size × devicePixelRatio (capped
  // at the export resolution) so text rasterizes crisply; composition still
  // happens in export coordinates via drawScene. Parity here means the same
  // aspect ratio as the exact MP4 and a backing store at display density.
  await expect.poll(() => preview.evaluate((canvas: HTMLCanvasElement, exact) => {
    const dpr = window.devicePixelRatio || 1;
    const expectedW = Math.max(1, Math.min(exact.width, Math.round(canvas.clientWidth * dpr)));
    return {
      aspectOk: Math.abs(canvas.width / canvas.height - exact.width / exact.height) < 0.01,
      densityOk: Math.abs(canvas.width - expectedW) <= 1,
    };
  }, expected)).toEqual({ aspectOk: true, densityOk: true });

  await page.getByRole("button", { name: "Preview the final MP4" }).click();
  const dialog = page.getByRole("dialog", { name: "Final MP4 preview" });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  const video = dialog.locator("video");
  await expect.poll(
    () => video.evaluate((element: HTMLVideoElement) => element.readyState),
    { timeout: 20_000 },
  ).toBeGreaterThanOrEqual(1);
  const result = await video.evaluate(async (element: HTMLVideoElement) => {
    const blob = await fetch(element.src).then((response) => response.blob());
    return {
      height: element.videoHeight,
      size: blob.size,
      type: blob.type,
      width: element.videoWidth,
    };
  });
  expect(result).toMatchObject({ ...expected, type: "video/mp4" });
  expect(result.size).toBeGreaterThan(10_000);
  await dialog.getByRole("button", { name: /Close/ }).click();
  await expect(dialog).toBeHidden();
}

test("every supported format keeps preview and exact MP4 dimensions in parity", async ({ page }) => {
  await openStudio(page);
  for (const format of Object.keys(EXPECTED_DIMENSIONS) as VideoFormat[]) {
    await chooseFormat(page, format);
    await expectPreviewAndExactMp4(page, EXPECTED_DIMENSIONS[format]);
  }
});
