import { expect, test, type Page, type Route } from "@playwright/test";

const fatihah = {
  id: 1,
  name_simple: "Al-Fatihah",
  name_arabic: "الفاتحة",
  verses_count: 7,
  revelation_place: "makkah",
  translated_name: { name: "The Opener", language_name: "english" },
};

const firstVerse = {
  id: 1,
  verse_number: 1,
  verse_key: "1:1",
  text_uthmani: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
  translations: [{ text: "In the name of Allah, the Most Compassionate, the Most Merciful." }],
  words: [],
};

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
}

async function stubSecondarySource(page: Page) {
  await page.route("https://api.alquran.cloud/v1/surah/1/quran-uthmani", (route) =>
    fulfillJson(route, { data: { ayahs: [] } }),
  );
}

test("the Quran browser explains an index failure and recovers without a reload", async ({ page }) => {
  let attempts = 0;
  await page.route("https://api.quran.com/api/v4/chapters?language=en", (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
      : fulfillJson(route, { chapters: [fatihah] });
  });

  await page.goto("/browse");
  const alert = page.getByRole("alert").filter({ hasText: "Connection interrupted" });
  await expect(alert.getByRole("heading", { name: "Couldn’t load the Quran index" })).toBeVisible();
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Al-Fatihah", { exact: true })).toBeVisible();
  await expect(alert).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("a Surah page explains a verse failure and retries the complete request", async ({ page }) => {
  let verseAttempts = 0;
  await page.route("https://api.quran.com/api/v4/chapters?language=en", (route) =>
    fulfillJson(route, { chapters: [fatihah] }),
  );
  await page.route("https://api.quran.com/api/v4/verses/by_chapter/1?*", (route) => {
    verseAttempts += 1;
    return verseAttempts === 1
      ? route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
      : fulfillJson(route, { verses: [firstVerse] });
  });
  await stubSecondarySource(page);

  await page.goto("/surah/1");
  const alert = page.getByRole("alert").filter({ hasText: "Connection interrupted" });
  await expect(alert.getByRole("heading", { name: "Couldn’t load this surah" })).toBeVisible();
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Al-Fatihah" })).toBeVisible();
  await expect(page.getByLabel("Recitation")).toBeVisible();
  await expect(alert).toHaveCount(0);
  expect(verseAttempts).toBe(2);
});

test("an invalid Surah route resolves locally instead of calling the Quran APIs", async ({ page }) => {
  let apiCalls = 0;
  await page.route("https://api.quran.com/api/v4/**", (route) => {
    apiCalls += 1;
    return route.abort();
  });

  await page.goto("/surah/999");
  await expect(page.getByText("Surah not found", { exact: true })).toBeVisible();
  expect(apiCalls).toBe(0);
});
