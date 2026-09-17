import { definePlugin } from "nitro";
import { createStore } from "#passed/store";
import { env } from "~/env";
import type { SecretStore } from "~/utils/store/common";
import { createLazyStore } from "~/utils/store/lazy";

const lazy = createLazyStore(async () => {
  const next = await createStore(env.store, env.PASSED_MAX_SECRETS);
  try {
    await next.ping();
    return next;
  } catch (error) {
    await next.close();
    throw error;
  }
});

export function useStore(): Promise<SecretStore> {
  return lazy.get();
}

export default definePlugin((nitroApp) => {
  void lazy.get();

  nitroApp.hooks.hook("close", () => lazy.close());
});
