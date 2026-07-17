import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /device-export-readiness\.spec\.ts|long-export-readiness\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
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
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
