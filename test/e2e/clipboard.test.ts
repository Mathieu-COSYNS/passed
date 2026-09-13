import { expect, test } from "@playwright/test";
import { createShareLink, expectScreenshot } from "./utils.ts";
import { flushTestRedis } from "../flush-redis.ts";

test.beforeEach(async () => {
  await flushTestRedis();
});

test("hides the copy button when clipboard is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  const shareUrl = await createShareLink(page, "correct horse battery staple");
  await expect(page.locator("#share-copy")).toBeHidden();
  await expect(page.locator("#error")).toBeHidden();
  await expect(page.locator("#share-dialog")).toBeVisible();
  await expect(page.locator("#share-link")).toHaveValue(shareUrl);
  await expectScreenshot(page, "clipboard-unavailable", {
    mask: [page.locator("#share-link")],
  });
});

test("copy failure shows an error and leaves the share URL visible", async ({
  page,
}) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("clipboard write denied")),
      },
    });
  });

  await page.locator("#share-copy").click();
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.locator("#error-error")).toContainText("clipboard write denied");
  await expect(page.locator("#share-dialog")).toBeVisible();
  await expect(page.locator("#share-link")).toHaveValue(shareUrl);
  await expectScreenshot(page, "clipboard-copy-failure");
});
