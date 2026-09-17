import { describe, expect, it } from "vitest";
import type { SecretStore } from "../src/utils/store/common";
import { createLazyStore } from "../src/utils/store/lazy";

function fakeStore(overrides?: Partial<SecretStore>): SecretStore {
  return {
    ping: async () => {},
    close: async () => {},
    setEncryptedSecret: async () => true,
    hasEncryptedSecret: async () => false,
    peekEncryptedSecret: async () => null,
    viewEncryptedSecret: async () => null,
    ...overrides,
  };
}

describe("createLazyStore", () => {
  it("lets concurrent getters wait for a single in-flight init", async () => {
    let created = 0;
    let finish!: (store: SecretStore) => void;
    const lazy = createLazyStore(
      () =>
        new Promise<SecretStore>((resolve) => {
          created += 1;
          finish = resolve;
        }),
    );

    const first = lazy.get();
    const second = lazy.get();
    expect(created).toBe(1);

    const store = fakeStore();
    finish(store);

    await expect(Promise.all([first, second])).resolves.toEqual([store, store]);
    expect(created).toBe(1);
  });

  it("retries after a failed init", async () => {
    let calls = 0;
    const store = fakeStore();
    const lazy = createLazyStore(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("ping failed");
      }
      return store;
    });

    await expect(lazy.get()).rejects.toThrow("ping failed");
    await expect(lazy.get()).resolves.toBe(store);
    expect(calls).toBe(2);
  });
});
