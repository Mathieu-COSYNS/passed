import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@redis/client";
import {
  applyComposeEnv,
  composeArgs,
  SRH_TOKEN,
} from "./test-env.ts";

const execFileAsync = promisify(execFile);

async function redisReady(url: string): Promise<boolean> {
  const redis = createClient({
    url,
    socket: { connectTimeout: 500, reconnectStrategy: false, family: 4 },
  });
  redis.on("error", () => {});
  try {
    await redis.connect();
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  } finally {
    try {
      if (redis.isOpen) redis.destroy();
    } catch {
      // Ignore.
    }
  }
}

async function srhReady(url: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["PING"]),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      return false;
    }
    const body = await response.json();
    return body?.result === "PONG";
  } catch {
    return false;
  }
}

async function waitUntil(ready: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await ready()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}

export async function stopCompose(): Promise<void> {
  try {
    await execFileAsync("docker", composeArgs("down", "-v", "--remove-orphans"));
  } catch {
    // Already down.
  }
  delete process.env.PASSED_STORE_REDIS_URL;
  delete process.env.PASSED_STORE_UPSTASH_URL;
  delete process.env.PASSED_STORE_UPSTASH_CAP_URL;
  delete process.env.PASSED_STORE_UPSTASH_TOKEN;
}

export async function startCompose(): Promise<void> {
  await stopCompose();
  await execFileAsync("docker", composeArgs("up", "-d", "--wait"));
  applyComposeEnv();

  const redisUrl = process.env.PASSED_STORE_REDIS_URL;
  const upstashUrl = process.env.PASSED_STORE_UPSTASH_URL;
  const upstashCapUrl = process.env.PASSED_STORE_UPSTASH_CAP_URL;
  if (!redisUrl || !upstashUrl || !upstashCapUrl) {
    throw new Error("Docker Compose did not publish Redis or SRH ports.");
  }

  await waitUntil(
    () => redisReady(redisUrl),
    `Redis did not become reachable at ${redisUrl}`,
  );
  await waitUntil(
    () => srhReady(upstashUrl, SRH_TOKEN),
    `SRH did not become reachable at ${upstashUrl}`,
  );
  await waitUntil(
    () => srhReady(upstashCapUrl, SRH_TOKEN),
    `SRH cap proxy did not become reachable at ${upstashCapUrl}`,
  );
}
