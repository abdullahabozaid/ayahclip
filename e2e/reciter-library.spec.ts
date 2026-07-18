import { expect, test } from "@playwright/test";

test("the direct Surah workflow exposes the broad reciter catalog and preserves the choice", async ({ page }) => {
  await page.goto("/surah/1");
  await expect(page.getByRole("heading", { level: 1, name: "Al-Fatihah" })).toBeVisible();

  const recitation = page.getByLabel("Recitation");
  await expect(recitation.locator("option")).toHaveCount(101);
  await recitation.selectOption("yasser-dossary");
  await expect(page.getByText("Whole-verse captions")).toBeVisible();

  await page.getByRole("button", { name: "1", exact: true }).first().click();
  await page.getByRole("link", { name: "Open studio" }).click();
  await page.getByRole("button", { name: "Toggle settings", exact: true }).click();
  await page.getByRole("button", { name: "Clip", exact: true }).click();

  const studioReciter = page.getByLabel("Reciter", { exact: true });
  await expect(studioReciter).toHaveValue("yasser-dossary");
  await studioReciter.selectOption("alafasy");
  await expect(page.getByText("Word-synced splitting")).toBeVisible();
});

test("creators can search, filter and save reciters without scanning the full catalog", async ({ page }) => {
  await page.goto("/surah/1");
  await expect(page.getByRole("heading", { level: 1, name: "Al-Fatihah" })).toBeVisible();

  const search = page.getByLabel("Search reciters");
  const recitation = page.getByLabel("Recitation");
  await search.fill("ياسر الدوسري");
  await expect(page.getByText("1 of 101 voices")).toBeVisible();
  await expect(recitation.locator('option[value="yasser-dossary"]')).toHaveCount(1);
  await recitation.selectOption("yasser-dossary");

  const favourite = page.getByRole("button", { name: "Add Yasser Al-Dosari to favourites" });
  await favourite.click();
  await expect(page.getByRole("button", { name: "Remove Yasser Al-Dosari from favourites" })).toHaveAttribute("aria-pressed", "true");

  await search.clear();
  await expect(recitation.locator('optgroup[label="Favourites"] option')).toHaveAttribute("value", "yasser-dossary");
  await recitation.selectOption("alafasy");
  await expect(recitation.locator('optgroup[label="Recently used"] option')).toHaveAttribute("value", "alafasy");

  await page.reload();
  await expect(recitation.locator('optgroup[label="Favourites"] option')).toHaveAttribute("value", "yasser-dossary");
  await expect(recitation.locator('optgroup[label="Recently used"] option')).toHaveAttribute("value", "alafasy");

  const timingFilter = page.getByRole("button", { name: "Word synced" });
  await timingFilter.click();
  await expect(timingFilter).toHaveAttribute("aria-pressed", "true");
  const visibleOptions = recitation.locator('option:not([value=""])');
  expect(await visibleOptions.count()).toBeGreaterThan(5);
  await expect(visibleOptions).toHaveText(Array(await visibleOptions.count()).fill(/Word synced/));
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
  await expect(input).toHaveAttribute(
    "accept",
    "image/*,video/mp4,video/webm,video/quicktime,.mov,.m4v",
  );
  await input.setInputFiles([
    { name: "waterfall.jpg", mimeType: "image/jpeg", buffer: Buffer.from("image") },
    { name: "night-drive.mp4", mimeType: "video/mp4", buffer: Buffer.from("video") },
    { name: "phone-reciter.MOV", mimeType: "video/quicktime", buffer: Buffer.from("video") },
  ]);

  await expect(page.getByRole("button", { name: "Use waterfall.jpg" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use night-drive.mp4" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use phone-reciter.MOV" })).toBeVisible();
  await page.getByRole("button", { name: "Use waterfall.jpg" }).click();
  await expect(page.getByText("In use")).toBeVisible();

  await page.getByRole("button", { name: "Remove night-drive.mp4 from library" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("button", { name: "Use night-drive.mp4" })).toHaveCount(0);
});
