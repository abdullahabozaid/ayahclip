import { expect, test } from "@playwright/test";

function toneWav(durationSeconds = 6, sampleRate = 16_000): Buffer {
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
    const envelope = i < sampleRate * 0.1 || i > sampleCount - sampleRate * 0.1 ? 0 : 1;
    const sample = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.18 * 32767 * envelope);
    wav.writeInt16LE(sample, 44 + i * 2);
  }
  return wav;
}

async function openImportedStudio(page: import("@playwright/test").Page) {
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "phone-timeline.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await page.getByRole("button", { name: "Choose a template" }).click();
  const template = page.locator("article").filter({
    has: page.getByRole("heading", { level: 2, name: "Reciter Split Fade" }),
  });
  await template.getByRole("button", { name: "Use template" }).click();
  await expect(page).toHaveURL(/\/studio/);
}

async function openImportedTimeline(page: import("@playwright/test").Page) {
  await openImportedStudio(page);
  const timelineToggle = page.getByRole("button", { name: "Verse Editor" });
  if ((await timelineToggle.getAttribute("aria-expanded")) === "false") await timelineToggle.click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
}

test("the phone settings drawer has a reliable visible close control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openImportedStudio(page);

  const settingsToggle = page.getByRole("button", { name: "Toggle settings", exact: true });
  const settings = page.getByRole("complementary");
  if ((await settingsToggle.getAttribute("aria-expanded")) === "false") {
    await settingsToggle.click();
  }
  await expect(settingsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(settings).toBeVisible();

  const close = settings.getByRole("button", { name: "Close settings", exact: true });
  await expect(close).toBeVisible();
  await close.click();

  await expect(settingsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(settings).not.toBeVisible();
});

test("the imported timeline remains usable on a phone-sized viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openImportedTimeline(page);

  const waveform = page.getByRole("region", {
    name: "Timeline waveform. Drag to scrub, pinch to zoom.",
  });
  await expect(waveform).toBeVisible();
  await expect(page.getByRole("button", { name: "Split at playhead" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Precision" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole("button", { name: "Expand" }).click();
  await expect(page.getByRole("dialog", { name: "Verse timeline editor" })).toBeVisible();
  await expect(page.getByText("Timeline shortcuts", { exact: true })).not.toBeVisible();
  await expect(waveform).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await testInfo.attach("phone-timeline", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});
