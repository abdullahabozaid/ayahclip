import { expect, test } from "@playwright/test";

const validRequest = {
  platform: "instagram",
  tone: "reflective",
  surah: { number: 1, name: "Al-Fatihah", arabicName: "الفاتحة" },
  verseNumbers: [1, 2],
  excerpt: {
    verseNumber: 1,
    translation: "In the Name of Allah—the Most Compassionate, Most Merciful.",
  },
  reciterName: "Mishary Rashid Alafasy",
};

test("the social caption endpoint preserves Quran references and rejects cross-site requests", async ({ request }) => {
  const response = await request.post("/api/social-caption", { data: validRequest });
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.options).toHaveLength(3);
  for (const option of payload.options) {
    expect(option.text).toContain(validRequest.excerpt.translation);
    expect(option.text).toContain("Surah Al-Fatihah 1:1–2");
  }

  const forbidden = await request.post("/api/social-caption", {
    data: validRequest,
    headers: { "sec-fetch-site": "cross-site" },
  });
  expect(forbidden.status()).toBe(403);
});

test("creators can generate and copy restrained post captions from Studio", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/surah/1");
  await expect(page.getByRole("heading", { level: 1, name: "Al-Fatihah" })).toBeVisible();
  await page.getByRole("button", { name: "1", exact: true }).first().click();
  await page.getByRole("link", { name: "Open studio" }).click();

  await page.getByRole("button", { name: "Toggle settings", exact: true }).click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const publishingToggle = page.getByRole("button", { name: "Publishing", exact: true });
  if ((await publishingToggle.getAttribute("aria-expanded")) === "false") await publishingToggle.click();
  const publishing = page.locator("#studio-publishing-section");
  await publishing.getByRole("button", { name: "Reels", exact: true }).click();
  await publishing.getByRole("button", { name: /Reflective/ }).click();
  await publishing.getByRole("button", { name: "Create three captions" }).click();

  await expect(publishing.getByText("Editorial", { exact: true })).toBeVisible();
  const options = publishing.locator("article");
  await expect(options).toHaveCount(3);
  await expect(options.first()).toContainText("Surah Al-Fatihah 1:1");
  await options.first().getByRole("button", { name: "Copy", exact: true }).click();
  await expect(options.first().getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Surah Al-Fatihah 1:1");
});
