import { defineHandler, HTTPError } from "nitro";
import { assertBodySize, readBody } from "nitro/h3";
import { z } from "zod";
import { env } from "~/env";
import { generateShareId } from "~/utils/id";
import { useStore } from "~/plugins/storage";

/** Maximum allowed expires-in: 2 weeks. */
const MAX_EXPIRES_IN = 14 * 24 * 60 * 60;

/** Maximum remaining views a share may be created with. */
const MAX_VIEWS = 10;

/** Maximum allowed password length. */
const MAX_LENGTH = env.PASSED_MAX_LENGTH;

/** Body overhead bytes. */
const BODY_OVERHEAD_BYTES = 1024;

/** Maximum allowed body size. */
const MAX_BODY_BYTES = MAX_LENGTH + BODY_OVERHEAD_BYTES;

function boundedPositiveInteger(error: string, max: number, maxError: string) {
  return z
    .union([z.int(), z.string().regex(/^[1-9]\d*$/)], { error })
    .transform((value) => (typeof value === "string" ? Number(value) : value))
    .pipe(z.int().positive({ error }).max(max, { error: maxError }));
}

const createPasswordBody = z.object({
  password: z
    .string({ error: "password is required" })
    .min(1, { error: "password is required" })
    .max(MAX_LENGTH, {
      error: `password must be at most ${MAX_LENGTH} characters`,
    }),
  "expires-in": boundedPositiveInteger(
    "expires-in must be a positive integer number of seconds",
    MAX_EXPIRES_IN,
    `expires-in must be at most ${MAX_EXPIRES_IN} seconds (2 weeks)`,
  ),
  view: boundedPositiveInteger(
    "view must be a positive integer",
    MAX_VIEWS,
    `view must be at most ${MAX_VIEWS}`,
  ).default(1),
});

function httpErrorFromZod(error: z.ZodError): HTTPError {
  const messages = [...new Set(error.issues.map((issue) => issue.message))];
  return new HTTPError(messages.join("; "), { status: 400 });
}

export default defineHandler(async (event) => {
  await assertBodySize(event, MAX_BODY_BYTES);

  const parsed = createPasswordBody.safeParse((await readBody(event)) ?? {});
  if (!parsed.success) {
    throw httpErrorFromZod(parsed.error);
  }

  const {
    password: encryptedSecret,
    "expires-in": expiresIn,
    view,
  } = parsed.data;

  const id = generateShareId();
  const stored = await useStore().setEncryptedSecret(
    id,
    encryptedSecret,
    expiresIn,
    view,
  );
  if (!stored) {
    throw new HTTPError("Capacity limit reached", { status: 507 });
  }
  return Response.json(id);
});
