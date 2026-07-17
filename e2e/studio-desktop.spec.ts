import { expect, test, type Page } from "@playwright/test";

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

async function importIntoStudio(page: Page) {
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "studio-desktop.wav",
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
  await expect(page.getByText("Verse Editor", { exact: true })).toBeVisible();
}

test("desktop Studio keeps platform frames visible and supports repeated caption splits", async ({ page }, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await importIntoStudio(page);
  const settings = page.getByRole("button", { name: "Toggle settings" });
  if ((await settings.getAttribute("aria-expanded")) === "true") await settings.click();

  await expect(page.getByRole("button", { name: "100%", exact: true })).toBeVisible();
  for (const mode of ["Phone", "TikTok", "Reels"] as const) {
    await page.locator("header").getByRole("button", { name: mode, exact: true }).click();
    const canvas = await page.getByLabel("Clip preview").boundingBox();
    const editor = await page.getByText("Verse Editor", { exact: true }).boundingBox();
    expect(canvas).not.toBeNull();
    expect(editor).not.toBeNull();
    expect(canvas!.y).toBeGreaterThanOrEqual(0);
    expect(canvas!.y + canvas!.height).toBeLessThan(editor!.y);
  }

  await page.locator("header").getByRole("button", { name: "TikTok", exact: true }).click();
  await page.getByRole("button", { name: "Safe zones" }).click();
  await expect(page.getByText("Safe area", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fit text" }).click();

  await page.getByRole("button", { name: "Captions", exact: true }).click();
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByRole("button", { name: /Split before word 2/ }).click();
  await page.getByRole("button", { name: "Split here" }).click();
  await expect(page.getByText("2 parts", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByRole("button", { name: /Split before word 2/ }).click();
  await page.getByRole("button", { name: "Split here" }).click();
  await expect(page.getByText("3 parts", { exact: true })).toBeVisible();
  await expect(page.getByText("Merciful.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Expand" }).click();
  await expect(page.getByRole("dialog", { name: "Caption editor" })).toBeVisible();
  await expect(page.getByText("Caption Editor", { exact: true })).toBeVisible();
  await expect(page.getByText("3 parts", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Done/ }).click();

  await settings.click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const wordHighlight = page.getByRole("switch", { name: "Word-by-word highlight (on play)" });
  await wordHighlight.click();
  await expect(wordHighlight).toHaveAttribute("aria-checked", "true");
  const canvas = page.getByLabel("Clip preview");
  const beforePlayback = await canvas.screenshot();
  await page.getByRole("button", { name: "Play", exact: true }).first().click();
  await page.waitForTimeout(500);
  const duringPlayback = await canvas.screenshot();
  expect(duringPlayback.equals(beforePlayback)).toBe(false);
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();

  await settings.click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByText("3 segments", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();

  await testInfo.attach("studio-desktop-final", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  expect(errors).toEqual([]);
});
