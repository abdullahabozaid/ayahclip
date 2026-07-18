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

async function openTwoAyahTimeline(page: Page) {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "timeline-keyboard.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: /timeline-keyboard\.wav/ })).toContainText("Loaded");
  await page.getByRole("spinbutton", { name: "From" }).fill("1");
  await page.getByRole("spinbutton", { name: "To" }).fill("2");
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await page.getByRole("button", { name: "Choose a template" }).click();
  const template = page.locator("article").filter({
    has: page.getByRole("heading", { level: 2, name: "Reciter Split Fade" }),
  });
  await template.getByRole("button", { name: "Use template" }).click();
  await expect(page).toHaveURL(/\/studio/);
  const verseEditor = page.getByRole("button", { name: "Verse Editor" });
  if ((await verseEditor.getAttribute("aria-expanded")) === "false") await verseEditor.click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("button", { name: "Split at playhead" })).toBeEnabled();
}

test("timeline keyboard edits remain reversible and never delete the final ayah", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openTwoAyahTimeline(page);

  const undo = page.getByRole("button", { name: "Undo edit" });
  const redo = page.getByRole("button", { name: "Redo edit" });
  await expect(page.getByText("2 ayahs · 0 cuts", { exact: true })).toBeVisible();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause", exact: true }).first()).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play", exact: true }).first()).toBeVisible();

  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+S");
  await expect(page.getByText("2 ayahs · 1 cuts", { exact: true })).toBeVisible();
  await expect(page.getByText("2 segments", { exact: true })).toBeVisible();
  await expect(undo).toBeEnabled();

  await page.keyboard.press("Control+z");
  await expect(page.getByText("2 ayahs · 0 cuts", { exact: true })).toBeVisible();
  await expect(redo).toBeEnabled();

  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByText("2 ayahs · 1 cuts", { exact: true })).toBeVisible();

  await page.keyboard.press("Delete");
  await expect(page.getByText("1 ayah · 0 cuts", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();

  await page.keyboard.press("Delete");
  await expect(page.getByText("1 ayah · 0 cuts", { exact: true })).toBeVisible();

  await page.keyboard.press("Control+z");
  await expect(page.getByText("2 ayahs · 1 cuts", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByText("1 ayah · 0 cuts", { exact: true })).toBeVisible();
});
