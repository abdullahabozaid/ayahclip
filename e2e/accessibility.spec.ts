import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const criticalRoutes = [
  "/",
  "/browse",
  "/import",
  "/bulk",
  "/styles",
  "/library",
  "/support",
  "/privacy",
  "/terms",
  "/diagnostics",
  "/surah/1",
  "/styles/editor?template=new",
] as const;

const profiles = [
  { name: "desktop", viewport: { width: 1280, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 } },
] as const;

test("the app shell lets keyboard users bypass repeated navigation", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

async function expectNoWcagViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const summary = violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target.join(" "),
      html: node.html,
      failure: node.failureSummary,
    })),
  }));

  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

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
  return wav;
}

async function openImportedStudio(page: Page) {
  await page.route("https://api.quran.com/api/v4/chapters?language=en", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        chapters: [{
          id: 1,
          name_simple: "Al-Fatihah",
          name_arabic: "الفاتحة",
          verses_count: 7,
          revelation_place: "makkah",
          translated_name: { name: "The Opener", language_name: "english" },
        }],
      }),
    }),
  );
  await page.route("https://api.quran.com/api/v4/verses/by_chapter/1?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        verses: [{
          id: 1,
          verse_number: 1,
          verse_key: "1:1",
          text_uthmani: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
          translations: [{ text: "In the name of Allah, the Most Compassionate, the Most Merciful." }],
          words: [],
        }],
      }),
    }),
  );
  await page.route("https://api.alquran.cloud/v1/surah/1/quran-uthmani", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: { ayahs: [] } }),
    }),
  );
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "accessibility.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await page.getByRole("button", { name: "Choose a template" }).click();
  await expect(page).toHaveURL(/\/styles\?from=import/);
  const template = page.locator("article").filter({
    has: page.getByRole("heading", { level: 2, name: "Reciter Split Fade" }),
  });
  await template.getByRole("button", { name: "Use template" }).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(page.getByText("Verse Editor", { exact: true })).toBeVisible();
}

test("the expanded timeline contains and restores keyboard focus", async ({ page }) => {
  await page.setViewportSize(profiles[0].viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
  await openImportedStudio(page);

  const verseEditor = page.getByRole("button", { name: "Verse Editor" });
  if ((await verseEditor.getAttribute("aria-expanded")) === "false") await verseEditor.click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  const expand = page.getByRole("button", { name: "Expand editor", exact: true });
  await expand.click();

  const dialog = page.getByRole("dialog", { name: "Verse timeline editor" });
  const done = dialog.getByRole("button", { name: /Done/ });
  await expect(done).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => page.evaluate(() =>
    document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
  )).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();
});

for (const profile of profiles) {
  for (const route of criticalRoutes) {
    test(`${profile.name} ${route} has no automatically detectable WCAG A or AA violations`, async ({ page }) => {
      await page.setViewportSize(profile.viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route);
      await page.locator("main").waitFor();
      await expectNoWcagViolations(page);
    });
  }

  test(`${profile.name} active Studio has no automatically detectable WCAG A or AA violations`, async ({ page }) => {
    test.slow();
    await page.setViewportSize(profile.viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
    await openImportedStudio(page);
    await expectNoWcagViolations(page);
  });

  test(`${profile.name} expanded timeline has no automatically detectable WCAG A or AA violations`, async ({ page }) => {
    test.slow();
    await page.setViewportSize(profile.viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204, body: "" }));
    await openImportedStudio(page);

    const verseEditor = page.getByRole("button", { name: "Verse Editor" });
    if ((await verseEditor.getAttribute("aria-expanded")) === "false") await verseEditor.click();
    await page.getByRole("button", { name: "Timeline", exact: true }).click();
    await page.getByRole("button", { name: "Expand editor", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Verse timeline editor" })).toBeVisible();
    await expectNoWcagViolations(page);
  });
}
