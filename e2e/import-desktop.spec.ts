import { expect, test } from "@playwright/test";
import { basename } from "node:path";

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
  for (let i = 0; i < sampleCount; i++) {
    const envelope = i < sampleRate * 0.1 || i > sampleCount - sampleRate * 0.1 ? 0 : 1;
    const sample = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.18 * 32767 * envelope);
    wav.writeInt16LE(sample, 44 + i * 2);
  }
  return wav;
}

test("desktop import stays within the viewport at every supported desktop width", async ({ page }) => {
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/import");

    const geometry = await page.evaluate(() => {
      const source = document.querySelector<HTMLElement>("#source-heading")?.closest("section");
      const passage = document.querySelector<HTMLElement>("#passage-heading")?.closest("section");
      const sourceRect = source?.getBoundingClientRect();
      const passageRect = passage?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        sourceLeft: sourceRect?.left ?? -1,
        sourceRight: sourceRect?.right ?? -1,
        passageLeft: passageRect?.left ?? -1,
        passageRight: passageRect?.right ?? -1,
        topDelta: Math.abs((sourceRect?.top ?? 0) - (passageRect?.top ?? 0)),
      };
    });

    expect(geometry.overflow, `${width}px desktop viewport overflow`).toBeLessThanOrEqual(0);
    expect(geometry.sourceLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.sourceRight).toBeLessThanOrEqual(width);
    expect(geometry.passageLeft).toBeGreaterThan(geometry.sourceRight);
    expect(geometry.passageRight).toBeLessThanOrEqual(width);
    expect(geometry.topDelta).toBeLessThanOrEqual(2);
  }
});

test("loaded desktop import presents one ordered verification journey", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "desktop-verification.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });

  await expect(page.getByRole("button", { name: /desktop-verification\.wav/ })).toContainText("Loaded");
  await expect(page.getByRole("button", { name: "Recognise verses" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Choose a template" })).toBeDisabled();

  const order = await page.evaluate(() => {
    const top = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().top ?? -1;
    const confirm = document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.closest("label");
    const cta = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Choose a template"));
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      correction: top('select[aria-label="Surah"], select'),
      confirm: confirm?.getBoundingClientRect().top ?? -1,
      cta: cta?.getBoundingClientRect().top ?? -1,
    };
  });

  expect(order.overflow).toBeLessThanOrEqual(0);
  expect(order.correction).toBeGreaterThan(0);
  expect(order.confirm).toBeGreaterThan(order.correction);
  expect(order.cta).toBeGreaterThan(order.confirm);

  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await expect(page.getByText("Ready. Individual boundaries remain fully adjustable in the timeline.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a template" })).toBeEnabled();
});

test("a preparation failure is recoverable and does not strand the creator", async ({ page }) => {
  await page.route("**/api/v4/verses/by_chapter/**", async (route) => route.abort("failed"));
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "retryable.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: /retryable\.wav/ })).toContainText("Loaded");
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await page.getByRole("button", { name: "Choose a template" }).click();

  await expect(page.getByText("Couldn't prepare this clip.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a template" })).toBeEnabled();
  await expect(page.getByRole("checkbox", { name: /I confirm this Quran range/ })).toBeChecked();
});

test("a real recitation can be recognised, reviewed, and previewed by ayah", async ({ page }) => {
  const audioPath = process.env.RECOGNITION_SMOKE_AUDIO;
  test.skip(!audioPath, "Set RECOGNITION_SMOKE_AUDIO to run the real local-model recognition check.");
  test.setTimeout(5 * 60_000);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles(audioPath!);
  await expect(page.getByRole("button", { name: new RegExp(basename(audioPath!)) })).toContainText("Loaded");
  await page.getByRole("button", { name: "Recognise verses" }).click();

  const suggestedRange = page.getByText("Suggested Quran range", { exact: true });
  const candidateRanges = page.getByText("Possible Quran ranges", { exact: true });
  await expect(suggestedRange.or(candidateRanges)).toBeVisible({ timeout: 4 * 60_000 });
  if (await candidateRanges.isVisible()) {
    const alFatihahCandidate = page.getByRole("button").filter({ hasText: "Al-Fatihah · 1" });
    await expect(alFatihahCandidate).toHaveCount(1);
    await alFatihahCandidate.click();
  }
  await expect(suggestedRange).toBeVisible();
  await expect(page.getByText("Listen and verify", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play suggested passage" })).toBeEnabled();
  const ayahPlayButtons = page.getByRole("button", { name: /Play ayah/ });
  expect(await ayahPlayButtons.count()).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Play suggested passage" }).click();
  await expect(page.getByRole("button", { name: "Pause suggested passage" })).toBeVisible();
  await page.getByRole("button", { name: "Pause suggested passage" }).click();
  await expect(page.getByRole("button", { name: "Play suggested passage" })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
