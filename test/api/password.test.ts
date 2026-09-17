import { createClient } from "@redis/client";
import { injectNitroFetch } from "nitro-test-utils/e2e";
import { describe, expect, it } from "vitest";
import { env } from "~/env";
import { TEST_MAX_SECRETS } from "../test-env";

const ORIGIN = "http://example.com";

function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  return Promise.resolve(
    injectNitroFetch()(new Request(`${ORIGIN}${path}`, init)),
  );
}

function createBody(password: string, expiresIn: number, view?: number) {
  return JSON.stringify({
    password,
    "expires-in": expiresIn,
    ...(view === undefined ? {} : { view }),
  });
}

async function createShare(
  password = "ciphertext",
  expiresIn = 3600,
): Promise<string> {
  const res = await fetchApi("/api/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: createBody(password, expiresIn),
  });
  expect(res.status).toBe(200);
  expectNoCache(res);
  const id: unknown = await res.json();
  expect(id).toMatch(/^[A-Za-z]{24}$/);
  return id as string;
}

function expectNoCache(res: Response): void {
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("pragma")).toBe("no-cache");
}

function expectShareMeta(
  res: Response,
  remainingViews: number,
  expiresIn?: { min: number; max: number },
): void {
  expect(res.headers.get("x-remaining-views")).toBe(String(remainingViews));
  const expires = Number(res.headers.get("x-expires-in"));
  expect(Number.isInteger(expires)).toBe(true);
  if (expiresIn == null) {
    expect(expires).toBeGreaterThanOrEqual(0);
    return;
  }
  expect(expires).toBeGreaterThanOrEqual(expiresIn.min);
  expect(expires).toBeLessThanOrEqual(expiresIn.max);
}

function expectSecurityHeaders(res: Response): void {
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  expect(res.headers.get("x-frame-options")).toBe("DENY");

  const csp = res.headers.get("content-security-policy") ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("style-src 'self'");
  expect(csp).not.toMatch(/style-src[^;]*unsafe-inline/);
  expect(csp).toContain("frame-ancestors 'none'");
}

const INDEX_KEY = "passed:index";

async function liveSecretKeys(): Promise<string[]> {
  if (env.store.type !== "redis") {
    throw new Error("secret cap API tests require Redis");
  }
  const redis = createClient({ url: env.store.url });
  await redis.connect();
  try {
    const keys = await redis.keys("passed:*");
    return keys.filter((key) => key !== INDEX_KEY).sort();
  } finally {
    redis.destroy();
  }
}

describe("POST /api/password", () => {
  it("stores ciphertext and returns a 24-letter id", async () => {
    const id = await createShare("secret-bytes", 3600);
    expect(id).toMatch(/^[A-Za-z]{24}$/);
  });

  it("accepts the frontend payload without a Content-Type header", async () => {
    const res = await fetchApi("/api/password", {
      method: "POST",
      body: createBody("frontend-ciphertext", 60),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(expect.any(String));
  });

  it("rejects a missing password", async () => {
    const res = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ "expires-in": 60 }),
    });
    expect(res.status).toBe(400);
    expectNoCache(res);
    await expect(res.text()).resolves.toMatch(/password is required/);
  });

  it("rejects an empty password", async () => {
    const res = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody("", 60),
    });
    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toMatch(/password is required/);
  });

  it("rejects a missing or non-positive expires-in", async () => {
    const missing = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "x" }),
    });
    const zero = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody("x", 0),
    });
    expect(missing.status).toBe(400);
    await expect(missing.text()).resolves.toMatch(
      /expires-in must be a positive integer number of seconds/,
    );
    expect(zero.status).toBe(400);
    await expect(zero.text()).resolves.toMatch(
      /expires-in must be a positive integer number of seconds/,
    );
  });

  it("rejects expires-in longer than 2 weeks", async () => {
    const twoWeeks = 14 * 24 * 60 * 60;
    const ok = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody("x", twoWeeks),
    });
    const tooLong = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody("x", twoWeeks + 1),
    });
    expect(ok.status).toBe(200);
    expect(tooLong.status).toBe(400);
    await expect(tooLong.text()).resolves.toMatch(
      /expires-in must be at most 1209600 seconds \(2 weeks\)/,
    );
  });

  it("rejects ciphertext longer than the configured maximum", async () => {
    const res = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody("x".repeat(12_289), 60),
    });
    expect(res.status).toBe(400);
    expectNoCache(res);
    await expect(res.text()).resolves.toMatch(
      /password must be at most 12288 characters/,
    );
  });

  it("rejects a fractional expires-in", async () => {
    const res = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "x", "expires-in": 1.5 }),
    });
    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toMatch(
      /expires-in must be a positive integer number of seconds/,
    );
  });

  it("rejects a request body larger than the ciphertext budget", async () => {
    const res = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody("x".repeat(20_000), 60),
    });
    expect(res.status).toBe(413);
  });

  it("rejects a non-positive view", async () => {
    const zero = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody("x", 60, 0),
    });
    const fractional = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "x", "expires-in": 60, view: 1.5 }),
    });
    expect(zero.status).toBe(400);
    await expect(zero.text()).resolves.toMatch(
      /view must be a positive integer/,
    );
    expect(fractional.status).toBe(400);
    await expect(fractional.text()).resolves.toMatch(
      /view must be a positive integer/,
    );
  });

  it("accepts a string view count", async () => {
    const res = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: "x",
        "expires-in": 60,
        view: "2",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects a view count above the maximum", async () => {
    const maxViews = 10;
    const ok = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody("x", 60, maxViews),
    });
    const tooMany = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody("x", 60, maxViews + 1),
    });
    expect(ok.status).toBe(200);
    expect(tooMany.status).toBe(400);
    await expect(tooMany.text()).resolves.toMatch(/view must be at most 10/);
  });
});

