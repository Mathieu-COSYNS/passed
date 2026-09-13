import { expect, test } from "@playwright/test";
import {
  createShareLink,
  expectScreenshot,
  waitForRevealOrError,
} from "./utils.ts";
import { flushTestRedis } from "../flush-redis.ts";

test.beforeEach(async () => {
  await flushTestRedis();
});

test("share form is the only view on load", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#share-password")).toBeVisible();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#not-found")).toBeHidden();
  await expect(page.locator("#confirm")).toBeHidden();
  await expect(page.locator("#view")).toBeHidden();
});

test("creates a share link and reveals the password in a new tab", async ({
  page,
  context,
}) => {
  const password = "correct horse battery staple";

  await page.goto("/");
  await page.locator("#share-submit").waitFor({ state: "visible" });
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await expectScreenshot(page, "01-share-form");

  await page.locator("#share-password").fill(password);
  await expectScreenshot(page, "02-password-filled");

  await page.locator("#share-submit").click();
  await page.locator("#share-dialog").waitFor({ state: "visible" });
  await expectScreenshot(page, "03-share-link", {
    mask: [page.locator("#share-link")],
  });

  const shareUrl = await page.locator("#share-link").inputValue();
  expect(shareUrl).toContain("#");

  const tab = await context.newPage();
  await tab.goto(shareUrl);
  await tab.locator("#confirm-yes").waitFor({ state: "visible" });
  await expect(tab.locator("#confirm-yes")).toHaveText("Yes");
  await expectScreenshot(tab, "04-confirm-reveal");

  await tab.locator("#confirm-yes").click();
  await tab.locator("#view-password").waitFor({ state: "visible" });
  await expectScreenshot(tab, "05-password-revealed");
  await expect(tab.locator("#view-password")).toHaveValue(password);

  await expect(tab.locator("#view-ok")).toHaveText("OK");
  await tab.locator("#view-ok").click();
  await expect(tab.locator("#share-password")).toBeVisible();
  await expect(tab.locator("#view")).toBeHidden();

  const consumed = await context.newPage();
  await consumed.goto(shareUrl);
  await expect(consumed.locator("#not-found")).toBeVisible();
  await expect(consumed.locator("#not-found-ok")).toHaveText("OK");
  await expectScreenshot(consumed, "06-consumed-link");

  await consumed.locator("#not-found-ok").click();
  await expect(consumed.locator("#share-password")).toBeVisible();
  await expect(consumed.locator("#not-found")).toBeHidden();
});

test("declines reveal then opens the same link and confirms", async ({
  page,
  context,
}) => {
  const password = "correct horse battery staple";
  const shareUrl = await createShareLink(page, password);

  const tab = await context.newPage();
  await tab.goto(shareUrl);
  await expect(tab.locator("#confirm-no")).toHaveText("No");
  await tab.locator("#confirm-no").click();
  await tab.locator("#share-password").waitFor({ state: "visible" });
  await expectScreenshot(tab, "after-decline");

  const retry = await context.newPage();
  await retry.goto(shareUrl);
  await expect(retry.locator("#confirm-yes")).toHaveText("Yes");
  await retry.locator("#confirm-yes").click();
  await expect(retry.locator("#view-password")).toHaveValue(password);
});

test("reveals a password that contains line breaks", async ({
  page,
  context,
}) => {
  const password = "line one\nline two\nline three";
  const shareUrl = await createShareLink(page, password);

  const tab = await context.newPage();
  await tab.goto(shareUrl);
  await expect(tab.locator("#confirm-yes")).toHaveText("Yes");
  await tab.locator("#confirm-yes").click();
  await expect(tab.locator("#view-password")).toHaveValue(password);
  await expectScreenshot(tab, "multiline-password");
});

test("reveals a password that contains unicode", async ({ page, context }) => {
  const password = "föø 密码 🔐";
  const shareUrl = await createShareLink(page, password);

  const tab = await context.newPage();
  await tab.goto(shareUrl);
  await expect(tab.locator("#confirm-yes")).toHaveText("Yes");
  await tab.locator("#confirm-yes").click();
  await expect(tab.locator("#view-password")).toHaveValue(password);
  await expectScreenshot(tab, "unicode-password");
});

