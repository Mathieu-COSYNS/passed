import { expect, test } from "@playwright/test";
import { createShareLink, expectScreenshot } from "./utils.ts";
import { flushTestRedis } from "../flush-redis.ts";

test.beforeEach(async () => {
  await flushTestRedis();
});

test("default share still allows only one reveal", async ({ page, context }) => {
  const password = "correct horse battery staple";
  const shareUrl = await createShareLink(page, password);

  const tab = await context.newPage();
  await tab.goto(shareUrl);
  await expect(tab.locator("#reveal-password-notice")).toHaveText(
    "You may only reveal the password once.",
  );
  await tab.locator("#confirm-yes").click();
  await expect(tab.locator("#view-password")).toHaveValue(password);
  await expect(tab.locator("#view-status")).toHaveText(
    "Copy the password before you leave. It will not be shown again.",
  );

  const consumed = await context.newPage();
  await consumed.goto(shareUrl);
  await expect(consumed.locator("#not-found")).toBeVisible();
});

test("confirm remaining views follow the selected language", async ({
  page,
  context,
}) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");
  const tab = await context.newPage();
  await tab.goto(shareUrl);
  await expect(tab.locator("#reveal-password-notice")).toHaveText(
    "You may only reveal the password once.",
  );

  await tab.locator("#language").selectOption("de");
  await expect(tab.locator("#reveal-password-notice")).toHaveText(
    "Sie können sich das Passwort nur einmal anschauen.",
  );
});

test("a two-view link can be revealed twice then is gone", async ({
  page,
  context,
}) => {
  const password = "correct horse battery staple";
  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await expect(page.locator("select[name=view]")).toHaveValue("1");
  await page.locator("#share-password").fill(password);
  await page.locator("select[name=view]").selectOption("2");
  await expectScreenshot(page, "share-form-two-views");
  await page.locator("#share-submit").click();
  await page.locator("#share-dialog").waitFor({ state: "visible" });
  const shareUrl = await page.locator("#share-link").inputValue();
  expect(shareUrl).toContain("#");

  const first = await context.newPage();
  await first.goto(shareUrl);
  await expect(first.locator("#reveal-password-notice")).toHaveText(
    "You may only reveal the password 2 times.",
  );
  await first.locator("#confirm-yes").click();
  await expect(first.locator("#view-password")).toHaveValue(password);
  await expect(first.locator("#view-status")).toHaveText(
    /This password expires in \d+ (day|days|hour|hours) or in 1 view, whichever comes first\./,
  );

  const second = await context.newPage();
  await second.goto(shareUrl);
  await expect(second.locator("#confirm-yes")).toBeVisible();
  await expect(second.locator("#reveal-password-notice")).toHaveText(
    "You may only reveal the password once.",
  );
  await second.locator("#confirm-yes").click();
  await expect(second.locator("#view-password")).toHaveValue(password);
  await expect(second.locator("#view-status")).toHaveText(
    "Copy the password before you leave. It will not be shown again.",
  );

  const third = await context.newPage();
  await third.goto(shareUrl);
  await expect(third.locator("#not-found")).toBeVisible();
});

test("backend rejection of an invalid view is shown as an error", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await page.locator("#share-password").fill("secret");
  await page.locator("select[name=view]").evaluate((select) => {
    const extra = document.createElement("option");
    extra.value = "99";
    extra.textContent = "99";
    select.append(extra);
    (select as HTMLSelectElement).value = "99";
  });
  await page.locator("#share-submit").click();
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.locator("#error-error")).toContainText("400");
});
