import { z } from 'zod';

/**
 * Environment schema. Validated once at boot so a missing or malformed value
 * fails immediately and by name, instead of surfacing as `undefined` inside a
 * connection string three layers down.
 */
export const envSchema = z.object({
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
