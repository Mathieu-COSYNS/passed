import { createEnv, type StandardSchemaV1 } from "@t3-oss/env-core";
import { z } from "zod";

export type StoreConfig =
  | { type: "redis"; url: string }
  | { type: "upstash"; url: string; token: string };

type ParsedEnv = {
  PASSED_MAX_LENGTH: number;
  PASSED_MAX_SECRETS: number;
  PORT: number;
  NITRO_PORT?: number;
  store: StoreConfig;
};

export const createPassedEnv = (
  runtimeEnv: Record<string, string | boolean | number | undefined>,
  options?: { skipValidation?: boolean },
) =>
  createEnv({
    server: {
      PASSED_MAX_LENGTH: z.coerce.number().int().positive().default(12288),
      PASSED_MAX_SECRETS: z.coerce.number().int().min(0).default(4096),
      PASSED_STORE_TYPE: z.enum(["redis", "upstash"]).default("redis"),
      PASSED_STORE_REDIS_URL: z.string().min(1).optional(),
      REDIS_URL: z.string().min(1).optional(),
      PASSED_STORE_UPSTASH_URL: z.string().min(1).optional(),
      PASSED_STORE_UPSTASH_TOKEN: z.string().min(1).optional(),
      UPSTASH_REDIS_REST_URL: z.string().min(1).optional(),
      UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
      KV_REST_API_URL: z.string().min(1).optional(),
      KV_REST_API_TOKEN: z.string().min(1).optional(),
      PORT: z.coerce.number().int().positive().default(3000),
      NITRO_PORT: z.coerce.number().int().positive().optional(),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
    skipValidation: options?.skipValidation ?? false,
    createFinalSchema: (shape) =>
      z.object(shape).transform((data, ctx): ParsedEnv => {
        const rest = {
          PASSED_MAX_LENGTH: data.PASSED_MAX_LENGTH,
          PASSED_MAX_SECRETS: data.PASSED_MAX_SECRETS,
          PORT: data.PORT,
          NITRO_PORT: data.NITRO_PORT,
        };

        switch (data.PASSED_STORE_TYPE) {
          case "redis":
            return {
              ...rest,
              store: {
                type: "redis",
                url:
                  data.PASSED_STORE_REDIS_URL ??
                  data.REDIS_URL ??
                  "redis://127.0.0.1:6379",
              },
            };
          case "upstash": {
            const url =
              data.PASSED_STORE_UPSTASH_URL ??
              data.UPSTASH_REDIS_REST_URL ??
              data.KV_REST_API_URL;
            const token =
              data.PASSED_STORE_UPSTASH_TOKEN ??
              data.UPSTASH_REDIS_REST_TOKEN ??
              data.KV_REST_API_TOKEN;
            if (!url) {
              ctx.addIssue({
                code: "custom",
                path: ["PASSED_STORE_UPSTASH_URL"],
                message:
                  "PASSED_STORE_UPSTASH_URL, UPSTASH_REDIS_REST_URL, or KV_REST_API_URL is required when PASSED_STORE_TYPE=upstash",
              });
            }
            if (!token) {
              ctx.addIssue({
                code: "custom",
                path: ["PASSED_STORE_UPSTASH_TOKEN"],
                message:
                  "PASSED_STORE_UPSTASH_TOKEN, UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_TOKEN is required when PASSED_STORE_TYPE=upstash",
              });
            }
            if (!url || !token) {
              return z.NEVER;
            }
            return {
              ...rest,
              store: { type: "upstash", url, token },
            };
          }
        }
      }),
    onValidationError: (issues: readonly StandardSchemaV1.Issue[]) => {
      console.error("❌ Invalid environment variables:", issues);
      throw new Error(
        `Invalid environment variables: ${issues.map((issue) => issue.message).join(", ")}`,
      );
    },
  });

export const env = createPassedEnv(process.env, {
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
