import { expect, test } from "@playwright/test";

test("a long Surah starts with a passage range instead of an unbounded ayah wall", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/surah/2");
  await expect(page.getByRole("heading", { level: 1, name: "Al-Baqarah" })).toBeVisible();

  const addPassage = page.getByRole("button", { name: "Add passage" });
  await expect(addPassage).toBeDisabled();
  await page.getByLabel("First ayah").fill("2");
  await page.getByLabel("Last ayah").fill("4");
  await addPassage.click();
  await expect(page.getByText("3 ayahs selected", { exact: false })).toBeVisible();

  const individualAyahs = page.getByRole("region", { name: "Individual ayahs" });
  await expect(individualAyahs).not.toBeVisible();

  // The compact preview follows the selected range, so a 2–4 passage starts
  // with Ayah 2 rather than retaining the page's initial Ayah 1 placeholder.
  const preview = page.getByText("Ayah 2", { exact: true }).first();
  const individualToggle = page.getByText("Pick individual ayahs", { exact: false });
  const previewBox = await preview.boundingBox();
  const toggleBox = await individualToggle.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(toggleBox).not.toBeNull();
  expect(previewBox!.y).toBeLessThan(toggleBox!.y);

  await individualToggle.click();
  await expect(individualAyahs).toBeVisible();
  const gridBox = await individualAyahs.boundingBox();
  expect(gridBox).not.toBeNull();
  expect(gridBox!.height).toBeLessThanOrEqual(450);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
