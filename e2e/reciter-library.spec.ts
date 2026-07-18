import { expect, test } from "@playwright/test";

test("the direct Surah workflow exposes the broad reciter catalog and preserves the choice", async ({ page }) => {
  await page.goto("/surah/1");
  await expect(page.getByRole("heading", { level: 1, name: "Al-Fatihah" })).toBeVisible();

  const recitation = page.getByLabel("Recitation");
  await expect(recitation.locator("option")).toHaveCount(46);
  await recitation.selectOption("yasser-dossary");
  await expect(page.getByText("Whole-verse captions")).toBeVisible();

  await page.getByRole("button", { name: "1", exact: true }).first().click();
  await page.getByRole("link", { name: "Open studio" }).click();

  const studioReciter = page.getByLabel("Reciter");
  await expect(studioReciter).toHaveValue("yasser-dossary");
  await studioReciter.selectOption("alafasy");
  await expect(page.getByText("Word-synced splitting")).toBeVisible();
});

test("creators can build and reuse a personal B-roll shelf without native dialogs", async ({ page }) => {
  await page.goto("/surah/1");
  await expect(page.getByRole("heading", { level: 1, name: "Al-Fatihah" })).toBeVisible();
  await page.getByRole("button", { name: "1", exact: true }).first().click();
  await page.getByRole("link", { name: "Open studio" }).click();

  await page.getByRole("button", { name: "Toggle settings", exact: true }).click();
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await page.getByRole("button", { name: "My media", exact: true }).click();
  await expect(page.getByText("Build your B-roll shelf")).toBeVisible();

  const input = page.locator('input[type="file"][multiple]');
  await input.setInputFiles([
    { name: "waterfall.jpg", mimeType: "image/jpeg", buffer: Buffer.from("image") },
    { name: "night-drive.mp4", mimeType: "video/mp4", buffer: Buffer.from("video") },
  ]);

  await expect(page.getByRole("button", { name: "Use waterfall.jpg" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use night-drive.mp4" })).toBeVisible();
  await page.getByRole("button", { name: "Use waterfall.jpg" }).click();
  await expect(page.getByText("In use")).toBeVisible();

  await page.getByRole("button", { name: "Remove night-drive.mp4 from library" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("button", { name: "Use night-drive.mp4" })).toHaveCount(0);
});