describe("HEAD /api/password/:id", () => {
  it("returns 204 for a stored secret without consuming it", async () => {
    const id = await createShare("still-there");
    const head = await fetchApi(`/api/password/${id}`, { method: "HEAD" });
    expect(head.status).toBe(204);
    expectNoCache(head);
    expectShareMeta(head, 1, { min: 3500, max: 3600 });

    const again = await fetchApi(`/api/password/${id}`, { method: "HEAD" });
    expect(again.status).toBe(204);
    expectShareMeta(again, 1, { min: 3500, max: 3600 });

    const get = await fetchApi(`/api/password/${id}`);
    expect(get.status).toBe(200);
    await expect(get.json()).resolves.toBe("still-there");
    expectShareMeta(get, 0, { min: 0, max: 0 });
  });

  it("returns 404 for an invalid id", async () => {
    const res = await fetchApi("/api/password/invalid-id", { method: "HEAD" });
    expect(res.status).toBe(404);
    expectNoCache(res);
  });

  it("returns 404 for a traversal-like id", async () => {
    const res = await fetchApi("/api/password/..%2F..%2Fsecrets", {
      method: "HEAD",
    });
    expect(res.status).toBe(404);
  });

  it("does not allow caches to store a 404 for an unknown share", async () => {
    const res = await fetchApi("/api/password/abcdefghijklmnopqrstuvwx", {
      method: "HEAD",
    });
    expect(res.status).toBe(404);
    expectNoCache(res);
  });
});

