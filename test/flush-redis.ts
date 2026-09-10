import { beforeEach } from "vitest";
import { createClient } from "@redis/client";
import { applyTestEnv } from "./test-env";

applyTestEnv();

const REDIS_URL =
  process.env.PASSED_STORE_REDIS_URL ??
  process.env.REDIS_URL ??
  "redis://127.0.0.1:6379";

const g = globalThis as typeof globalThis & {
  __passedFlushRedis__?: boolean;
};

export async function flushTestRedis(): Promise<void> {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  try {
    await redis.flushDb();
  } finally {
    redis.destroy();
  }
}

// setupFiles re-run for every test file even with isolate: false.
if (process.env.VITEST && !g.__passedFlushRedis__) {
  g.__passedFlushRedis__ = true;
  beforeEach(async () => {
    await flushTestRedis();
  });
}
