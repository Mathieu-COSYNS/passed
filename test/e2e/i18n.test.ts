import { expect, test } from "@playwright/test";
import { expectScreenshot } from "./utils.ts";
import { flushTestRedis } from "../flush-redis.ts";

test.beforeEach(async () => {
  await flushTestRedis();
});

test("renders translation strings as text, not HTML", async ({ page }) => {
  await page.route("**/lang/en.json", async (route) => {
    const response = await route.fetch();
    const translations = (await response.json()) as Record<string, string>;
    translations.share = "<img src=x onerror='window.__xss=1'>Share";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(translations),
    });
  });

  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText(
    "<img src=x onerror='window.__xss=1'>Share",
  );
  await expect(page.locator("#share-submit img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __xss?: number }).__xss)).toBeUndefined();
});

test("unknown localStorage language falls back to English without fetching it", async ({
  page,
}) => {
  const langUrls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/lang/")) {
      langUrls.push(request.url());
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem("language", "xx");
  });
  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await expect(page.locator("#language")).toHaveValue("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#language")).toHaveAttribute("aria-label", "Language");
  expect(langUrls.some((url) => url.includes("/lang/xx.json"))).toBe(false);
  expect(langUrls.some((url) => url.includes("/lang/en.json"))).toBe(true);
});

test("failed language response is not parsed as JSON", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.route("**/lang/de.json", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "<html>not json</html>",
    }),
  );

  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await page.locator("#language").selectOption("de");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await expect(page.locator("#language")).toHaveValue("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#language")).toHaveAttribute("aria-label", "Language");
  await expect(page.locator("#error")).toBeHidden();
  expect(
    consoleErrors.some((text) => text.includes("Failed to load language de: 404")),
  ).toBe(true);
});

test("switches to German and keeps it after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#language")).toHaveAttribute("aria-label", "Language");

  await page.locator("#language").selectOption("de");
  await expect(page.locator("#share-submit")).toHaveText("Teilen");
  await expect(page.locator("#language")).toHaveValue("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("#language")).toHaveAttribute("aria-label", "Sprache");
  await expectScreenshot(page, "german-share-form");

  await page.reload();
  await expect(page.locator("#share-submit")).toHaveText("Teilen");
  await expect(page.locator("#language")).toHaveValue("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("#language")).toHaveAttribute("aria-label", "Sprache");

  await page.locator("#language").selectOption("en");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await expect(page.locator("#language")).toHaveValue("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#language")).toHaveAttribute("aria-label", "Language");
});

test("switches to French and keeps it after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#language")).toHaveAttribute("aria-label", "Language");

  await page.locator("#language").selectOption("fr");
  await expect(page.locator("#share-submit")).toHaveText("Partager");
  await expect(page.locator("#language")).toHaveValue("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("#language")).toHaveAttribute("aria-label", "Langue");
  await expectScreenshot(page, "french-share-form");

  await page.reload();
  await expect(page.locator("#share-submit")).toHaveText("Partager");
  await expect(page.locator("#language")).toHaveValue("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("#language")).toHaveAttribute("aria-label", "Langue");

  await page.locator("#language").selectOption("en");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await expect(page.locator("#language")).toHaveValue("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#language")).toHaveAttribute("aria-label", "Language");
});
