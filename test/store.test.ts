import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@redis/client";
import { env } from "../src/env";
import type { SecretStore } from "../src/utils/store/common";
import { createRedisStore } from "../src/utils/store/redis";

function uniqueId(label: string): string {
  return `${label}${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 24);
}

function redisUrlWithDb(url: string, db: number): string {
  const parsed = new URL(url);
  parsed.pathname = `/${db}`;
  return parsed.toString();
}

async function flushRedis(url: string): Promise<void> {
  const redis = createClient({ url });
  await redis.connect();
  try {
    await redis.flushDb();
  } finally {
    redis.destroy();
  }
}

let store: SecretStore;

beforeAll(async () => {
  if (env.store.type !== "redis") {
    throw new Error("store tests require Redis");
  }
  store = createRedisStore(env.store.url, env.PASSED_MAX_SECRETS);
  await store.ping();
});

afterAll(async () => {
  await store.close();
});

describe("encrypted secret store", () => {
  it("defaults to a single view and then deletes the share", async () => {
    const id = uniqueId("default");
    await store.setEncryptedSecret(id, "once", 3600);

    await expect(store.hasEncryptedSecret(id)).resolves.toBe(true);
    await expect(store.viewEncryptedSecret(id)).resolves.toBe("once");
    await expect(store.viewEncryptedSecret(id)).resolves.toBeNull();
    await expect(store.hasEncryptedSecret(id)).resolves.toBe(false);
  });

  it("allows the configured number of views before deleting", async () => {
    const id = uniqueId("multiview");
    await store.setEncryptedSecret(id, "shared", 3600, 3);

    await expect(store.viewEncryptedSecret(id)).resolves.toBe("shared");
    await expect(store.hasEncryptedSecret(id)).resolves.toBe(true);
    await expect(store.viewEncryptedSecret(id)).resolves.toBe("shared");
    await expect(store.hasEncryptedSecret(id)).resolves.toBe(true);
    await expect(store.viewEncryptedSecret(id)).resolves.toBe("shared");
    await expect(store.viewEncryptedSecret(id)).resolves.toBeNull();
    await expect(store.hasEncryptedSecret(id)).resolves.toBe(false);
  });

  it("expires a share even when views remain", async () => {
    const id = uniqueId("expired");
    await store.setEncryptedSecret(id, "too-late", 1, 9);
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await expect(store.hasEncryptedSecret(id)).resolves.toBe(false);
    await expect(store.viewEncryptedSecret(id)).resolves.toBeNull();
  });

  it("gives the ciphertext to exactly one concurrent take", async () => {
    const id = uniqueId("race");
    await store.setEncryptedSecret(id, "once", 3600);

    const results = await Promise.all([
      store.viewEncryptedSecret(id),
      store.viewEncryptedSecret(id),
    ]);

    expect(results.filter((value) => value === "once")).toHaveLength(1);
    expect(results.filter((value) => value == null)).toHaveLength(1);
    await expect(store.hasEncryptedSecret(id)).resolves.toBe(false);
  });

  it("allows exactly remainingViews concurrent takes", async () => {
    const id = uniqueId("races");
    await store.setEncryptedSecret(id, "shared", 3600, 2);

    const results = await Promise.all([
      store.viewEncryptedSecret(id),
      store.viewEncryptedSecret(id),
      store.viewEncryptedSecret(id),
    ]);

    expect(results.filter((value) => value === "shared")).toHaveLength(2);
    expect(results.filter((value) => value == null)).toHaveLength(1);
    await expect(store.hasEncryptedSecret(id)).resolves.toBe(false);
  });
});

describe("active secret cap", () => {
  const capDb = 15;
  let capped: SecretStore;
  let capUrl: string;

  afterAll(async () => {
    await capped.close();
    await flushRedis(capUrl);
  });

  beforeAll(async () => {
    if (env.store.type !== "redis") {
      throw new Error("active secret cap tests require Redis");
    }
    capUrl = redisUrlWithDb(env.store.url, capDb);
    capped = createRedisStore(capUrl, 2);
    await capped.ping();
  });

  beforeEach(async () => {
    await flushRedis(capUrl);
  });

  it("rejects a create that would exceed the cap", async () => {
    await expect(
      capped.setEncryptedSecret(uniqueId("cap1"), "a", 3600),
    ).resolves.toBe(true);
    await expect(
      capped.setEncryptedSecret(uniqueId("cap2"), "b", 3600),
    ).resolves.toBe(true);
    const extra = uniqueId("cap3");
    await expect(capped.setEncryptedSecret(extra, "c", 3600)).resolves.toBe(
      false,
    );
    await expect(capped.hasEncryptedSecret(extra)).resolves.toBe(false);
  });

  it("frees a slot when the last view consumes the share", async () => {
    const first = uniqueId("free1");
    await expect(capped.setEncryptedSecret(first, "a", 3600)).resolves.toBe(
      true,
    );
    await expect(
      capped.setEncryptedSecret(uniqueId("free2"), "b", 3600),
    ).resolves.toBe(true);
    await expect(
      capped.setEncryptedSecret(uniqueId("free3"), "c", 3600),
    ).resolves.toBe(false);

    await expect(capped.viewEncryptedSecret(first)).resolves.toBe("a");
    await expect(
      capped.setEncryptedSecret(uniqueId("free4"), "d", 3600),
    ).resolves.toBe(true);
  });

  it("keeps the slot until the last remaining view", async () => {
    const first = uniqueId("views");
    await expect(capped.setEncryptedSecret(first, "a", 3600, 2)).resolves.toBe(
      true,
    );
    await expect(
      capped.setEncryptedSecret(uniqueId("views2"), "b", 3600),
    ).resolves.toBe(true);

    await expect(capped.viewEncryptedSecret(first)).resolves.toBe("a");
    await expect(
      capped.setEncryptedSecret(uniqueId("views3"), "c", 3600),
    ).resolves.toBe(false);

    await expect(capped.viewEncryptedSecret(first)).resolves.toBe("a");
    await expect(
      capped.setEncryptedSecret(uniqueId("views4"), "d", 3600),
    ).resolves.toBe(true);
  });

  it("does not count expired shares toward the cap", async () => {
    await expect(
      capped.setEncryptedSecret(uniqueId("exp1"), "a", 1),
    ).resolves.toBe(true);
    await expect(
      capped.setEncryptedSecret(uniqueId("exp2"), "b", 1),
    ).resolves.toBe(true);
    await expect(
      capped.setEncryptedSecret(uniqueId("exp3"), "c", 3600),
    ).resolves.toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(
      capped.setEncryptedSecret(uniqueId("exp3"), "c", 3600),
    ).resolves.toBe(true);
  });

  it("does not store more than the cap under concurrent creates", async () => {
    const ids = Array.from({ length: 8 }, (_, i) => uniqueId(`ccon${i}`));
    const results = await Promise.all(
      ids.map((id) => capped.setEncryptedSecret(id, "x", 3600)),
    );

    expect(results.filter((stored) => stored)).toHaveLength(2);
    expect(results.filter((stored) => !stored)).toHaveLength(6);

    const live = await Promise.all(
      ids.map((id) => capped.hasEncryptedSecret(id)),
    );
    expect(live.filter(Boolean)).toHaveLength(2);
  });

  it("does not cap creates when max secrets is 0", async () => {
    const unlimited = createRedisStore(capUrl, 0);
    await unlimited.ping();
    try {
      for (let i = 0; i < 5; i++) {
        await expect(
          unlimited.setEncryptedSecret(uniqueId(`unl${i}`), "x", 3600),
        ).resolves.toBe(true);
      }
    } finally {
      await unlimited.close();
    }
  });
});
