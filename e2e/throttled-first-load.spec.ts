import { expect, test } from "@playwright/test";

test.skip(
  !process.env.PLAYWRIGHT_BASE_URL,
  "throttled first-load evidence runs only against an explicit deployment",
);

test("the deployed Import workflow becomes usable on a constrained mobile connection", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(browserName !== "chromium", "Chrome DevTools network emulation is Chromium-only");
  test.setTimeout(30_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 200 * 1024,
    uploadThroughput: 75 * 1024,
    connectionType: "cellular3g",
  });

  const started = performance.now();
  try {
    await page.goto("/import", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 2, name: "Source media" })).toBeVisible({
      timeout: 12_000,
    });
    const surah = page.getByRole("combobox", { name: "Surah" });
    await expect(surah).toBeEnabled({ timeout: 12_000 });
    await expect.poll(() => surah.locator("option").count(), { timeout: 12_000 }).toBeGreaterThan(100);
    await expect(page.getByText("Audio never leaves this browser.")).toBeVisible();
    const usableMilliseconds = performance.now() - started;
    console.info(`[throttled-first-load] ${usableMilliseconds.toFixed(0)}ms`);
    expect(usableMilliseconds).toBeLessThanOrEqual(12_000);
  } finally {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }
});
