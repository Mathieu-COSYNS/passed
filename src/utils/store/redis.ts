import { createClient } from "@redis/client";
import { RedisStore, type SecretStore } from "./common";

class NodeRedisStore extends RedisStore {
  protected readonly pingLabel = "Redis";
  private readonly redis: ReturnType<typeof createClient>;

  constructor(url: string, maxSecrets: number) {
    super(maxSecrets);
    this.redis = createClient({ url });
    this.redis.on("error", (error) => {
      console.error("[redis]", error.message);
    });
  }

  protected override async ready(): Promise<void> {
    if (!this.redis.isOpen) {
      await this.redis.connect();
      this.redis.unref();
    }
  }

  protected pingRaw(): Promise<string> {
    return this.redis.ping();
  }

  protected async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  protected eval(
    script: string,
    keys: string[],
    args: string[],
  ): Promise<unknown> {
    return this.redis.eval(script, { keys, arguments: args });
  }

  override async close(): Promise<void> {
    try {
      if (this.redis.isOpen) {
        this.redis.destroy();
      }
    } catch {
      // Already closed.
    }
  }
}

export function createRedisStore(url: string, maxSecrets: number): SecretStore {
  return new NodeRedisStore(url, maxSecrets);
}
