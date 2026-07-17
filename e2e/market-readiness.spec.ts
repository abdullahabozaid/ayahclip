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

test("recognition exposes truthful named stages before local model work", async ({ page }) => {
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "recognition-stage.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });

  await page.getByRole("button", { name: "Recognise verses" }).click();
  await expect(
    page.getByRole("button", { name: /Preparing|Listening|Matching|Aligning/ }),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Recognition stages" })).toBeVisible();
  await expect(page.getByText("Private, on-device processing", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analysing…" })).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: "Recognise verses" })).toBeEnabled();

  await page.getByRole("combobox", { name: "Surah" }).selectOption("51");
  await page.getByRole("spinbutton", { name: "From" }).fill("1");
  await page.getByRole("spinbutton", { name: "To" }).fill("2");
  await expect(page.getByRole("button", { name: "Choose a template" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await expect(page.getByRole("button", { name: "Choose a template" })).toBeEnabled();
  await page.getByRole("button", { name: "Choose a template" }).click();

  await expect(page).toHaveURL(/\/styles\?from=import/);
  await expect(page.getByText("Your recitation audio is ready")).toBeVisible();
  const templateCard = page.locator("article").filter({
    // Use a bundled Quran face here. QCF page glyphs intentionally fail export
    // rather than capture a fallback when quran.com's font CDN is unavailable,
    // and GitHub's isolated runner must not make this workflow test depend on
    // that third-party network.
    has: page.getByRole("heading", { level: 2, name: "Reciter Split Fade" }),
  });
  await templateCard.getByRole("button", { name: "Use template" }).click();

  await expect(page).toHaveURL(/\/studio/);
  await expect(page.getByText("Verse Editor", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare all five on this ayah" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Quran Ink Thickness" })).toHaveValue("0");
  // The 100 ms silence at each edge is trimmed by autoSegment, so Studio must
  // report the one-second exported speech span rather than a per-verse guess.
  await expect(page.getByText("1s", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show" }).click();
  await page.getByRole("button", { name: "Timeline" }).click();
  await expect(page.getByText("Loop verse", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Timeline legend")).toContainText("Needs review");
  await page.getByRole("button", { name: "Timing tools" }).click();
  await expect(page.getByText("Automatic timing", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use pauses" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use recited words" })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Your clips" })).toBeVisible();
  await page.getByRole("heading", { level: 3, name: "Adh-Dhariyat 1-2" }).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(page.getByText("Verse Editor", { exact: true })).toBeVisible();

  // Playwright's headless Chromium build on the Linux CI runner exposes no
  // usable browser video encoder. Keep the durable import/save/reopen path in
  // CI, and run the real MP4 byte/duration gate in local Chromium where the
  // application can use WebCodecs or MediaRecorder.
  if (process.env.CI) {
    assertNoErrors();
    return;
  }

  await page.getByRole("button", { name: "Preview the final MP4" }).click();
  const finalPreview = page.getByRole("dialog", { name: "Final MP4 preview" });
  await expect(finalPreview).toBeVisible({ timeout: 60_000 });
  const finalVideo = finalPreview.locator("video");
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

test("a failed first save stays a draft and explains how to recover", async ({ page }) => {
  test.slow();
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "unsaved-source.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await page.getByRole("combobox", { name: "Surah" }).selectOption("51");
  await page.getByRole("spinbutton", { name: "From" }).fill("1");
  await page.getByRole("spinbutton", { name: "To" }).fill("2");
  await page.getByRole("checkbox", { name: /I confirm this Quran range/ }).check();
  await page.getByRole("button", { name: "Choose a template" }).click();
  const templateCard = page.locator("article").filter({
    has: page.getByRole("heading", { level: 2, name: "Reciter Split Fade" }),
  });
  await templateCard.getByRole("button", { name: "Use template" }).click();

  await expect(page.getByRole("button", { name: "Exit editor" })).toHaveAttribute(
    "title",
    "Exit without saving this draft",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save failed", exact: true })).toBeVisible();
  await expect(
    page.locator('[role="alert"]').filter({ hasText: "Not saved." }),
  ).toContainText("source media could not be stored");
  await expect(page.getByRole("button", { name: "Exit editor" })).toHaveAttribute(
    "title",
    "Exit without saving this draft",
  );
});

test("a saved imported clip with missing audio never reopens as a reciter clip", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("keyval", "readwrite");
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore("keyval").put({
          id: "missing-imported-audio",
          name: "Adh-Dhariyat 1-2",
          surahId: 51,
          surahName: "Adh-Dhariyat",
          selectedVerseNumbers: [1, 2],
          imported: { name: "missing-source.wav", timings: [], videoBg: false },
          settings: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }, "project:missing-imported-audio");
      };
    });
  });
  await page.reload();

  await page.getByRole("heading", { level: 3, name: "Adh-Dhariyat 1-2" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.locator('[role="alert"]').filter({ hasText: "Clip could not open." }),
  ).toContainText("missing its imported audio");
  await expect(page.getByRole("link", { name: "Import source" })).toBeVisible();
});

test("saved clip deletion stays in context and can be cancelled safely", async ({ page }) => {
  let nativeDialogs = 0;
  page.on("dialog", async (dialog) => {
    nativeDialogs += 1;
    await dialog.dismiss();
  });
  await page.goto("/");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("keyval", "readwrite");
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore("keyval").put({
          id: "delete-safeguard",
          name: "Delete Safeguard",
          surahId: 1,
          surahName: "Al-Fatihah",
          selectedVerseNumbers: [1],
          settings: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }, "project:delete-safeguard");
      };
    });
  });
  await page.reload();

  const clip = page.getByRole("heading", { level: 3, name: "Delete Safeguard" });
  await expect(clip).toBeVisible();
  await clip.locator("xpath=ancestor::div[contains(@class, 'group')]").hover();
  await page.getByRole("button", { name: "Delete project" }).click();
  const safeguard = page.locator('[role="alert"]').filter({ hasText: "Delete “Delete Safeguard”?" });
  await expect(safeguard).toContainText("permanently removed");
  await safeguard.getByRole("button", { name: "Keep it" }).click();
  await expect(clip).toBeVisible();

  await page.getByRole("button", { name: "Delete project" }).click();
  await safeguard.getByRole("button", { name: "Delete clip" }).click();
  await expect(clip).toHaveCount(0);
  expect(nativeDialogs).toBe(0);
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
  await arabicInspector.getByRole("button", { name: "Compare all five fonts" }).click();

  // Prove the four bundled Unicode faces are genuinely loaded and visually
  // distinct. A font dropdown can look correct while canvas silently paints the
  // same fallback face for every option, which would also corrupt final MP4s.
  const fontRenders: { family: string; faceCount: number; hash: number }[] = [];
  for (const name of [
    "Uthmanic Hafs",
    "Amiri Quran",
    "Scheherazade New",
    "Noto Naskh Arabic",
  ]) {
    const specimen = arabicInspector
      .getByRole("button", { name: new RegExp(name) })
      .locator("p")
      .first();
    fontRenders.push(await specimen.evaluate(async (element) => {
      const sample = "وَءَامَنُوا۟ بِسْمِ ٱللَّهِ ۚ";
      const style = getComputedStyle(element);
      const descriptor = `${style.fontWeight} 48px ${style.fontFamily}`;
      const faces = await document.fonts.load(descriptor, sample);
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 140;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas context unavailable");
      context.fillStyle = "#fff";
      context.font = descriptor;
      context.direction = "rtl";
      context.textAlign = "right";
      context.textBaseline = "top";
      context.fillText(sample, 620, 12);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (let i = 3; i < pixels.length; i += 4) {
        hash ^= pixels[i];
        hash = Math.imul(hash, 16777619);
      }
      return {
        family: style.fontFamily.split(",")[0],
        faceCount: faces.length,
        hash: hash >>> 0,
      };
    }));
  }
  const fontEvidence = JSON.stringify(fontRenders);
  expect(fontRenders.every((render) => render.faceCount > 0), fontEvidence).toBe(true);
  expect(new Set(fontRenders.map((render) => render.family)).size, fontEvidence).toBe(4);
  expect(new Set(fontRenders.map((render) => render.hash)).size, fontEvidence).toBe(4);

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

  const arabicInspector = page.getByTestId("inspector-arabic");
  await arabicInspector.locator("summary").click();
  await expect(
    arabicInspector.getByRole("button", { name: /Traditional bold/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(arabicInspector.getByLabel("Size")).toHaveValue("34");
  await expect(arabicInspector.getByText("Split text needs room", { exact: true })).toHaveCount(0);
  await arabicInspector.getByRole("button", { name: "Compare all five fonts" }).click();
  await expect(
    arabicInspector.getByRole("button", { name: /Scheherazade New/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    arabicInspector.getByRole("button", { name: "Bold", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(arabicInspector.getByLabel("Quran ink thickness")).toHaveValue("0");

  const translationInspector = page.getByTestId("inspector-translation");
  await translationInspector.locator("summary").click();
  await expect(translationInspector.getByLabel("Translation color")).toHaveValue("#d7d2c6");

  const treatmentInspector = page.getByTestId("inspector-treatment");
  await treatmentInspector.locator("summary").click();
  await expect(treatmentInspector.getByRole("button", { name: "Crisp edge", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(treatmentInspector.getByLabel("Crisp text edge")).toBeChecked();
  await expect(treatmentInspector.getByLabel("Edge width")).toHaveValue("1.5");
  await treatmentInspector.getByRole("button", { name: "Soft glow", exact: true }).click();
  await expect(treatmentInspector.getByLabel("Crisp text edge")).not.toBeChecked();
  await treatmentInspector.getByRole("button", { name: "Crisp edge", exact: true }).click();
  await expect(treatmentInspector.getByLabel("Crisp text edge")).toBeChecked();

  await expect(page.getByRole("button", { name: "Split fade", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Solid width")).toHaveValue("50");
  await expect(page.getByLabel("Fade width")).toHaveValue("20");
  await page.getByLabel("Solid width").fill("48");
  await page.getByLabel("Fade width").fill("24");
  await page.getByLabel("Panel opacity").fill("92");
  await expect(page.getByLabel("Solid width")).toHaveValue("48");
  await expect(page.getByLabel("Fade width")).toHaveValue("24");
  await expect(page.getByLabel("Panel opacity")).toHaveValue("92");
  await page.getByRole("button", { name: "Solid", exact: true }).click();
  await expect(page.getByLabel("Fade width")).toHaveValue("0");
  await page.getByRole("button", { name: "Fade", exact: true }).click();
  await expect(page.getByLabel("Fade width")).not.toHaveValue("0");

  await page.getByRole("button", { name: "media", exact: true }).click();
  const directMediaPosition = page.getByRole("slider", { name: "Media position" });
  await directMediaPosition.press("ArrowRight");
  await expect(directMediaPosition).toHaveAttribute("aria-valuetext", /horizontal/);
  await expect(page.getByRole("status", { name: "Media framing position" })).toContainText("3% right");
  await page.getByRole("button", { name: "Center media" }).click();
  await expect(directMediaPosition).toHaveAttribute("aria-valuetext", "0% horizontal, 0% vertical");
  await directMediaPosition.press("ArrowRight");
  const mediaInspector = page.getByTestId("inspector-media");
  await mediaInspector.locator("summary").click();
  await mediaInspector.getByLabel("Zoom").fill("1.75");
  await mediaInspector.getByLabel("Horizontal offset").fill("35");
  await mediaInspector.getByLabel("Vertical offset").fill("-20");
  await expect(mediaInspector.getByLabel("Zoom")).toHaveValue("1.75");
  await expect(mediaInspector.getByLabel("Horizontal offset")).toHaveValue("35");
  await expect(mediaInspector.getByLabel("Vertical offset")).toHaveValue("-20");
  await mediaInspector.getByRole("button", { name: "Center image" }).click();
  await expect(mediaInspector.getByLabel("Horizontal offset")).toHaveValue("0");
  await expect(mediaInspector.getByLabel("Vertical offset")).toHaveValue("0");
  await expect(mediaInspector.getByLabel("Zoom")).toHaveValue("1.75");

  const backgroundInspector = page.getByTestId("inspector-background");
  await backgroundInspector.locator("summary").click();
  await backgroundInspector.getByRole("button", { name: "gradient", exact: true }).click();
  await expect(page.getByLabel("Gradient preview")).toBeVisible();
  const previewCanvasTreatment = page.getByLabel("Preview canvas treatment");
  await expect(previewCanvasTreatment.getByRole("button", { name: "Gradient canvas" })).toHaveAttribute("aria-pressed", "true");
  await backgroundInspector.getByLabel("Gradient stop 1 color").fill("#123456");
  await backgroundInspector.getByRole("button", { name: "Add color stop" }).click();
  await expect(page.getByLabel("Gradient stop 3 color")).toBeVisible();
  await previewCanvasTreatment.getByRole("button", { name: "Solid canvas" }).click();
  await expect(backgroundInspector.getByLabel("Canvas color")).toHaveValue("#123456");
  await backgroundInspector.getByLabel("Canvas color").fill("#654321");
  await previewCanvasTreatment.getByRole("button", { name: "Gradient canvas" }).click();
  await expect(backgroundInspector.getByLabel("Gradient stop 1 color")).toHaveValue("#123456");
  await previewCanvasTreatment.getByRole("button", { name: "Solid canvas" }).click();
  await expect(backgroundInspector.getByLabel("Canvas color")).toHaveValue("#654321");
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
