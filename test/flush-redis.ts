import { beforeEach } from "vitest";
import { createClient } from "@redis/client";
import { applyTestEnv } from "./test-env";

applyTestEnv();

const REDIS_URL = process.env.PASSED_STORE_REDIS_URL;

if (!REDIS_URL) {
  throw new Error(
    "Compose test runtime is missing. Run tests via pnpm test so globalSetup starts Docker Compose.",
  );
}

export async function flushTestRedis(): Promise<void> {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  try {
    await redis.flushDb();
  } finally {
    redis.destroy();
  }
}

// nitro-test-utils sets isolate: false. setupFiles re-run per file, and
// beforeEach must be registered each time or later files never flush.
if (process.env.VITEST) {
  beforeEach(async () => {
    await flushTestRedis();
  });
}
