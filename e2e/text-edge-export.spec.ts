import { expect, test, type Page } from "@playwright/test";

type DrawCall = { text: string; direction: CanvasDirection; font: string };

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

async function captureCanvasText(page: Page) {
  await page.addInitScript(() => {
    const calls: DrawCall[] = [];
    Object.defineProperty(window, "__ayahClipDrawCalls", {
      configurable: false,
      value: calls,
    });
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      calls.push({ text: String(args[0]), direction: this.direction, font: this.font });
      return original.apply(this, args);
    };
  });
}

async function importClip(page: Page, surah: string, from: string, to: string) {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: `text-edge-${surah}-${from}.wav`,
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: new RegExp(`text-edge-${surah}-${from}\\.wav`) })).toContainText("Loaded");
  await page.getByRole("combobox", { name: "Surah" }).selectOption(surah);
  await page.getByRole("spinbutton", { name: "From" }).fill(from);
  await page.getByRole("spinbutton", { name: "To" }).fill(to);
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await page.getByRole("button", { name: "Choose a template" }).click();
  const template = page.locator("article").filter({
    has: page.getByRole("heading", { level: 2, name: "Reciter Split Fade" }),
  });
  await template.getByRole("button", { name: "Use template" }).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(page.getByText("Verse Editor", { exact: true })).toBeVisible();
}

async function renderExactMp4(page: Page) {
  await page.getByRole("button", { name: "Preview the final MP4" }).click();
  const dialog = page.getByRole("dialog", { name: "Final MP4 preview" });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  const video = dialog.locator("video");
  await expect.poll(
    () => video.evaluate((element: HTMLVideoElement) => element.readyState),
    { timeout: 20_000 },
  ).toBeGreaterThanOrEqual(1);
  return video.evaluate(async (element: HTMLVideoElement) => {
    const blob = await fetch(element.src).then((response) => response.blob());
    return {
      duration: element.duration,
      height: element.videoHeight,
      size: blob.size,
      type: blob.type,
      width: element.videoWidth,
    };
  });
}

async function drawCalls(page: Page): Promise<DrawCall[]> {
  return page.evaluate(() => (
    window as typeof window & { __ayahClipDrawCalls: DrawCall[] }
  ).__ayahClipDrawCalls);
}

test("Al-Baqarah 2:282 wraps and exports as a valid vertical MP4", async ({ page }) => {
  await captureCanvasText(page);
  await importClip(page, "2", "282", "282");
  const result = await renderExactMp4(page);

  expect(result.type).toBe("video/mp4");
  expect(result.size).toBeGreaterThan(10_000);
  expect(result.width / result.height).toBeCloseTo(9 / 16, 2);
  const calls = await drawCalls(page);
  const arabicLines = calls.filter((call) => /[\u0600-\u06ff]/.test(call.text));
  expect(arabicLines.length).toBeGreaterThan(5);
  expect(arabicLines.reduce((length, call) => length + call.text.length, 0)).toBeGreaterThan(500);
  expect(calls.some((call) => call.text.includes("undefined"))).toBe(false);
});

test("Urdu translation lines are painted right-to-left in preview and export", async ({ page }) => {
  await captureCanvasText(page);
  await importClip(page, "51", "1", "2");
  const settings = page.getByRole("button", { name: "Toggle settings", exact: true });
  if ((await settings.getAttribute("aria-expanded")) !== "true") await settings.click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const urduResponse = page.waitForResponse((response) => response.url().includes("translations=54"));
  await page.getByLabel("Language").selectOption("ur");
  await urduResponse;
  await renderExactMp4(page);

  const calls = await drawCalls(page);
  const rtlTranslation = calls.find((call) =>
    call.direction === "rtl" &&
    /[\u0600-\u06ff]/.test(call.text) &&
    !/UthmanicHafs|Amiri Quran|Scheherazade|Noto Naskh|QCF/.test(call.font)
  );
  expect(rtlTranslation).toBeDefined();
});

test("a missing translation falls back to Quran text without painting placeholders", async ({ page }) => {
  await captureCanvasText(page);
  await page.route("https://api.quran.com/api/v4/verses/by_chapter/51?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { verses?: { translations?: unknown[] }[] };
    for (const verse of body.verses ?? []) verse.translations = [];
    await route.fulfill({ response, json: body });
  });
  await importClip(page, "51", "1", "2");
  const result = await renderExactMp4(page);

  expect(result.type).toBe("video/mp4");
  expect(result.size).toBeGreaterThan(10_000);
  const calls = await drawCalls(page);
  expect(calls.some((call) => call.text.includes("undefined") || call.text.includes("null"))).toBe(false);
  expect(calls.some((call) => /[\u0600-\u06ff]/.test(call.text))).toBe(true);
});
