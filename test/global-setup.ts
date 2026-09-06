import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@redis/client";
import { applyTestEnv } from "./test-env";

const execFileAsync = promisify(execFile);

const REDIS_URL =
  process.env.PASSED_STORE_REDIS_URL ??
  process.env.REDIS_URL ??
  "redis://127.0.0.1:6379";
const CONTAINER_NAME = "passed-vitest-redis";
const IMAGE = "redis:8-alpine";

async function pingRedis(): Promise<boolean> {
  const redis = createClient({
    url: REDIS_URL,
    socket: {
      family: 4,
      connectTimeout: 500,
      reconnectStrategy: false,
    },
  });
  redis.on("error", () => {});
  try {
    await redis.connect();
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  } finally {
    try {
      if (redis.isOpen) {
        redis.destroy();
      }
    } catch {
      // Ignore a client that never opened.
    }
  }
}

async function startRedisContainer(): Promise<void> {
  await execFileAsync("docker", [
    "run",
    "-d",
    "--rm",
    "--name",
    CONTAINER_NAME,
    "-p",
    "6379:6379",
    IMAGE,
  ]);
}

async function stopRedisContainer(): Promise<void> {
  try {
    await execFileAsync("docker", ["rm", "-f", CONTAINER_NAME]);
  } catch {
    // Already gone.
  }
}

async function waitForRedis(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await pingRedis()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Redis did not become ready at ${REDIS_URL}. Start Redis or allow Docker to pull ${IMAGE}.`,
  );
}

export default async function setup(): Promise<() => Promise<void>> {
  applyTestEnv();

  if (await pingRedis()) {
    return async () => {};
  }

  try {
    await startRedisContainer();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Redis is not reachable at ${REDIS_URL} and Docker failed to start ${IMAGE}: ${detail}`,
    );
  }

  await waitForRedis();

  return async () => {
    await stopRedisContainer();
  };
}
