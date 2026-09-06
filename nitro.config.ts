import "./src/env.ts";
import { fileURLToPath } from "node:url";
import { defineConfig } from "nitro";

const storeType = process.env.PASSED_STORE_TYPE;

function storeFile(name: string): string {
  return JSON.stringify(
    fileURLToPath(new URL(`./src/utils/store/${name}.ts`, import.meta.url)),
  );
}

function passedStoreVirtual(): string {
  if (storeType === "upstash") {
    return /* js */ `
import { createUpstashStore } from ${storeFile("upstash")};

export async function createStore(config, maxSecrets) {
  if (config.type !== "upstash") {
    throw new Error("This build only supports PASSED_STORE_TYPE=upstash");
  }
  return createUpstashStore(config.url, config.token, maxSecrets);
}
`;
  }
  if (storeType === "redis") {
    return /* js */ `
import { createRedisStore } from ${storeFile("redis")};

export async function createStore(config, maxSecrets) {
  if (config.type !== "redis") {
    throw new Error("This build only supports PASSED_STORE_TYPE=redis");
  }
  return createRedisStore(config.url, maxSecrets);
}
`;
  }
  return /* js */ `export { createStore } from ${storeFile("runtime-factory")};`;
}

export default defineConfig({
  serverDir: "src",
  compatibilityDate: "2026-01-01",
  virtual: {
    "#passed/store": passedStoreVirtual,
  },
});
