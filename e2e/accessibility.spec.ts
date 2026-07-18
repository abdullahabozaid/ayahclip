import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const criticalRoutes = [
  "/",
  "/browse",
  "/import",
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
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "accessibility.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await page.getByRole("button", { name: "Choose a template" }).click();
  const template = page.locator("article").filter({
    has: page.getByRole("heading", { level: 2, name: "Reciter Split Fade" }),
  });
  await template.getByRole("button", { name: "Use template" }).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(page.getByText("Verse Editor", { exact: true })).toBeVisible();
}

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
}
