import type { SecretStore } from "./common";

export type LazyStore = {
  get(): Promise<SecretStore>;
  close(): Promise<void>;
};

/** One in-flight init shared by concurrent callers; retries after failure. */
export function createLazyStore(
  factory: () => Promise<SecretStore>,
): LazyStore {
  let promise: Promise<SecretStore> | undefined;

  const get = (): Promise<SecretStore> => {
    promise ??= factory().catch((error: unknown) => {
      promise = undefined;
      throw error;
    });
    return promise;
  };

  return {
    get,
    async close() {
      const pending = promise;
      promise = undefined;
      if (!pending) {
        return;
      }
      const store = await pending.then(
        (value) => value,
        () => undefined,
      );
      await store?.close();
    },
  };
}
