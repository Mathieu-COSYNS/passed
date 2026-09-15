import { expect, type Locator, type Page } from "@playwright/test";

export async function createShareLink(
  page: Page,
  password: string,
): Promise<string> {
  await page.goto("/");
  await expect(page.locator("#share-submit")).toHaveText("Share");
  await page.locator("#share-password").fill(password);
  await page.locator("#share-submit").click();
  await page.locator("#share-dialog").waitFor({ state: "visible" });
  const shareUrl = await page.locator("#share-link").inputValue();
  expect(shareUrl).toContain("#");
  return shareUrl;
}

export async function waitForRevealOutcome(page: Page): Promise<void> {
  await Promise.race([
    page.locator("#view-password").waitFor({ state: "visible" }),
    page.locator("#not-found").waitFor({ state: "visible" }),
    page.locator("#error").waitFor({ state: "visible" }),
  ]);
}

export async function expectScreenshot(
  page: Page,
  name: string,
  options: { mask?: Locator[] } = {},
): Promise<void> {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page).toHaveScreenshot(`${name}-${scheme}.png`, {
      fullPage: true,
      ...options,
    });
  }
}
