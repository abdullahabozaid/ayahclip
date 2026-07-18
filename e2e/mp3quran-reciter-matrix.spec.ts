import { expect, test, type Page } from "@playwright/test";

const RECITERS = [
  { id: "abdelbari-toubayti", name: "Abdelbari Al-Toubayti", duration: 5.103 },
  { id: "abdullah-buaijan", name: "Abdullah Al-Buaijan", duration: 6.5 },
  { id: "abdullah-khayyat", name: "Abdullah Khayyat", duration: 4.242 },
  { id: "abdulwadood-haneef", name: "Abdulwadood Haneef", duration: 4.221 },
  { id: "emad-hafez", name: "Emad Zuhair Hafez", duration: 7.269 },
  { id: "idrees-abkr", name: "Idrees Abkr", duration: 4.8 },
  { id: "khalid-almohana", name: "Khalid Al-Mohana", duration: 7.035 },
  { id: "khalid-jileel", name: "Khalid Al-Jileel", duration: 4.54 },
  { id: "mohammad-khalil-al-qari", name: "Muhammad Khalil Al-Qari", duration: 8.1 },
  { id: "bandar-balilah", name: "Bandar Balilah", duration: 6.88 },
  { id: "raad-kurdi", name: "Raad Al-Kurdi", duration: 1.64 },
  { id: "ahmad-nufais", name: "Ahmad Al-Nufais", duration: 8.36 },
  { id: "peshawa-qadr-kurdi", name: "Peshawa Qadr Al-Kurdi", duration: 5.62 },
  { id: "abdulaziz-turki", name: "Abdulaziz Al-Turki", duration: 5.76 },
  { id: "anas-emadi", name: "Anas Al-Emadi", duration: 5.22 },
  { id: "ahmad-hawashi", name: "Ahmad Al-Hawashi", duration: 4.88 },
  { id: "abdulaziz-al-ahmad", name: "Abdul Aziz Al-Ahmad", duration: 4.053 },
  { id: "abdullah-al-mousa", name: "Abdullah Al-Mousa", duration: 5.98 },
  { id: "abdulrahman-al-oosi", name: "Abdulrahman Al-Oosi", duration: 4.54 },
  { id: "haitham-al-dokhin", name: "Haitham Al-Dokhin", duration: 5.28 },
  { id: "tawfeeq-as-sayegh", name: "Tawfeeq As-Sayegh", duration: 4.42 },
  { id: "abdulrasheed-soufi", name: "Abdulrasheed Soufi", duration: 4.92 },
  { id: "muhammad-burhaji", name: "Muhammad Burhaji", duration: 5.418 },
  { id: "abdullah-al-khalaf", name: "Abdullah Al-Khalaf", duration: 5.78 },
  { id: "khalid-abdulkafi", name: "Khalid Abdulkafi", duration: 4.956 },
  { id: "majed-al-zamil", name: "Majed Al-Zamil", duration: 4.2 },
  { id: "saleh-alshamrani", name: "Saleh Alshamrani", duration: 5.04 },
  { id: "hassan-aldaghriri", name: "Hassan Aldaghriri", duration: 4.82 },
  { id: "alzain-mohammad-ahmad", name: "Alzain Mohammad Ahmad", duration: 5.6 },
  { id: "ahmad-deban", name: "Ahmad Deban", duration: 5.84 },
  { id: "sayed-ahmad-hashemi", name: "Sayed Ahmad Hashemi", duration: 6.76 },
  { id: "wadeea-al-yamani", name: "Wadeea Al-Yamani", duration: 6.58 },
  { id: "ibrahim-al-asiri", name: "Ibrahim Al-Asiri", duration: 5.84 },
  { id: "ahmad-saber", name: "Ahmad Saber", duration: 5.12 },
  { id: "dawood-hamza", name: "Dawood Hamza", duration: 4.7 },
  { id: "zaki-daghistani", name: "Zaki Daghistani", duration: 5.72 },
  { id: "shirazad-taher", name: "Shirazad Taher", duration: 6.8 },
  { id: "saber-abdulhakm", name: "Saber Abdulhakm", duration: 4.88 },
  { id: "saleh-alsahood", name: "Saleh Alsahood", duration: 5.82 },
  { id: "saleh-al-habdan", name: "Saleh Al-Habdan", duration: 5.28 },
  { id: "salah-alhashim", name: "Salah Alhashim", duration: 5.22 },
  { id: "adel-ryyan", name: "Adel Ryyan", duration: 6.7 },
  { id: "abdulbari-mohammad", name: "Abdulbari Mohammad", duration: 7.04 },
  { id: "abdulmohsin-al-harthy", name: "Abdulmohsin Al-Harthy", duration: 4.36 },
  { id: "abdulhadi-kanakeri", name: "Abdulhadi Kanakeri", duration: 4.26 },
  { id: "neamah-al-hassan", name: "Neamah Al-Hassan", duration: 6.76 },
  { id: "yousef-bin-noah-ahmad", name: "Yousef Bin Noah Ahmad", duration: 7.52 },
  { id: "ahmed-al-trabulsi", name: "Ahmed Al-Trabulsi", duration: 4.98 },
  { id: "ahmed-amer", name: "Ahmed Amer", duration: 4.6 },
  { id: "abdulrahman-al-majed", name: "Abdulrahman Al-Majed", duration: 7.16 },
  { id: "mohammad-albukheet", name: "Mohammad Albukheet", duration: 4.46 },
  { id: "khalid-mohammadi", name: "Khalid Mohammadi", duration: 6.04 },
  { id: "issa-omar-sanankoua", name: "Issa Omar Sanankoua", duration: 3.82 },
  { id: "mohammad-saleh-alim-shah", name: "Mohammad Saleh Alim Shah", duration: 4.263 },
] as const;

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

for (const reciter of RECITERS) {
  test(`${reciter.name} previews and exports the official 114:6 cue`, async ({ page }, testInfo) => {
    test.slow();
    const errors = collectPageErrors(page);

    await page.goto("/surah/114");
    await page.getByLabel("Recitation").selectOption(reciter.id);
    await page.getByRole("button", { name: "6", exact: true }).first().click();
    await page.getByRole("link", { name: "Open studio" }).click();

    const play = page.getByRole("button", { name: "Play", exact: true }).first();
    await play.click();
    const pause = page.getByRole("button", { name: "Pause", exact: true }).first();
    await expect(pause).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(250);
    await pause.click();

    if (process.env.CI) {
      expect(errors).toEqual([]);
      return;
    }

    await page.getByRole("button", { name: "Preview the final MP4" }).click();
    const dialog = page.getByRole("dialog", { name: "Final MP4 preview" });
    await expect(dialog).toBeVisible({ timeout: 90_000 });
    const video = dialog.locator("video");
    await expect.poll(
      () => video.evaluate((element: HTMLVideoElement) => element.readyState),
      { timeout: 20_000 }
    ).toBeGreaterThanOrEqual(1);
    const result = await video.evaluate(async (element: HTMLVideoElement) => {
      const blob = await fetch(element.src).then((response) => response.blob());
      return { duration: element.duration, size: blob.size, type: blob.type };
    });

    expect(result.type, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBe("video/mp4");
    expect(result.size, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBeGreaterThan(5_000);
    expect(result.duration, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBeGreaterThan(
      reciter.duration - 0.35
    );
    expect(result.duration, `${testInfo.project.name}: ${JSON.stringify(result)}`).toBeLessThan(
      reciter.duration + 0.35
    );
    expect(errors).toEqual([]);
  });
}
