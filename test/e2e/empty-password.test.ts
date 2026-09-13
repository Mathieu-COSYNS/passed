import { expect, test } from "@playwright/test";
import { flushTestRedis } from "../flush-redis.ts";

test.beforeEach(async () => {
  await flushTestRedis();
});

test("empty password never calls POST", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/password")) {
      posts.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await page.locator("#share-submit").click();
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.locator("#error-error")).toContainText("Password is required");
  await expect(page.locator("#share-dialog")).toBeHidden();
  expect(posts).toEqual([]);
});

test("invalid expiry is not posted as NaN", async ({ page }) => {
  const bodies: unknown[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/password")) {
      bodies.push(request.postDataJSON());
    }
  });

  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await page.locator("select[name=expires-in]").evaluate((select) => {
    for (const option of select.querySelectorAll("option")) {
      option.value = "nope";
    }
  });
  await page.locator("#share-password").fill("secret");
  await page.locator("#share-submit").click();
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.locator("#error-error")).toContainText("Expiry is invalid");
  expect(bodies).toEqual([]);
});
