import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function openPersonalMedia(page: Page) {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
  await page.goto("/surah/1");
  await expect(page.getByRole("heading", { level: 1, name: "Al-Fatihah" })).toBeVisible();
  await page.getByRole("button", { name: "1", exact: true }).first().click();
  await page.getByRole("link", { name: "Open studio" }).click();
  await page.getByRole("button", { name: "Toggle settings", exact: true }).click();
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await page.getByRole("button", { name: "My media", exact: true }).click();
  await expect(page.getByText("Build your B-roll shelf")).toBeVisible();
}

test("concurrent account-free creators keep personal B-roll isolated by browser", async ({ browser }) => {
  const creatorNames = ["waterfall-a.jpg", "clouds-b.jpg", "night-drive-c.jpg"];
  const contexts: BrowserContext[] = await Promise.all(
    creatorNames.map(() => browser.newContext()),
  );

  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(pages.map(openPersonalMedia));
    await Promise.all(pages.map(async (page, index) => {
      await page.locator('input[type="file"][multiple]').setInputFiles({
        name: creatorNames[index],
        mimeType: "image/jpeg",
        buffer: Buffer.from(`private-creator-fixture-${index}`),
      });
      await expect(page.getByRole("button", { name: `Use ${creatorNames[index]}` })).toBeVisible();
    }));

    for (const [index, page] of pages.entries()) {
      await expect(page.getByRole("button", { name: `Use ${creatorNames[index]}` })).toHaveCount(1);
      for (const [otherIndex, otherName] of creatorNames.entries()) {
        if (otherIndex !== index) {
          await expect(page.getByRole("button", { name: `Use ${otherName}` })).toHaveCount(0);
        }
      }
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
