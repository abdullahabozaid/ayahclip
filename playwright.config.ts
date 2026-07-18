import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Hosted Linux Chromium does not expose a production-capable MP4 encoder.
  // Keep byte-level export tests in the Google Chrome release gate instead of
  // spending three minutes per retry on a capability the runner cannot gain.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: process.env.GOOGLE_CHROME ? "google-chrome" : "chromium",
      testIgnore: process.env.CI_BROWSER_SUITE
        ? /curated-video-presets\.spec\.ts|export-format-parity\.spec\.ts|offline-export-readiness\.spec\.ts|text-edge-export\.spec\.ts|device-export-readiness\.spec\.ts|long-export-readiness\.spec\.ts|production-smoke\.spec\.ts/
        : process.env.PLAYWRIGHT_BASE_URL
          ? /device-export-readiness\.spec\.ts|long-export-readiness\.spec\.ts/
          : /device-export-readiness\.spec\.ts|long-export-readiness\.spec\.ts|production-smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.GOOGLE_CHROME ? { channel: "chrome" as const } : {}),
      },
    },
    {
      name: "android-chrome",
      testMatch: /device-export-readiness\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "iphone-webkit",
      testMatch: /device-export-readiness\.spec\.ts/,
      use: { ...devices["iPhone 15 Pro"] },
    },
    ...(process.env.EXPORT_STRESS
      ? [{
          name: "low-memory-chrome",
          testMatch: /long-export-readiness\.spec\.ts/,
          use: {
            ...devices["Desktop Chrome"],
            channel: "chrome" as const,
            launchOptions: { args: ["--js-flags=--max-old-space-size=512"] },
          },
        }]
      : []),
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
