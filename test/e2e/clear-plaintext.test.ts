import { expect, test } from "@playwright/test";
import { createShareLink } from "./utils.ts";
import { flushTestRedis } from "../flush-redis.ts";

test.beforeEach(async () => {
  await flushTestRedis();
});

test("successful share clears the compose field", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await page.locator("#share-password").fill("correct horse battery staple");
  await page.locator("#share-submit").click();
  await page.locator("#share-dialog").waitFor({ state: "visible" });
  await expect(page.locator("#share-password")).toHaveValue("");

  await page.locator("#share-close").click();
  await expect(page.locator("#share-dialog")).toBeHidden();
  await expect(page.locator("#share-password")).toHaveValue("");
});

test("a failed share keeps the typed secret", async ({ page }) => {
  await createShareLink(page, "first");
  await createShareLink(page, "second");

  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await page.locator("#share-password").fill("third");
  await page.locator("#share-submit").click();
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.locator("#share-password")).toHaveValue("third");
});
