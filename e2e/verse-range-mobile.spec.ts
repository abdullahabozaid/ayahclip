import { expect, test } from "@playwright/test";

test("a phone creator can add ayahs 1 through 5 as one passage", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/surah/1");
  await expect(page.getByRole("heading", { level: 1, name: "Al-Fatihah" })).toBeVisible();

  await page.getByRole("spinbutton", { name: "First ayah" }).fill("1");
  await page.getByRole("spinbutton", { name: "Last ayah" }).fill("5");
  await page.getByRole("button", { name: "Add passage" }).click();

  await expect(page.getByRole("status")).toHaveText("Ayahs 1–5 selected.");
  await expect(page.getByText("5 ayahs selected", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open studio" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
