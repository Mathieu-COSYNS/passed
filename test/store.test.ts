import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@redis/client";
import { env } from "../src/env";
import type { SecretStore } from "../src/utils/store/common";
import { createRedisStore } from "../src/utils/store/redis";
import { createUpstashStore } from "../src/utils/store/upstash";
import { CAP_REDIS_DB, redisUrlWithDb, STORE_REDIS_DB } from "./test-env";

const redisUrl = process.env.PASSED_STORE_REDIS_URL;
const upstashUrl = process.env.PASSED_STORE_UPSTASH_URL;
const upstashCapUrl = process.env.PASSED_STORE_UPSTASH_CAP_URL;
const upstashToken = process.env.PASSED_STORE_UPSTASH_TOKEN;

if (!redisUrl || !upstashUrl || !upstashCapUrl || !upstashToken) {
  throw new Error(
    "Compose test runtime is missing. Run tests via pnpm test so globalSetup starts Docker Compose.",
  );
}

const storeRedisUrl = redisUrlWithDb(redisUrl, STORE_REDIS_DB);
const capRedisUrl = redisUrlWithDb(redisUrl, CAP_REDIS_DB);

function uniqueId(label: string): string {
  return `${label}${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 24);
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

function defineEncryptedSecretStoreTests(
  getStore: () => SecretStore,
  flush: () => Promise<void>,
): void {
  describe("encrypted secret store", () => {
    beforeEach(async () => {
      await flush();
    });

    it("defaults to a single view and then deletes the share", async () => {
      const store = getStore();
      const id = uniqueId("default");
      await store.setEncryptedSecret(id, "once", 3600);

      await expect(store.hasEncryptedSecret(id)).resolves.toBe(true);
      await expect(store.viewEncryptedSecret(id)).resolves.toBe("once");
      await expect(store.viewEncryptedSecret(id)).resolves.toBeNull();
      await expect(store.hasEncryptedSecret(id)).resolves.toBe(false);
    });

    it("allows the configured number of views before deleting", async () => {
      const store = getStore();
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
      const store = getStore();
      const id = uniqueId("expired");
      await store.setEncryptedSecret(id, "too-late", 1, 9);
      await new Promise((resolve) => setTimeout(resolve, 1100));

      await expect(store.hasEncryptedSecret(id)).resolves.toBe(false);
      await expect(store.viewEncryptedSecret(id)).resolves.toBeNull();
    });

    it("gives the ciphertext to exactly one concurrent take", async () => {
      const store = getStore();
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
      const store = getStore();
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
}

function defineActiveSecretCapTests(options: {
  createStore: (maxSecrets: number) => SecretStore;
  flush: () => Promise<void>;
}): void {
  describe("active secret cap", () => {
    let capped: SecretStore;

    afterAll(async () => {
      await capped.close();
      await options.flush();
    });

    beforeAll(async () => {
      capped = options.createStore(2);
      await capped.ping();
    });

    beforeEach(async () => {
      await options.flush();
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
      await expect(
        capped.setEncryptedSecret(first, "a", 3600, 2),
      ).resolves.toBe(true);
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
      const unlimited = options.createStore(0);
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
}

describe("redis store", () => {
  let store: SecretStore;

  beforeAll(async () => {
    store = createRedisStore(storeRedisUrl, env.PASSED_MAX_SECRETS);
    await store.ping();
  });

  afterAll(async () => {
    await store.close();
  });

  defineEncryptedSecretStoreTests(
    () => store,
    () => flushRedis(storeRedisUrl),
  );

  defineActiveSecretCapTests({
    createStore: (maxSecrets) => createRedisStore(capRedisUrl, maxSecrets),
    flush: () => flushRedis(capRedisUrl),
  });
});

describe("upstash store", () => {
  let store: SecretStore;

  beforeAll(async () => {
    store = createUpstashStore(
      upstashUrl,
      upstashToken,
      env.PASSED_MAX_SECRETS,
    );
    await store.ping();
  });

  afterAll(async () => {
    await store.close();
  });

  defineEncryptedSecretStoreTests(
    () => store,
    () => flushRedis(storeRedisUrl),
  );

  defineActiveSecretCapTests({
    createStore: (maxSecrets) =>
      createUpstashStore(upstashCapUrl, upstashToken, maxSecrets),
    flush: () => flushRedis(capRedisUrl),
  });
});
