import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Isolated from app data on DB 0 and from store cap tests on DB 15. */
export const TEST_REDIS_DB = 14;

/** Store contract tests (Redis + Upstash). Isolated from API tests on DB 14. */
export const STORE_REDIS_DB = 13;

/** Dedicated Redis DB so cap tests do not share `passed:index` with API tests. */
export const CAP_REDIS_DB = 15;

/** Small finite cap so POST 507 is testable without filling the default 4096. */
export const TEST_MAX_SECRETS = 2;

export const COMPOSE_PROJECT = "passed-vitest";

export const SRH_TOKEN = "passed-vitest";

export const COMPOSE_FILE = fileURLToPath(new URL("./compose.yaml", import.meta.url));

export function redisUrlWithDb(url: string, db: number): string {
  const parsed = new URL(url);
  parsed.pathname = `/${db}`;
  return parsed.toString();
}

export function composeArgs(...args: string[]): string[] {
  return ["compose", "-p", COMPOSE_PROJECT, "-f", COMPOSE_FILE, ...args];
}

export function publishedEndpoint(service: string, containerPort: number): string {
  const stdout = execFileSync("docker", composeArgs("port", service, String(containerPort)), {
    encoding: "utf8",
  }).trim();
  const mapped = stdout.match(/:(\d+)\s*$/);
  if (!mapped) {
    throw new Error(
      `Could not resolve published port for ${service}:${containerPort} (got ${JSON.stringify(stdout)})`,
    );
  }
  return `127.0.0.1:${mapped[1]}`;
}

function hasComposeEnv(): boolean {
  return Boolean(
    process.env.PASSED_STORE_REDIS_URL &&
      process.env.PASSED_STORE_UPSTASH_URL &&
      process.env.PASSED_STORE_UPSTASH_CAP_URL &&
      process.env.PASSED_STORE_UPSTASH_TOKEN,
  );
}

function readComposeEnvFromDocker(): void {
  process.env.PASSED_STORE_REDIS_URL = `redis://${publishedEndpoint("redis", 6379)}`;
  process.env.PASSED_STORE_UPSTASH_URL = `http://${publishedEndpoint("srh", 80)}`;
  process.env.PASSED_STORE_UPSTASH_CAP_URL = `http://${publishedEndpoint("srh-cap", 80)}`;
  process.env.PASSED_STORE_UPSTASH_TOKEN = SRH_TOKEN;
}

/**
 * Copy mapped Compose endpoints into `process.env` when this process did not
 * start the stack (Vitest workers, Playwright tests).
 */
export function hydrateComposeEnv(): void {
  if (hasComposeEnv()) {
    return;
  }
  try {
    readComposeEnvFromDocker();
  } catch {
    throw new Error(
      "Compose test runtime is missing. Run tests via pnpm test / pnpm test:e2e so globalSetup starts Docker Compose.",
    );
  }
}

export function applyComposeEnv(): void {
  readComposeEnvFromDocker();
  applyTestEnv();
}

/**
 * Apply test Redis DB and cap before the Nitro worker boots.
 * Vitest `globalSetup` runs in a different process than setupFiles, so this
 * must also run in the worker or the HTTP suite would fill the production cap.
 */
export function applyTestEnv(): void {
  hydrateComposeEnv();

  const redisUrl = process.env.PASSED_STORE_REDIS_URL;
  if (
    !redisUrl ||
    !process.env.PASSED_STORE_UPSTASH_URL ||
    !process.env.PASSED_STORE_UPSTASH_CAP_URL ||
    !process.env.PASSED_STORE_UPSTASH_TOKEN
  ) {
    throw new Error(
      "Compose test runtime is missing. Run tests via pnpm test / pnpm test:e2e so globalSetup starts Docker Compose.",
    );
  }

  process.env.PASSED_STORE_TYPE ??= "redis";
  process.env.PASSED_STORE_REDIS_URL = redisUrlWithDb(redisUrl, TEST_REDIS_DB);
  process.env.PASSED_MAX_SECRETS = String(TEST_MAX_SECRETS);
}
