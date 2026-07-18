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

test("a corrupt source is rejected and can be replaced without reloading", async ({ page }) => {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
  await page.goto("/import");
  const input = page.locator('input[type="file"]');

  await input.setInputFiles({
    name: "damaged-recitation.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("this is not a wav container"),
  });
  await expect(page.getByText("Couldn't read the audio from this file.")).toContainText(
    "Try an MP3/M4A/WAV, or a different video.",
  );
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Choose a template" })).toBeDisabled();

  await input.setInputFiles({
    name: "replacement-recitation.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: /replacement-recitation\.wav/ })).toContainText("Loaded");
  await expect(page.getByText("Couldn't read the audio from this file.")).toHaveCount(0);
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
});

test("a non-media file cannot masquerade as an editable source", async ({ page }) => {
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not creator media"),
  });

  await expect(page.getByText("Couldn't read the audio from this file.")).toBeVisible();
  await expect(page.getByText("Loaded", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recognise verses" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Choose a template" })).toBeDisabled();
});