test("fills a generated password", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await page.locator("#share-generate").click();
  await expect(page.locator("#share-password")).toHaveValue(
    /^[A-Za-z0-9]{14}$/,
  );
});

test("generate is reachable and activatable with the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");

  await page.locator("#share-submit").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#share-generate")).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator("#share-password")).toHaveValue(
    /^[A-Za-z0-9]{14}$/,
  );
  await expect(page.locator("#share-dialog")).toBeHidden();
});

test("generated passwords use unbiased CSPRNG sampling", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");

  const result = await page.evaluate(() => {
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mathRandomCalls = 0;
    const originalMathRandom = Math.random;
    Math.random = () => {
      mathRandomCalls += 1;
      return originalMathRandom();
    };

    let fillCalls = 0;
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
      fillCalls += 1;
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      if (fillCalls === 1) {
        bytes.fill(255);
      } else {
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = i;
        }
      }
      return array;
    };

    document.querySelector<HTMLButtonElement>("#share-generate")?.click();

    Math.random = originalMathRandom;
    crypto.getRandomValues = originalGetRandomValues;

    return {
      password: document.querySelector<HTMLTextAreaElement>("#share-password")
        ?.value,
      mathRandomCalls,
      fillCalls,
      expected: alphabet.slice(0, 14),
    };
  });

  expect(result.mathRandomCalls).toBe(0);
  expect(result.fillCalls).toBeGreaterThan(1);
  expect(result.password).toBe(result.expected);
});

test("shares a generated password and reveals it", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await page.locator("#share-generate").click();
  const password = await page.locator("#share-password").inputValue();
  expect(password).toMatch(/^[A-Za-z0-9]{14}$/);

  await page.locator("#share-submit").click();
  await page.locator("#share-dialog").waitFor({ state: "visible" });
  const shareUrl = await page.locator("#share-link").inputValue();
  expect(shareUrl).toContain("#");

  const tab = await context.newPage();
  await tab.goto(shareUrl);
  await tab.locator("#confirm-yes").waitFor({ state: "visible" });
  await tab.locator("#confirm-yes").click();
  await expect(tab.locator("#view-password")).toHaveValue(password);
});

test("copies the share link and closes the dialog", async ({ page }) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");

  await page.locator("#share-copy").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(shareUrl);

  await page.locator("#share-close").click();
  await expect(page.locator("#share-dialog")).toBeHidden();
  await expect(page.locator("#share-password")).toBeVisible();
});

test("only one of two tabs can reveal the same share", async ({
  page,
  context,
}) => {
  const password = "correct horse battery staple";
  const shareUrl = await createShareLink(page, password);

  const tab1 = await context.newPage();
  const tab2 = await context.newPage();
  await Promise.all([tab1.goto(shareUrl), tab2.goto(shareUrl)]);
  await expect(tab1.locator("#confirm-yes")).toHaveText("Yes");
  await expect(tab2.locator("#confirm-yes")).toHaveText("Yes");

  await Promise.all([
    tab1.locator("#confirm-yes").click(),
    tab2.locator("#confirm-yes").click(),
  ]);
  await Promise.all([waitForRevealOrError(tab1), waitForRevealOrError(tab2)]);

  const visible = await Promise.all(
    [tab1, tab2].map((tab) => tab.locator("#view-password").isVisible()),
  );
  expect(visible.filter(Boolean)).toHaveLength(1);

  const winner = visible[0] ? tab1 : tab2;
  const loser = visible[0] ? tab2 : tab1;
  await expect(winner.locator("#view-password")).toHaveValue(password);
  await expect(loser.locator("#error")).toBeVisible();
  await expect(loser.locator("#error-error")).toContainText("404");
});

test("shows an error when the secret cap is full", async ({ page }) => {
  await createShareLink(page, "first");
  await createShareLink(page, "second");

  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await page.locator("#share-password").fill("third");
  await page.locator("#share-submit").click();
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.locator("#error-error")).toContainText("server is full");
  await expectScreenshot(page, "error-capacity");
});
