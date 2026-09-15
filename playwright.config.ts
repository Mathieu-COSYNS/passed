import { defineConfig } from "@playwright/test";

const E2E_ORIGIN = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "*.test.ts",
  reporter: process.env.CI ? "github" : "list",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: E2E_ORIGIN,
    locale: "en-US",
    headless: true,
    viewport: { width: 1280, height: 720 },
    permissions: ["clipboard-read", "clipboard-write"],
  },
  globalTeardown: "./test/global-teardown.ts",
  webServer: {
    command: `node test/e2e-web-server.ts`,
    url: E2E_ORIGIN,
    reuseExistingServer: false,
  },
});
