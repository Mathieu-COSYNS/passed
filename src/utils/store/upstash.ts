import { Redis as UpstashRedis } from "@upstash/redis";
import { RedisStore, type SecretStore } from "./common";

class UpstashRedisStore extends RedisStore {
  protected readonly pingLabel = "Upstash";
  private readonly redis: UpstashRedis;
  private readonly scripts = new Map<
    string,
    { eval(keys: string[], args: string[]): Promise<unknown> }
  >();

  constructor(url: string, token: string, maxSecrets: number) {
    super(maxSecrets);
    this.redis = new UpstashRedis({ url, token });
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
    let compiled = this.scripts.get(script);
    if (!compiled) {
      compiled = this.redis.createScript<unknown>(script);
      this.scripts.set(script, compiled);
    }
    return compiled.eval(keys, args);
  }
}

export function createUpstashStore(
  url: string,
  token: string,
  maxSecrets: number,
): SecretStore {
  return new UpstashRedisStore(url, token, maxSecrets);
}
