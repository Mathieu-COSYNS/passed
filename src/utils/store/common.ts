const SECRET_KEY_PREFIX = "passed:";
const INDEX_KEY = `${SECRET_KEY_PREFIX}index`;

const SET_SECRET_LUA = `
local secret = KEYS[1]
local index = KEYS[2]
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local doc = ARGV[3]
local member = ARGV[4]
local now = tonumber(redis.call('TIME')[1])

if max > 0 then
  redis.call('ZREMRANGEBYSCORE', index, '-inf', now)
  if not redis.call('ZSCORE', index, member) then
    if redis.call('ZCARD', index) >= max then
      return 0
    end
  end
end

redis.call('JSON.SET', secret, '$', doc)
redis.call('EXPIRE', secret, ttl)

if max > 0 then
  redis.call('ZADD', index, now + ttl, member)
end

return 1
`;

/**
 * Atomically consume one view. Deletes the key on the last view. Returns the
 * ciphertext, or false if the share is missing.
 */
const VIEW_SECRET_LUA = `
local raw = redis.call('JSON.GET', KEYS[1])
if not raw then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return false
end
local doc = cjson.decode(raw)
if tonumber(doc.remainingViews) <= 1 then
  redis.call('DEL', KEYS[1])
  redis.call('ZREM', KEYS[2], ARGV[1])
else
  redis.call('JSON.NUMINCRBY', KEYS[1], '$.remainingViews', -1)
end
return doc.encryptedSecret
`;

export type SecretStore = {
  ping(): Promise<void>;
  close(): Promise<void>;
  setEncryptedSecret(
    id: string,
    encryptedSecret: string,
    expiresInSeconds: number,
    views?: number,
  ): Promise<boolean>;
  hasEncryptedSecret(id: string): Promise<boolean>;
  viewEncryptedSecret(id: string): Promise<string | null>;
};

function secretKey(id: string): string {
  return `${SECRET_KEY_PREFIX}${id}`;
}

function asSecret(result: unknown): string | null {
  if (result == null || result === false) {
    return null;
  }
  if (typeof result === "string") {
    return result.length > 0 ? result : null;
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(result)) {
    const text = result.toString("utf8");
    return text.length > 0 ? text : null;
  }
  return null;
}

function asStored(result: unknown): boolean {
  return result === 1 || result === true;
}

export abstract class RedisStore implements SecretStore {
  protected abstract readonly pingLabel: string;

  protected constructor(protected readonly maxSecrets: number) {}

  protected async ready(): Promise<void> {}

  protected abstract pingRaw(): Promise<string>;
  protected abstract exists(key: string): Promise<boolean>;
  protected abstract eval(
    script: string,
    keys: string[],
    args: string[],
  ): Promise<unknown>;

  async ping(): Promise<void> {
    await this.ready();
    const pong = await this.pingRaw();
    if (pong !== "PONG") {
      throw new Error(`${this.pingLabel} ping failed`);
    }
  }

  async setEncryptedSecret(
    id: string,
    encryptedSecret: string,
    expiresInSeconds: number,
    remainingViews = 1,
  ): Promise<boolean> {
    await this.ready();
    return asStored(
      await this.eval(
        SET_SECRET_LUA,
        [secretKey(id), INDEX_KEY],
        [
          String(this.maxSecrets),
          String(expiresInSeconds),
          JSON.stringify({
            encryptedSecret,
            remainingViews,
          }),
          id,
        ],
      ),
    );
  }

  async hasEncryptedSecret(id: string): Promise<boolean> {
    await this.ready();
    return this.exists(secretKey(id));
  }

  async viewEncryptedSecret(id: string): Promise<string | null> {
    await this.ready();
    return asSecret(
      await this.eval(VIEW_SECRET_LUA, [secretKey(id), INDEX_KEY], [id]),
    );
  }

  async close(): Promise<void> {}
}
