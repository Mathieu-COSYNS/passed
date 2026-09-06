import { describe, expect, it } from "vitest";
import { createPassedEnv } from "../src/env";

describe("store env validation", () => {
  it("defaults to redis on localhost", () => {
    expect(createPassedEnv({}).store).toEqual({
      type: "redis",
      url: "redis://127.0.0.1:6379",
    });
  });

  it("defaults to a finite active secret cap", () => {
    expect(createPassedEnv({}).PASSED_MAX_SECRETS).toBe(4096);
  });

  it("treats an explicit max of 0 as unlimited", () => {
    expect(
      createPassedEnv({ PASSED_MAX_SECRETS: "0" }).PASSED_MAX_SECRETS,
    ).toBe(0);
  });

  it("rejects a negative active secret cap", () => {
    expect(() => createPassedEnv({ PASSED_MAX_SECRETS: "-1" })).toThrow();
  });

  it("rejects ram and dir store types", () => {
    expect(() => createPassedEnv({ PASSED_STORE_TYPE: "ram" })).toThrow();
    expect(() => createPassedEnv({ PASSED_STORE_TYPE: "dir" })).toThrow();
  });

  it("rejects upstash without URL and token", () => {
    expect(() => createPassedEnv({ PASSED_STORE_TYPE: "upstash" })).toThrow(
      /PASSED_STORE_UPSTASH_URL or UPSTASH_REDIS_REST_URL.*PASSED_STORE_UPSTASH_TOKEN or UPSTASH_REDIS_REST_TOKEN/,
    );
  });

  it("rejects upstash without PASSED_STORE_UPSTASH_URL", () => {
    expect(() =>
      createPassedEnv({
        PASSED_STORE_TYPE: "upstash",
        PASSED_STORE_UPSTASH_TOKEN: "token",
      }),
    ).toThrow(/PASSED_STORE_UPSTASH_URL or UPSTASH_REDIS_REST_URL/);
  });

  it("rejects upstash without PASSED_STORE_UPSTASH_TOKEN", () => {
    expect(() =>
      createPassedEnv({
        PASSED_STORE_TYPE: "upstash",
        PASSED_STORE_UPSTASH_URL: "https://example.upstash.io",
      }),
    ).toThrow(/PASSED_STORE_UPSTASH_TOKEN or UPSTASH_REDIS_REST_TOKEN/);
  });

  it("accepts redis when PASSED_STORE_REDIS_URL is set", () => {
    const env = createPassedEnv({
      PASSED_STORE_TYPE: "redis",
      PASSED_STORE_REDIS_URL: "redis://127.0.0.1:6379",
    });
    expect(env.store).toEqual({
      type: "redis",
      url: "redis://127.0.0.1:6379",
    });
  });

  it("falls back to REDIS_URL when PASSED_STORE_REDIS_URL is unset", () => {
    const env = createPassedEnv({
      PASSED_STORE_TYPE: "redis",
      REDIS_URL: "redis://fallback:6379",
    });
    expect(env.store).toEqual({
      type: "redis",
      url: "redis://fallback:6379",
    });
  });

  it("prefers PASSED_STORE_REDIS_URL over REDIS_URL", () => {
    const env = createPassedEnv({
      PASSED_STORE_TYPE: "redis",
      PASSED_STORE_REDIS_URL: "redis://passed:6379",
      REDIS_URL: "redis://fallback:6379",
    });
    expect(env.store).toEqual({
      type: "redis",
      url: "redis://passed:6379",
    });
  });

  it("accepts upstash when URL and token are set", () => {
    const env = createPassedEnv({
      PASSED_STORE_TYPE: "upstash",
      PASSED_STORE_UPSTASH_URL: "https://example.upstash.io",
      PASSED_STORE_UPSTASH_TOKEN: "token",
    });
    expect(env.store).toEqual({
      type: "upstash",
      url: "https://example.upstash.io",
      token: "token",
    });
  });

  it("falls back to UPSTASH_REDIS_REST_* when PASSED_STORE_UPSTASH_* are unset", () => {
    const env = createPassedEnv({
      PASSED_STORE_TYPE: "upstash",
      UPSTASH_REDIS_REST_URL: "https://fallback.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "rest-token",
    });
    expect(env.store).toEqual({
      type: "upstash",
      url: "https://fallback.upstash.io",
      token: "rest-token",
    });
  });

  it("mixes PASSED_STORE_UPSTASH_* with UPSTASH_REDIS_REST_* fallbacks", () => {
    const env = createPassedEnv({
      PASSED_STORE_TYPE: "upstash",
      PASSED_STORE_UPSTASH_URL: "https://passed.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "rest-token",
    });
    expect(env.store).toEqual({
      type: "upstash",
      url: "https://passed.upstash.io",
      token: "rest-token",
    });
  });

  it("prefers PASSED_STORE_UPSTASH_* over UPSTASH_REDIS_REST_*", () => {
    const env = createPassedEnv({
      PASSED_STORE_TYPE: "upstash",
      PASSED_STORE_UPSTASH_URL: "https://passed.upstash.io",
      PASSED_STORE_UPSTASH_TOKEN: "passed-token",
      UPSTASH_REDIS_REST_URL: "https://fallback.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "rest-token",
    });
    expect(env.store).toEqual({
      type: "upstash",
      url: "https://passed.upstash.io",
      token: "passed-token",
    });
  });
});
