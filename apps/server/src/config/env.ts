import { z } from 'zod';

/**
 * Environment schema. Validated once at boot so a missing or malformed value
 * fails immediately and by name, instead of surfacing as `undefined` inside a
 * connection string three layers down.
 */

/**
 * An absolute http(s) URL.
 *
 * The protocol constraint is not pedantry. Bare `z.url()` defers to `new
 * URL()`, which happily parses `localhost:3001` — scheme `localhost`, path
 * `3001` — so the likeliest typo in any of these variables is precisely the
 * one it would wave through, and the damage only surfaces later as a column
 * full of links no browser can follow.
 */
const HTTP_URL = z.url({ protocol: /^https?$/ });

const envShape = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5433),
  DB_USERNAME: z.string().min(1).default('postgres'),
  DB_PASSWORD: z.string().min(1).default('postgres'),
  DB_NAME: z.string().min(1).default('postgres'),

  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  /* ---------------------------------------------------------------- *
   * Uploads
   *
   * Two backends, one switch. Whichever is selected, what lands in
   * `events.hero_image_url` is an absolute URL a browser can fetch — the
   * column does not record which backend produced it, and nothing downstream
   * needs to know. That is what makes the switch a deployment decision rather
   * than a schema one, and what lets rows written under either backend keep
   * working after a flip.
   * ---------------------------------------------------------------- */

  /**
   * Send uploads to S3 instead of the local disk.
   *
   * `stringbool`, not `coerce.boolean`: coercion follows JavaScript
   * truthiness, under which the string `"false"` is `true`. An environment
   * variable that silently means the opposite of what it reads is exactly the
   * failure this schema exists to prevent.
   */
  S3_UPLOAD: z.stringbool().default(false),

  /**
   * Where uploaded images are written locally, and the origin they are served
   * back from. Two variables rather than one because they answer different
   * questions — a disk path and a public URL — and only the second one ends up
   * in a database column that clients dereference.
   *
   * Relative paths resolve against the process working directory, which for
   * `pnpm dev` is apps/server.
   *
   * Both stay meaningful with `S3_UPLOAD=true`: images written before the
   * switch are still served from disk at URLs rows already point at.
   */
  UPLOADS_DIR: z.string().min(1).default('./uploads'),
  /**
   * Must match where this API is actually reachable, including PORT: it is the
   * prefix of every locally stored `hero_image_url`, and a wrong value
   * persists as a broken image long after the process it described is gone.
   */
  PUBLIC_BASE_URL: HTTP_URL.default('http://localhost:3001'),

  /** Required when S3_UPLOAD is true; see the refinement below. */
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),

  /**
   * Key prefix inside the bucket. Mirrors the local layout so an object's key
   * and a local file's path read the same in a log.
   */
  S3_KEY_PREFIX: z.string().default('hero-images'),

  /**
   * Where the objects are publicly readable from — a CloudFront distribution
   * or a custom domain, typically.
   *
   * Optional, and when omitted the bucket's own virtual-hosted URL is used.
   * That default only resolves for a publicly readable bucket, which is a
   * choice about the bucket rather than about this app: set this variable to
   * point at whatever actually fronts it.
   */
  S3_PUBLIC_BASE_URL: HTTP_URL.optional(),

  /**
   * A non-AWS S3 endpoint — MinIO or LocalStack, in practice. Setting it also
   * turns on path-style addressing, because neither supports the
   * virtual-hosted `bucket.host` form that AWS defaults to.
   *
   * Credentials are deliberately absent from this schema. The AWS SDK's own
   * provider chain (environment, shared config, instance or task role) is
   * better at finding them than a hand-rolled pair of variables, and a role is
   * the right answer in every deployment that has one.
   */
  S3_ENDPOINT: HTTP_URL.optional(),
});

/**
 * The cross-field rule the shape above cannot express: turning on S3 turns two
 * optional variables into required ones.
 *
 * Checked at boot rather than at first upload on purpose. The alternative is a
 * server that starts, serves reads perfectly, and only reveals a missing
 * bucket name to the first organizer who tries to upload artwork.
 */
export const envSchema = envShape.superRefine((env, ctx) => {
  if (!env.S3_UPLOAD) return;

  for (const key of ['S3_BUCKET', 'S3_REGION'] as const) {
    if (env[key] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: 'Required when S3_UPLOAD is true',
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/** Passed to ConfigModule.forRoot({ validate }). */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }

  return result.data;
}
