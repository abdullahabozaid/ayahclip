import { expect, test, type Page } from "@playwright/test";

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("the shared reciter source powers preview and final rendering", async ({ page }, testInfo) => {
  test.slow();
  const errors = collectPageErrors(page);

  await page.goto("/surah/1");
  await expect(page.getByRole("heading", { level: 1, name: "Al-Fatihah" })).toBeVisible();
  await page.getByRole("button", { name: "1", exact: true }).first().click();
  await page.getByRole("link", { name: "Open studio" }).click();
  await expect(page).toHaveURL(/\/studio/);

  const play = page.getByRole("button", { name: "Play", exact: true }).first();
  await play.click();
  const pause = page.getByRole("button", { name: "Pause", exact: true }).first();
  await expect(pause).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await pause.click();

  const render = page.getByRole("button", { name: "Preview the final MP4" });
  await expect(render).toBeEnabled();

  if (process.env.CI) {
    expect(errors).toEqual([]);
    return;
  }

  await render.click();
  const dialog = page.getByRole("dialog", { name: "Final MP4 preview" });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
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
  expect(result.size, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBeGreaterThan(10_000);
  expect(result.duration, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBeGreaterThan(1);
  expect(result.duration, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBeLessThan(20);
  expect(errors).toEqual([]);
});
