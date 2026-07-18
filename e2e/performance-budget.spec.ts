import { expect, test, type Page } from "@playwright/test";

test.skip(
  !process.env.PERFORMANCE_BUDGET || !process.env.PLAYWRIGHT_BASE_URL,
  "performance budgets run only when explicitly enabled against a deployed URL",
);

const BUDGET_MS = {
  importUsable: 4_000,
  localAudioIngest: 2_000,
  studioTransition: 6_000,
  playbackResponse: 750,
  timelineScrubResponse: 500,
  exactMp4Preview: 30_000,
} as const;

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
    const envelope = index < sampleRate * 0.1 || index > sampleCount - sampleRate * 0.1 ? 0 : 1;
    const sample = Math.round(
      Math.sin((2 * Math.PI * 220 * index) / sampleRate) * 0.18 * 32_767 * envelope,
    );
    wav.writeInt16LE(sample, 44 + index * 2);
  }
  return wav;
}

async function elapsed<T>(operation: () => Promise<T>): Promise<{ value: T; milliseconds: number }> {
  const started = performance.now();
  const value = await operation();
  return { value, milliseconds: performance.now() - started };
}

async function openTimeline(page: Page) {
  const verseEditor = page.getByRole("button", { name: "Verse Editor", exact: true });
  if ((await verseEditor.getAttribute("aria-expanded")) !== "true") await verseEditor.click();
  const waveform = page.getByRole("region", {
    name: "Timeline waveform. Drag to scrub, pinch to zoom.",
  });
  await expect(waveform).toBeVisible();
  return waveform;
}

test("the deployed creator journey stays within explicit interaction budgets", async ({ page }, testInfo) => {
  test.slow();
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));

  const metrics: Record<keyof typeof BUDGET_MS, number> = {
    importUsable: 0,
    localAudioIngest: 0,
    studioTransition: 0,
    playbackResponse: 0,
    timelineScrubResponse: 0,
    exactMp4Preview: 0,
  };

  metrics.importUsable = (await elapsed(async () => {
    await page.goto("/import");
    await expect(page.locator('input[type="file"]')).toBeAttached();
  })).milliseconds;

  metrics.localAudioIngest = (await elapsed(async () => {
    await page.locator('input[type="file"]').setInputFiles({
      name: "performance-budget.wav",
      mimeType: "audio/wav",
      buffer: toneWav(),
    });
    await expect(page.getByRole("button", { name: /performance-budget\.wav/ })).toContainText("Loaded");
  })).milliseconds;

  await page.getByRole("combobox", { name: "Surah" }).selectOption("51");
  await page.getByRole("spinbutton", { name: "From" }).fill("1");
  await page.getByRole("spinbutton", { name: "To" }).fill("2");
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await page.getByRole("button", { name: "Choose a template" }).click();
  const template = page.locator("article").filter({
    has: page.getByRole("heading", { level: 2, name: "Reciter Split Fade" }),
  });
  metrics.studioTransition = (await elapsed(async () => {
    await template.getByRole("button", { name: "Use template" }).click();
    await expect(page).toHaveURL(/\/studio/);
    await expect(page.getByText("Verse Editor", { exact: true })).toBeVisible();
  })).milliseconds;

  const settings = page.getByRole("button", { name: "Toggle settings", exact: true });
  if ((await settings.getAttribute("aria-expanded")) === "true") await settings.click();
  const play = page.getByRole("button", { name: "Play", exact: true }).first();
  metrics.playbackResponse = (await elapsed(async () => {
    await play.click();
    await expect(page.getByRole("button", { name: "Pause", exact: true }).first()).toBeVisible();
  })).milliseconds;
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();

  const waveform = await openTimeline(page);
  const progress = waveform.locator("canvas").nth(1);
  const beforeScrub = await progress.evaluate((canvas) => canvas.style.clipPath);
  metrics.timelineScrubResponse = (await elapsed(async () => {
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => progress.evaluate((canvas) => canvas.style.clipPath)).not.toBe(beforeScrub);
  })).milliseconds;

  metrics.exactMp4Preview = (await elapsed(async () => {
    await page.getByRole("button", { name: "Preview the final MP4" }).click();
    const dialog = page.getByRole("dialog", { name: "Final MP4 preview" });
    await expect(dialog).toBeVisible({ timeout: BUDGET_MS.exactMp4Preview });
    await expect.poll(
      () => dialog.locator("video").evaluate((video: HTMLVideoElement) => video.readyState),
      { timeout: 10_000 },
    ).toBeGreaterThanOrEqual(1);
  })).milliseconds;

  await testInfo.attach("performance-budget.json", {
    body: Buffer.from(JSON.stringify({ baseURL: process.env.PLAYWRIGHT_BASE_URL, budgets: BUDGET_MS, metrics }, null, 2)),
    contentType: "application/json",
  });
  console.info(`[performance-budget] ${JSON.stringify(metrics)}`);

  for (const [name, budget] of Object.entries(BUDGET_MS) as [keyof typeof BUDGET_MS, number][]) {
    expect(metrics[name], `${name}: ${metrics[name].toFixed(0)}ms > ${budget}ms`).toBeLessThanOrEqual(budget);
  }
});
