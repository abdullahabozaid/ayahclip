import { expect, test } from "@playwright/test";

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

test("an opened local-media Studio can render its exact MP4 after the network disappears", async ({
  context,
  page,
}) => {
  test.slow();
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "offline-export.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: /offline-export\.wav/ })).toContainText("Loaded");
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

  await context.setOffline(true);
  try {
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
    expect(result.type).toBe("video/mp4");
    expect(result.size).toBeGreaterThan(10_000);
    expect(result.duration).toBeGreaterThan(0.8);
    expect(result.duration).toBeLessThan(1.3);
  } finally {
    await context.setOffline(false);
  }
});
