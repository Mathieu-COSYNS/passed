import { definePlugin } from "nitro";
import { createStore } from "#passed/store";
import { env } from "~/env";
import type { SecretStore } from "~/utils/store/common";

let store: SecretStore | undefined;

export function useStore(): SecretStore {
  if (!store) {
    throw new Error("store is not initialized");
  }
  return store;
}

export default definePlugin(async (nitroApp) => {
  const next = await createStore(env.store, env.PASSED_MAX_SECRETS);
  try {
    await next.ping();
  } catch (error) {
    await next.close();
    throw error;
  }
  store = next;

  nitroApp.hooks.hook("close", () => {
    store = undefined;
    void next.close();
  });
});
