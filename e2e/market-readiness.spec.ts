import { expect, test, type Page } from "@playwright/test";

function failOnPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return () => expect(errors, "page emitted browser errors").toEqual([]);
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
  for (let i = 0; i < sampleCount; i++) {
    const envelope = i < sampleRate * 0.1 || i > sampleCount - sampleRate * 0.1 ? 0 : 1;
    const sample = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.18 * 32767 * envelope);
    wav.writeInt16LE(sample, 44 + i * 2);
  }
  return wav;
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

test("a real local audio file survives import, template choice, save, and reopen", async ({ page }) => {
  test.slow();
  const assertNoErrors = failOnPageErrors(page);
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "market-readiness.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await expect(page.getByRole("button", { name: /market-readiness\.wav/ })).toContainText("Loaded");
  await expect(page.getByRole("button", { name: "Auto-detect verses" })).toBeEnabled();

  await page.getByRole("combobox", { name: "Surah" }).selectOption("51");
  await page.getByRole("spinbutton", { name: "From" }).fill("1");
  await page.getByRole("spinbutton", { name: "To" }).fill("2");
  await page.getByRole("button", { name: "Choose a template" }).click();

  await expect(page).toHaveURL(/\/styles\?from=import/);
  await expect(page.getByText("Your recitation audio is ready")).toBeVisible();
  const templateCard = page.locator("article").filter({
    has: page.getByRole("heading", { level: 2, name: "AyahClip Gold Line" }),
  });
  await templateCard.getByRole("button", { name: "Use template" }).click();

  await expect(page).toHaveURL(/\/studio/);
  await expect(page.getByText("Verse Editor", { exact: true })).toBeVisible();
  // The 100 ms silence at each edge is trimmed by autoSegment, so Studio must
  // report the one-second exported speech span rather than a per-verse guess.
  await expect(page.getByText("1s", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show" }).click();
  await page.getByRole("button", { name: "Timeline" }).click();
  await expect(page.getByText("Loop verse", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Your clips" })).toBeVisible();
  await page.getByRole("heading", { level: 3, name: "Adh-Dhariyat 1-2" }).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(page.getByText("Verse Editor", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Preview the final MP4" }).click();
  await expect(page.getByText("Final MP4", { exact: false })).toBeVisible({ timeout: 60_000 });
  const finalVideo = page.locator("video");
  await expect(finalVideo).toBeVisible();
  await expect.poll(
    () => finalVideo.evaluate((video: HTMLVideoElement) => video.readyState),
    { timeout: 20_000 },
  ).toBeGreaterThanOrEqual(1);
  const rendered = await finalVideo.evaluate(async (video: HTMLVideoElement) => {
    const blob = await fetch(video.src).then((response) => response.blob());
    return {
      duration: video.duration,
      size: blob.size,
      type: blob.type,
    };
  });
  expect(rendered.type).toBe("video/mp4");
  expect(rendered.size).toBeGreaterThan(10_000);
  expect(rendered.duration).toBeGreaterThan(0.8);
  expect(rendered.duration).toBeLessThan(1.3);
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
  const arabicInspector = page.getByTestId("inspector-arabic");
  await expect(arabicInspector).not.toHaveAttribute("open", "");
  await arabicInspector.locator("summary").click();
  await arabicInspector.getByRole("button", { name: /Scheherazade New/ }).click();
  await expect(arabicInspector.getByRole("button", { name: "SemiBold", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const dimensions = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.documentHeight).toBe(dimensions.viewportHeight);
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

  const backgroundInspector = page.getByTestId("inspector-background");
  await backgroundInspector.locator("summary").click();
  await page.getByRole("button", { name: "Use Midnight emerald background" }).click();
  await expect(
    page.getByRole("button", { name: "Use Midnight emerald background" }),
  ).toHaveAttribute("aria-pressed", "true");

  const mediaInspector = page.getByTestId("inspector-media");
  await mediaInspector.locator("summary").click();
  await mediaInspector.getByText("B-roll rotation", { exact: true }).click();
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

test("split compositions expose precise media, panel, solid, and gradient controls", async ({ page }) => {
  const assertNoErrors = failOnPageErrors(page);
  await page.goto("/styles/editor?template=reciter-split-fade");

  await expect(page.getByRole("button", { name: "Split fade", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("Solid width").fill("48");
  await page.getByLabel("Fade width").fill("24");
  await page.getByLabel("Panel opacity").fill("92");
  await expect(page.getByLabel("Solid width")).toHaveValue("48");
  await expect(page.getByLabel("Fade width")).toHaveValue("24");
  await expect(page.getByLabel("Panel opacity")).toHaveValue("92");

  await page.getByRole("button", { name: "media", exact: true }).click();
  const directMediaPosition = page.getByRole("slider", { name: "Media position" });
  await directMediaPosition.press("ArrowRight");
  await expect(directMediaPosition).toHaveAttribute("aria-valuetext", /horizontal/);
  const mediaInspector = page.getByTestId("inspector-media");
  await mediaInspector.locator("summary").click();
  await mediaInspector.getByLabel("Zoom").fill("1.75");
  await mediaInspector.getByLabel("Horizontal position").fill("35");
  await mediaInspector.getByLabel("Vertical position").fill("-20");
  await expect(mediaInspector.getByLabel("Zoom")).toHaveValue("1.75");
  await expect(mediaInspector.getByLabel("Horizontal position")).toHaveValue("35");
  await expect(mediaInspector.getByLabel("Vertical position")).toHaveValue("-20");

  const backgroundInspector = page.getByTestId("inspector-background");
  await backgroundInspector.locator("summary").click();
  await backgroundInspector.getByRole("button", { name: "gradient", exact: true }).click();
  await expect(page.getByLabel("Gradient preview")).toBeVisible();
  await backgroundInspector.getByRole("button", { name: "Add color stop" }).click();
  await expect(page.getByLabel("Gradient stop 3 color")).toBeVisible();
  await backgroundInspector.getByRole("button", { name: "solid", exact: true }).click();
  await expect(page.getByLabel("Canvas color")).toBeVisible();
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
