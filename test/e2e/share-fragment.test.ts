import { expect, test, type Page } from "@playwright/test";
import { createShareLink } from "./utils.ts";
import { flushTestRedis } from "../flush-redis.ts";

test.beforeEach(async () => {
  await flushTestRedis();
});

test("# does not call HEAD or GET", async ({ page }) => {
  const lookups = watchLookups(page);
  await page.goto("/#");
  await expect(page.locator("#share-password")).toBeVisible();
  expect(lookups).toEqual([]);
});

test("#onlyid does not call HEAD or GET", async ({ page }) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");
  const { id } = shareParts(shareUrl);
  const lookups = watchLookups(page);

  await page.goto(withFragment(shareUrl, id));
  await expect(page.locator("#not-found")).toBeVisible();
  await expect(page.locator("#confirm")).toBeHidden();
  expect(lookups).toEqual([]);

  await page.goto(shareUrl);
  await expect(page.locator("#confirm-yes")).toBeVisible();
});

test("#id:key does not call HEAD or GET", async ({ page }) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");
  const { id, key } = shareParts(shareUrl);
  const lookups = watchLookups(page);

  await page.goto(withFragment(shareUrl, `${id}:${key}`));
  await expect(page.locator("#not-found")).toBeVisible();
  await expect(page.locator("#confirm")).toBeHidden();
  expect(lookups).toEqual([]);

  await page.goto(shareUrl);
  await expect(page.locator("#confirm-yes")).toBeVisible();
});

test("extra fragment pieces are rejected without calling the API", async ({
  page,
}) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");
  const { id, key, iv } = shareParts(shareUrl);
  const lookups = watchLookups(page);

  await page.goto(withFragment(shareUrl, `${id}:${key}:${iv}:extra`));
  await expect(page.locator("#not-found")).toBeVisible();
  await expect(page.locator("#confirm")).toBeHidden();
  expect(lookups).toEqual([]);

  await page.goto(shareUrl);
  await expect(page.locator("#confirm-yes")).toBeVisible();
});

test("a well-formed share fragment still loads confirm", async ({ page }) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");
  const lookups = watchLookups(page);

  await page.goto(shareUrl);
  await expect(page.locator("#confirm-yes")).toBeVisible();
  expect(lookups.some((call) => call.method === "HEAD")).toBe(true);
});

test("failed decrypt shows a spent share instead of confirm", async ({
  page,
  context,
}) => {
  const password = "correct horse battery staple";
  const shareUrl = await createShareLink(page, password);
  const { id, key, iv } = shareParts(shareUrl);
  const tampered = withFragment(shareUrl, `${id}:${tamperKey(key)}:${iv}`);

  const tab = await context.newPage();
  const lookups = watchLookups(tab);
  await tab.goto(tampered);
  await expect(tab.locator("#confirm-yes")).toBeVisible();

  await tab.locator("#confirm-yes").click();
  await expect(tab.locator("#not-found")).toBeVisible();
  await expect(tab.locator("#decrypt-failed")).toBeVisible();
  await expect(tab.locator("#decrypt-failed")).toContainText(
    "no longer available",
  );
  await expect(tab.locator("#confirm")).toBeHidden();
  await expect(tab.locator("#view")).toBeHidden();
  await expect(tab.locator("#error")).toBeHidden();
  expect(new URL(tab.url()).hash).toBe("");
  expect(lookups.some((call) => call.method === "GET")).toBe(true);

  const consumed = await context.newPage();
  await consumed.goto(shareUrl);
  await expect(consumed.locator("#not-found")).toBeVisible();
  await expect(consumed.locator("#confirm")).toBeHidden();
});

test("an obviously invalid key never calls GET", async ({ page }) => {
  const shareUrl = await createShareLink(page, "correct horse battery staple");
  const { id, iv } = shareParts(shareUrl);
  const lookups = watchLookups(page);

  await page.goto(withFragment(shareUrl, `${id}:not-valid-base64!:${iv}`));
  await expect(page.locator("#not-found")).toBeVisible();
  await expect(page.locator("#confirm")).toBeHidden();
  expect(lookups).toEqual([]);

  await page.goto(shareUrl);
  await expect(page.locator("#confirm-yes")).toBeVisible();
});

function watchLookups(page: Page): { method: string; url: string }[] {
  const lookups: { method: string; url: string }[] = [];
  page.on("request", (request) => {
    const method = request.method();
    if (
      (method === "GET" || method === "HEAD") &&
      /\/api\/password\//.test(request.url())
    ) {
      lookups.push({ method, url: request.url() });
    }
  });
  return lookups;
}

function shareParts(shareUrl: string): { id: string; key: string; iv: string } {
  const fragment = new URL(shareUrl).hash.replace(/^#/, "");
  const [id, key, iv] = fragment.split(":");
  expect(id).toMatch(/^[A-Za-z]{24}$/);
  expect(key).toBeTruthy();
  expect(iv).toBeTruthy();
  return { id: id!, key: key!, iv: iv! };
}

function withFragment(shareUrl: string, fragment: string): string {
  const url = new URL(shareUrl);
  url.hash = fragment;
  return url.toString();
}

function tamperKey(key: string): string {
  const bytes = Uint8Array.from(atob(key), (char) => char.charCodeAt(0));
  bytes[0] ^= 0xff;
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
