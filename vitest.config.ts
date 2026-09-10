import { defineConfig } from "nitro-test-utils/config";
import { TEST_MAX_SECRETS } from "./test/test-env.ts";

export default defineConfig(
  {
    resolve: { tsconfigPaths: true },
    test: {
      dir: "./test",
      exclude: ["**/e2e/**"],
      testTimeout: 15_000,
      env: {
        PASSED_MAX_SECRETS: String(TEST_MAX_SECRETS),
      },
      globalSetup: ["./test/global-setup.ts"],
      setupFiles: ["./test/flush-redis.ts"],
    },
  },
  { global: true },
);
