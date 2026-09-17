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
 * Read remaining views and TTL without consuming a view. Returns
 * { remainingViews, expiresIn }, or false if the share is missing.
 */
const PEEK_SECRET_LUA = `
local raw = redis.call('JSON.GET', KEYS[1])
if not raw then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return false
end
local remaining = tonumber(cjson.decode(raw).remainingViews)
if remaining == nil or remaining < 1 then
  return false
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  ttl = 0
end
return cjson.encode({ remaining, ttl })
`;

/**
 * Atomically consume one view. Deletes the key on the last view. Returns
 * { ciphertext, remainingViews after consume, expiresIn }, or false if the
 * share is missing.
 */
const VIEW_SECRET_LUA = `
local raw = redis.call('JSON.GET', KEYS[1])
if not raw then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return false
end
local doc = cjson.decode(raw)
local remaining = tonumber(doc.remainingViews)
if remaining == nil or remaining < 1 then
  redis.call('DEL', KEYS[1])
  redis.call('ZREM', KEYS[2], ARGV[1])
  return false
end
if remaining <= 1 then
  redis.call('DEL', KEYS[1])
  redis.call('ZREM', KEYS[2], ARGV[1])
  return cjson.encode({ doc.encryptedSecret, 0, 0 })
end
redis.call('JSON.NUMINCRBY', KEYS[1], '$.remainingViews', -1)
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  ttl = 0
end
return cjson.encode({ doc.encryptedSecret, remaining - 1, ttl })
`;

export type SecretMeta = {
  remainingViews: number;
  expiresIn: number;
};

export type ViewedSecret = SecretMeta & {
  encryptedSecret: string;
};

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
  peekEncryptedSecret(id: string): Promise<SecretMeta | null>;
  viewEncryptedSecret(id: string): Promise<ViewedSecret | null>;
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

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    return Number(value);
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) {
    return null;
  }
  return n;
}

function asTuple(result: unknown): unknown[] | null {
  if (result == null || result === false) {
    return null;
  }
  if (Array.isArray(result)) {
    return result;
  }
  if (
    typeof result === "string" ||
    (typeof Buffer !== "undefined" && Buffer.isBuffer(result))
  ) {
    const text = typeof result === "string" ? result : result.toString("utf8");
    try {
      const parsed: unknown = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function asSecretMeta(result: unknown): SecretMeta | null {
  const tuple = asTuple(result);
  if (tuple == null || tuple.length < 2) {
    return null;
  }
  const remainingViews = asNonNegativeInt(tuple[0]);
  const expiresIn = asNonNegativeInt(tuple[1]);
  if (remainingViews == null || remainingViews < 1 || expiresIn == null) {
    return null;
  }
  return { remainingViews, expiresIn };
}

function asViewedSecret(result: unknown): ViewedSecret | null {
  const tuple = asTuple(result);
  if (tuple == null || tuple.length < 3) {
    return null;
  }
  const encryptedSecret = asSecret(tuple[0]);
  const remainingViews = asNonNegativeInt(tuple[1]);
  const expiresIn = asNonNegativeInt(tuple[2]);
  if (encryptedSecret == null || remainingViews == null || expiresIn == null) {
    return null;
  }
  return { encryptedSecret, remainingViews, expiresIn };
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

  async peekEncryptedSecret(id: string): Promise<SecretMeta | null> {
    await this.ready();
    return asSecretMeta(
      await this.eval(PEEK_SECRET_LUA, [secretKey(id), INDEX_KEY], [id]),
    );
  }

  async viewEncryptedSecret(id: string): Promise<ViewedSecret | null> {
    await this.ready();
    return asViewedSecret(
      await this.eval(VIEW_SECRET_LUA, [secretKey(id), INDEX_KEY], [id]),
    );
  }

  async close(): Promise<void> {}
}