describe("GET /api/password/:id", () => {
  it("returns ciphertext once and then deletes it", async () => {
    const id = await createShare("one-time");
    const first = await fetchApi(`/api/password/${id}`);
    expect(first.status).toBe(200);
    expectNoCache(first);
    await expect(first.json()).resolves.toBe("one-time");
    expectShareMeta(first, 0, { min: 0, max: 0 });

    const second = await fetchApi(`/api/password/${id}`);
    expect(second.status).toBe(404);
    expectNoCache(second);

    const head = await fetchApi(`/api/password/${id}`, { method: "HEAD" });
    expect(head.status).toBe(404);
    expectNoCache(head);
  });

  it("returns ciphertext to exactly one concurrent GET", async () => {
    const id = await createShare("raced");
    const [first, second] = await Promise.all([
      fetchApi(`/api/password/${id}`),
      fetchApi(`/api/password/${id}`),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 404]);

    const winner = first.status === 200 ? first : second;
    const loser = first.status === 404 ? first : second;
    expectNoCache(winner);
    expectNoCache(loser);
    await expect(winner.json()).resolves.toBe("raced");
  });

  it("returns ciphertext for each remaining view", async () => {
    const create = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody("multi", 3600, 3),
    });
    expect(create.status).toBe(200);
    const id: unknown = await create.json();
    expect(id).toMatch(/^[A-Za-z]{24}$/);

    const first = await fetchApi(`/api/password/${id}`);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toBe("multi");
    expectShareMeta(first, 2, { min: 3500, max: 3600 });

    const head = await fetchApi(`/api/password/${id}`, { method: "HEAD" });
    expect(head.status).toBe(204);
    expectShareMeta(head, 2, { min: 3500, max: 3600 });

    const second = await fetchApi(`/api/password/${id}`);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toBe("multi");
    expectShareMeta(second, 1, { min: 3500, max: 3600 });

    const third = await fetchApi(`/api/password/${id}`);
    expect(third.status).toBe(200);
    await expect(third.json()).resolves.toBe("multi");
    expectShareMeta(third, 0, { min: 0, max: 0 });

    const gone = await fetchApi(`/api/password/${id}`);
    expect(gone.status).toBe(404);
    expectNoCache(gone);
  });

  it("returns 404 for an invalid id", async () => {
    const res = await fetchApi("/api/password/invalid-id");
    expect(res.status).toBe(404);
    expectNoCache(res);
  });

  it("returns 404 for a traversal-like id", async () => {
    const id = await createShare("untouched");
    const res = await fetchApi("/api/password/..%2F..%2Fsecrets");
    expect(res.status).toBe(404);
    expectNoCache(res);

    const again = await fetchApi("/api/password/..%2F..%2Fsecrets");
    expect(again.status).toBe(404);

    const get = await fetchApi(`/api/password/${id}`);
    expect(get.status).toBe(200);
    await expect(get.json()).resolves.toBe("untouched");
  });

  it("does not allow caches to store a 404 for an unknown share", async () => {
    const res = await fetchApi("/api/password/abcdefghijklmnopqrstuvwx");
    expect(res.status).toBe(404);
    expectNoCache(res);
  });
});

describe("POST /api/password secret cap", () => {
  it("returns 200 while under the cap", async () => {
    expect(env.PASSED_MAX_SECRETS).toBe(TEST_MAX_SECRETS);
    for (let i = 0; i < TEST_MAX_SECRETS; i++) {
      await createShare(`under-cap-${i}`);
    }
  });

  it("returns 507 when the cap is full and does not store the rejected share", async () => {
    expect(env.PASSED_MAX_SECRETS).toBe(TEST_MAX_SECRETS);
    const ids: string[] = [];
    for (let i = 0; i < TEST_MAX_SECRETS; i++) {
      ids.push(await createShare(`cap-${i}`));
    }

    const keysBeforeReject = await liveSecretKeys();
    expect(keysBeforeReject).toHaveLength(TEST_MAX_SECRETS);

    const rejected = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody("one-too-many", 3600),
    });
    expect(rejected.status).toBe(507);
    expectNoCache(rejected);
    await expect(rejected.text()).resolves.toMatch(/Capacity limit reached/);
    await expect(liveSecretKeys()).resolves.toEqual(keysBeforeReject);

    for (const id of ids) {
      const head = await fetchApi(`/api/password/${id}`, { method: "HEAD" });
      expect(head.status).toBe(204);
    }
  });
});

describe("secret expiry", () => {
  it("treats an expired secret as missing", async () => {
    const id = await createShare("soon-gone", 1);
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const head = await fetchApi(`/api/password/${id}`, { method: "HEAD" });
    expect(head.status).toBe(404);
    expectNoCache(head);

    const get = await fetchApi(`/api/password/${id}`);
    expect(get.status).toBe(404);
    expectNoCache(get);
  });

  it("returns 404 on GET of an expired secret with no prior HEAD", async () => {
    const id = await createShare("quietly-gone", 1);
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const get = await fetchApi(`/api/password/${id}`);
    expect(get.status).toBe(404);
    expectNoCache(get);
  });
});

describe("security headers", () => {
  it("sends CSP, nosniff, referrer policy, and frame denial on HTML documents", async () => {
    const res = await fetchApi("/");
    expectSecurityHeaders(res);
  });

  it("sends nosniff and the same security headers on API JSON", async () => {
    const post = await fetchApi("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ "expires-in": 60 }),
    });
    expect(post.status).toBe(400);
    expectNoCache(post);
    expectSecurityHeaders(post);

    const get = await fetchApi("/api/password/abcdefghijklmnopqrstuvwx");
    expect(get.status).toBe(404);
    expectNoCache(get);
    expectSecurityHeaders(get);
  });
});
