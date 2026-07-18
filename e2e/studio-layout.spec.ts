import { expect, test, type Page } from "@playwright/test";

function toneWav(durationSeconds = 1.4, sampleRate = 16_000): Buffer {
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
    wav.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.18 * 32767 * envelope),
      44 + i * 2,
    );
  }
  return wav;
}

async function openImportedStudio(page: Page) {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "studio-layout.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: /studio-layout\.wav/ })).toContainText("Loaded");
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
  await expect(page.getByTestId("studio-canvas-frame")).toBeVisible();
}

async function layoutMetrics(page: Page) {
  return page.evaluate(() => {
    const rect = (testId: string) => {
      const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (!element) throw new Error(`Missing ${testId}`);
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, top: bounds.top, bottom: bounds.bottom };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
      canvas: rect("studio-canvas-frame"),
      timeline: rect("studio-timeline"),
      inspector: rect("studio-inspector"),
      stage: rect("studio-stage"),
    };
  });
}

test("desktop Studio keeps the true 9:16 canvas, inspector, and timeline inside 1440x900", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openImportedStudio(page);
  const metrics = await layoutMetrics(page);
  expect(metrics.document).toEqual(metrics.viewport);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(metrics.inspector.width).toBeCloseTo(304, 0);
  expect(metrics.timeline.height).toBeCloseTo(188, 0);
  expect(metrics.canvas.width).toBeGreaterThanOrEqual(288);
  expect(metrics.canvas.width).toBeLessThanOrEqual(294);
  expect(metrics.canvas.height).toBeGreaterThanOrEqual(512);
  expect(metrics.canvas.height).toBeLessThanOrEqual(522);
  expect(metrics.canvas.top).toBeGreaterThanOrEqual(metrics.stage.top);
  expect(metrics.canvas.bottom).toBeLessThanOrEqual(metrics.stage.bottom);
});

test("short-laptop Studio shrinks the canvas without clipping the 164px timeline", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openImportedStudio(page);
  const metrics = await layoutMetrics(page);
  expect(metrics.document).toEqual(metrics.viewport);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(metrics.inspector.width).toBeCloseTo(304, 0);
  expect(metrics.timeline.height).toBeCloseTo(164, 0);
  expect(metrics.canvas.width).toBeGreaterThanOrEqual(215);
  expect(metrics.canvas.width).toBeLessThanOrEqual(232);
  expect(metrics.canvas.height).toBeGreaterThanOrEqual(382);
  expect(metrics.canvas.height).toBeLessThanOrEqual(412);
  expect(metrics.canvas.bottom).toBeLessThanOrEqual(metrics.stage.bottom);
});

test("mobile Studio is preview-first with five thumb tools and no document overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openImportedStudio(page);
  const format = page.getByRole("button", { name: "Toggle settings" });
  if ((await format.getAttribute("aria-expanded")) === "true") await format.click();
  await page.getByRole("button", { name: "Captions", exact: true }).click();
  const tools = page.getByTestId("studio-mobile-tools");
  await expect(tools.getByRole("button")).toHaveCount(5);
  for (const label of ["Media", "Audio", "Text", "Captions", "Toggle settings"]) {
    await expect(tools.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  const metrics = await layoutMetrics(page);
  expect(metrics.document).toEqual(metrics.viewport);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(metrics.timeline.height).toBeLessThanOrEqual(232);
  expect(metrics.timeline.height).toBeGreaterThanOrEqual(200);
  expect(metrics.canvas.width).toBeGreaterThanOrEqual(190);
  expect(metrics.canvas.width).toBeLessThanOrEqual(225);
  expect(metrics.canvas.height).toBeGreaterThanOrEqual(338);
  expect(metrics.canvas.bottom).toBeLessThanOrEqual(metrics.stage.bottom);
});
