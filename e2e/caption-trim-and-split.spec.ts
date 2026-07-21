import { expect, test } from "@playwright/test";

/** A short spoken-ish tone clip is enough to reach imported Studio: the caption
 *  editor works off the confirmed Quran range, not the recognition quality. */
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

async function openCaptionEditor(page: import("@playwright/test").Page) {
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "caption-trim.wav",
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

  const timelineToggle = page.getByRole("button", { name: "Verse Editor" });
  if ((await timelineToggle.getAttribute("aria-expanded")) === "false") await timelineToggle.click();
  // The word-card ("Captions") view is the one carrying trim + split tools.
  await page.getByRole("button", { name: "Captions", exact: true }).click();
}

test("a partial recitation can be trimmed to the recited words without touching the audio", async ({ page }) => {
  await openCaptionEditor(page);

  const trimToggle = page.getByRole("button", { name: "Trim words" }).first();
  await expect(trimToggle).toBeVisible();
  await trimToggle.click();

  // "Keep 2nd half" is the common case: the reciter starts mid-ayah.
  await page.getByRole("button", { name: "Keep 2nd half" }).first().click();

  // The trim is now reflected back to the creator, and is undoable.
  await expect(page.getByText(/Showing words \d+–\d+ of \d+/).first()).toBeVisible();
  const restore = page.getByRole("button", { name: "Show full verse" }).first();
  await expect(restore).toBeVisible();

  await restore.click();
  await expect(page.getByText(/Showing words \d+–\d+ of \d+/)).toHaveCount(0);
});

test("auto split cuts a caption part in half", async ({ page }) => {
  await openCaptionEditor(page);

  const autoSplit = page.getByRole("button", { name: "Auto split" }).first();
  await expect(autoSplit).toBeVisible();

  // Each split adds a part, so the per-part "Auto split" controls multiply.
  const before = await page.getByRole("button", { name: "Auto split" }).count();
  await autoSplit.click();
  await expect(async () => {
    expect(await page.getByRole("button", { name: "Auto split" }).count()).toBeGreaterThan(before);
  }).toPass();
});

test("the verse editor dock can be dragged taller", async ({ page }) => {
  await openCaptionEditor(page);

  const dock = page.getByTestId("studio-timeline");
  const handle = page.getByRole("separator", { name: "Resize verse editor" });
  await expect(handle).toBeVisible();

  const before = (await dock.boundingBox())!.height;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 120, { steps: 10 });
  await page.mouse.up();

  await expect(async () => {
    expect((await dock.boundingBox())!.height).toBeGreaterThan(before + 40);
  }).toPass();
});
