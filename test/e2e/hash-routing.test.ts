import { expect, test } from "@playwright/test";
import { createShareLink } from "./utils.ts";
import { flushTestRedis } from "../flush-redis.ts";

test.beforeEach(async () => {
  await flushTestRedis();
});

test("opening a share URL absorbs the fragment before confirm", async ({
  page,
  context,
}) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");
  const key = shareKey(shareUrl);

  const tab = await context.newPage();
  await tab.goto(shareUrl);
  await expect(tab.locator("#confirm-yes")).toBeVisible();
  expect(new URL(tab.url()).hash).toBe("");
  expect(tab.url()).not.toContain(key);
});

test("Back after reveal does not restore the share key", async ({
  page,
  context,
}) => {
  const password = "correct horse battery staple";
  const shareUrl = await createShareLink(page, password);
  const key = shareKey(shareUrl);

  const tab = await context.newPage();
  await tab.goto("/");
  await expect(tab.locator("#share-submit")).toHaveText("Share");
  await tab.goto(shareUrl);
  await tab.locator("#confirm-yes").click();
  await expect(tab.locator("#view-password")).toHaveValue(password);
  expect(tab.url()).not.toContain(key);

  await tab.goBack();
  expect(tab.url()).not.toContain(key);
});

test("Back after declining reveal does not restore the share key", async ({
  page,
  context,
}) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");
  const key = shareKey(shareUrl);

  const tab = await context.newPage();
  await tab.goto("/");
  await tab.goto(shareUrl);
  await tab.locator("#confirm-no").click();
  await expect(tab.locator("#share-password")).toBeVisible();
  expect(tab.url()).not.toContain(key);

  await tab.goBack();
  expect(tab.url()).not.toContain(key);
});

test("Back after not-found does not restore the share key", async ({
  page,
  context,
}) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");
  const key = shareKey(shareUrl);

  const tab = await context.newPage();
  await tab.goto(shareUrl);
  await tab.locator("#confirm-yes").click();
  await expect(tab.locator("#view-password")).toBeVisible();

  const consumed = await context.newPage();
  await consumed.goto("/");
  await consumed.goto(shareUrl);
  await expect(consumed.locator("#not-found")).toBeVisible();
  expect(consumed.url()).not.toContain(key);

  await consumed.locator("#not-found-ok").click();
  await expect(consumed.locator("#share-password")).toBeVisible();

  await consumed.goBack();
  expect(consumed.url()).not.toContain(key);
});

test("pasting a share fragment into an open tab shows confirm", async ({
  page,
}) => {
  const password = "correct horse battery staple";
  const shareUrl = await createShareLink(page, password);
  const hash = new URL(shareUrl).hash;
  const key = shareKey(shareUrl);

  await page.goto("/");
  await expect(page.locator("#share-password")).toBeVisible();
  await page.evaluate((nextHash) => {
    window.location.hash = nextHash;
  }, hash);
  await expect(page.locator("#confirm-yes")).toBeVisible();
  await expect(page.locator("#share")).toBeHidden();
  expect(new URL(page.url()).hash).toBe("");
  expect(page.url()).not.toContain(key);
});

test("absorbing a new hash resets the UI before confirm", async ({ page }) => {
  const firstUrl = await createShareLink(page, "first secret");
  const secondUrl = await createShareLink(page, "second secret");

  await page.goto(firstUrl);
  await page.locator("#confirm-yes").click();
  await expect(page.locator("#view-password")).toHaveValue("first secret");

  await page.evaluate((nextHash) => {
    window.location.hash = nextHash;
  }, new URL(secondUrl).hash);

  await expect(page.locator("#view")).toBeHidden();
  await expect(page.locator("#view-password")).toHaveValue("");
  await expect(page.locator("#confirm-yes")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");

  await page.locator("#confirm-yes").click();
  await expect(page.locator("#view-password")).toHaveValue("second secret");
});

test("share-link creation still puts the key in the fragment", async ({
  page,
}) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");
  expect(shareKey(shareUrl)).toBeTruthy();
  expect(new URL(page.url()).hash).toBe("");
});

function shareKey(shareUrl: string): string {
  const fragment = new URL(shareUrl).hash.replace(/^#/, "");
  const key = fragment.split(":")[1];
  expect(key).toBeTruthy();
  return key!;
}
