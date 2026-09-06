import type { StoreConfig } from "~/env";
import type { SecretStore } from "./common";

export async function createStore(
  config: StoreConfig,
  maxSecrets: number,
): Promise<SecretStore> {
  switch (config.type) {
    case "redis": {
      const { createRedisStore } = await import("./redis");
      return createRedisStore(config.url, maxSecrets);
    }
    case "upstash": {
      const { createUpstashStore } = await import("./upstash");
      return createUpstashStore(config.url, config.token, maxSecrets);
    }
  }
}
