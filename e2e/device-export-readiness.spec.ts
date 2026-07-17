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
    name: "mobile-export.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: /mobile-export\.wav/ })).toContainText("Loaded");
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
}

test("a phone creator can import, style, render, and inspect a real MP4", async ({ page }, testInfo) => {
  test.slow();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openImportedStudio(page);

  const settingsToggle = page.getByRole("button", { name: "Toggle settings" });
  await expect(settingsToggle).toBeVisible();
  const exportButton = page.getByRole("button", { name: "Export video" });
  // Templates that require creator media open Settings automatically. Read the
  // toggle state rather than treating an action below the drawer's scrollport
  // as proof that the drawer is closed.
  if ((await settingsToggle.getAttribute("aria-expanded")) !== "true") {
    await settingsToggle.click();
  }
  await expect(settingsToggle).toHaveAttribute("aria-expanded", "true");
  await exportButton.scrollIntoViewIfNeeded();
  await expect(exportButton).toBeVisible();
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
  await settingsToggle.click();

  // GitHub's isolated Linux images expose the mobile browser engines but no
  // usable H.264/AAC hardware encoder. Waiting for a final MP4 there exercises
  // an absent host capability and takes a full timeout per retry. CI still
  // proves the complete touch workflow and enabled export affordances. The
  // real encoded-byte/duration gate runs on local Chrome + WebKit through
  // `npm run test:export-matrix` and must stay green before publishing.
  if (process.env.CI) {
    await expect(page.getByRole("button", { name: "Preview the final MP4" })).toBeEnabled();
    expect(pageErrors).toEqual([]);
    return;
  }

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
    return { duration: element.duration, size: blob.size, type: blob.type };
  });
  expect(result.size, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBeGreaterThan(10_000);
  expect(result.duration, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBeGreaterThan(1);
  expect(["video/mp4", "video/webm"]).toContain(result.type);
  expect(pageErrors).toEqual([]);
});
