import { expect, test, type Page } from "@playwright/test";

const RECITERS = [
  { id: "abdullah-buaijan", name: "Abdullah Al-Buaijan", duration: 6.5 },
  { id: "idrees-abkr", name: "Idrees Abkr", duration: 4.8 },
  { id: "khalid-jileel", name: "Khalid Al-Jileel", duration: 4.54 },
  { id: "bandar-balilah", name: "Bandar Balilah", duration: 6.88 },
  { id: "raad-kurdi", name: "Raad Al-Kurdi", duration: 1.64 },
  { id: "ahmad-nufais", name: "Ahmad Al-Nufais", duration: 8.36 },
  { id: "peshawa-qadr-kurdi", name: "Peshawa Qadr Al-Kurdi", duration: 5.62 },
  { id: "abdulaziz-turki", name: "Abdulaziz Al-Turki", duration: 5.76 },
  { id: "anas-emadi", name: "Anas Al-Emadi", duration: 5.22 },
] as const;

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

for (const reciter of RECITERS) {
  test(`${reciter.name} previews and exports the official 114:6 cue`, async ({ page }, testInfo) => {
    test.slow();
    const errors = collectPageErrors(page);

    await page.goto("/surah/114");
    await page.getByLabel("Recitation").selectOption(reciter.id);
    await page.getByRole("button", { name: "6", exact: true }).first().click();
    await page.getByRole("link", { name: "Open studio" }).click();

    const play = page.getByRole("button", { name: "Play", exact: true }).first();
    await play.click();
    const pause = page.getByRole("button", { name: "Pause", exact: true }).first();
    await expect(pause).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(250);
    await pause.click();

    if (process.env.CI) {
      expect(errors).toEqual([]);
      return;
    }

    await page.getByRole("button", { name: "Preview the final MP4" }).click();
    const dialog = page.getByRole("dialog", { name: "Final MP4 preview" });
    await expect(dialog).toBeVisible({ timeout: 90_000 });
    const video = dialog.locator("video");
    await expect.poll(
      () => video.evaluate((element: HTMLVideoElement) => element.readyState),
      { timeout: 20_000 }
    ).toBeGreaterThanOrEqual(1);
    const result = await video.evaluate(async (element: HTMLVideoElement) => {
      const blob = await fetch(element.src).then((response) => response.blob());
      return { duration: element.duration, size: blob.size, type: blob.type };
    });

    expect(result.type, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBe("video/mp4");
    expect(result.size, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBeGreaterThan(5_000);
    expect(result.duration, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBeGreaterThan(
      reciter.duration - 0.35
    );
    expect(result.duration, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBeLessThan(
      reciter.duration + 0.35
    );
    expect(errors).toEqual([]);
  });
}
