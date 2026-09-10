import { defineConfig } from "@playwright/test";
import { E2E_ORIGIN } from "./test/e2e/origin.ts";
import {
  TEST_MAX_SECRETS,
  TEST_REDIS_DB,
  redisUrlWithDb,
} from "./test/test-env.ts";

const { hostname, port } = new URL(E2E_ORIGIN);
const redisUrl = redisUrlWithDb(
  process.env.PASSED_STORE_REDIS_URL ??
    process.env.REDIS_URL ??
    "redis://127.0.0.1:6379",
  TEST_REDIS_DB,
);

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "*.test.ts",
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
    headless: true,
    viewport: { width: 1280, height: 720 },
    permissions: ["clipboard-read", "clipboard-write"],
  },
  globalSetup: "./test/global-setup.ts",
  webServer: {
    command: `pnpm exec vite --host ${hostname} --port ${port} --strictPort`,
    url: E2E_ORIGIN,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      PORT: port,
      PASSED_STORE_TYPE: process.env.PASSED_STORE_TYPE ?? "redis",
      PASSED_STORE_REDIS_URL: redisUrl,
      PASSED_MAX_SECRETS: String(TEST_MAX_SECRETS),
    },
  },
});
