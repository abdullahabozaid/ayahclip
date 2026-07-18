import { expect, test } from "@playwright/test";
import { VIDEO_PRESETS } from "@/lib/video-presets";

const REVIEWED_ADDITIONS = [
  "forest-waterfall",
  "night-drive",
  "mountain-clouds",
  "mountain-forest-trail",
  "starry-night",
] as const;

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
    const sample = Math.round(
      Math.sin((2 * Math.PI * 220 * index) / sampleRate) * 0.18 * 32_767,
    );
    wav.writeInt16LE(sample, 44 + index * 2);
  }
  return wav;
}

test("newly curated people-free videos preview and render into exact MP4", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  test.slow();
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));

  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "curated-video-presets.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: /curated-video-presets\.wav/ }))
    .toContainText("Loaded");
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

  const backgroundSection = page.getByRole("button", { name: "Background", exact: true });
  if ((await backgroundSection.getAttribute("aria-expanded")) !== "true") {
    await backgroundSection.click();
  }
  await page.getByRole("button", { name: "Video", exact: true }).click();

  for (const id of REVIEWED_ADDITIONS) {
    const preset = VIDEO_PRESETS.find((item) => item.id === id);
    expect(preset, id).toBeDefined();
    if (!preset) continue;

    await page.getByRole("button", { name: new RegExp(preset.name) }).click();
    await expect.poll(async () => {
      const response = await page.request.get(preset.videoUrl, {
        headers: { Range: "bytes=0-1023" },
      });
      return {
        cors: response.headers()["access-control-allow-origin"],
        status: response.status(),
        type: response.headers()["content-type"],
      };
    }, { timeout: 20_000 }).toEqual({ cors: "*", status: 206, type: "video/mp4" });

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
    expect(rendered.type, id).toBe("video/mp4");
    expect(rendered.size, id).toBeGreaterThan(10_000);
    expect(rendered.duration, id).toBeGreaterThan(0.8);
    await preview.getByRole("button", { name: /Close/ }).click();
  }
});
