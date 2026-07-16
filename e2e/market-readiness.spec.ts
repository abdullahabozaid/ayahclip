import { expect, test, type Page } from "@playwright/test";

function failOnPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return () => expect(errors, "page emitted browser errors").toEqual([]);
}

test("import clearly supports local audio and phone video formats", async ({ page }) => {
  const assertNoErrors = failOnPageErrors(page);
  await page.goto("/import");

  await expect(
    page.getByRole("heading", { level: 1, name: "Turn a recitation into a vertical clip" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose audio or video" })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveAttribute(
    "accept",
    "audio/*,video/*,.mov,.m4v",
  );
  await expect(page.getByText("processed locally", { exact: false })).toBeVisible();
  assertNoErrors();
});

test("templates render and open the focused editor", async ({ page }) => {
  const assertNoErrors = failOnPageErrors(page);
  await page.goto("/styles");

  await expect(
    page.getByRole("heading", { level: 1, name: "Start with a look that works" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "AyahClip Gold Line" })).toBeVisible();

  await page.getByTitle("Customize AyahClip Gold Line").click();
  await expect(page).toHaveURL(/\/styles\/editor\?template=ayahclip-gold-line/);
  await expect(page.getByLabel("Template name")).toHaveValue("AyahClip Gold Line");
  await expect(page.getByRole("button", { name: "Use template" })).toBeVisible();
  assertNoErrors();
});

test("canvas creator saves a reusable preset with ordered B-roll slots", async ({ page }) => {
  const assertNoErrors = failOnPageErrors(page);
  await page.goto("/styles/editor?template=new");

  await page.getByLabel("Template name").fill("My Canvas Preset");
  const canvasPosition = page.getByRole("slider", { name: "Text vertical position" });
  await expect(canvasPosition).toHaveAttribute("aria-valuenow", "50");
  await canvasPosition.press("ArrowDown");
  await expect(canvasPosition).toHaveAttribute("aria-valuenow", "52");

  await page.getByRole("button", { name: "Use Midnight emerald background" }).click();
  await expect(
    page.getByRole("button", { name: "Use Midnight emerald background" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByText("B-roll rotation", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "B-roll rotation" })).toBeChecked();
  await expect(page.getByText("B-roll 1", { exact: true })).toBeVisible();
  await expect(page.getByText("B-roll 2", { exact: true })).toBeVisible();
  await expect(page.getByText("B-roll 3", { exact: true })).toBeVisible();

  await page.locator("header").getByRole("button", { name: "Save" }).click();
  await expect(page.locator('[aria-live="polite"]')).toHaveText("Saved to My templates");

  await page.goto("/styles");
  await page.getByRole("button", { name: "My templates" }).click();
  await expect(page.getByRole("heading", { name: "My Canvas Preset" })).toBeVisible();
  assertNoErrors();
});

test("diagnostics resolves clipboard restrictions and stays private", async ({ page }) => {
  const assertNoErrors = failOnPageErrors(page);
  await page.goto("/diagnostics");

  await expect(
    page.getByRole("heading", { level: 1, name: "A useful report, without your content" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy diagnostics" }).click();

  const status = page.getByRole("status");
  await expect(status).toContainText(/Ready to paste|Automatic copy was blocked/, {
    timeout: 4_000,
  });
  if (await page.getByLabel("Diagnostics report").isVisible()) {
    const report = await page.getByLabel("Diagnostics report").inputValue();
    expect(report).toContain('"app": "AyahClip"');
    expect(report).not.toContain("fileName");
    expect(report).not.toContain("mediaUrl");
    expect(report).not.toContain("arabicText");
    expect(report).not.toContain("translation");
  }
  assertNoErrors();
});

test("critical public routes do not overflow a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/import", "/styles", "/diagnostics"]) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth, `${route} has horizontal overflow`).toBeLessThanOrEqual(
      dimensions.clientWidth,
    );
  }
});
