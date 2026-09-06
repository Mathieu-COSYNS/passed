/** Isolated from app data on DB 0 and from store cap tests on DB 15. */
export const TEST_REDIS_DB = 14;

/** Small finite cap so POST 507 is testable without filling the default 4096. */
export const TEST_MAX_SECRETS = 2;

export function redisUrlWithDb(url: string, db: number): string {
  const parsed = new URL(url);
  parsed.pathname = `/${db}`;
  return parsed.toString();
}

/**
 * Apply test Redis DB and cap before the Nitro worker boots.
 * Vitest `globalSetup` runs in a different process than setupFiles, so this
 * must also run in the worker or the HTTP suite would fill the production cap.
 */
export function applyTestEnv(): void {
  const redisUrl =
    process.env.PASSED_STORE_REDIS_URL ??
    process.env.REDIS_URL ??
    "redis://127.0.0.1:6379";
  process.env.PASSED_STORE_TYPE ??= "redis";
  process.env.PASSED_STORE_REDIS_URL = redisUrlWithDb(redisUrl, TEST_REDIS_DB);
  process.env.PASSED_MAX_SECRETS = String(TEST_MAX_SECRETS);
}
