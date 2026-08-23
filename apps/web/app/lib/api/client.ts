import { apiErrorSchema, type ApiError } from '@repo/contracts/shared';
import type { ZodType } from 'zod';

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

if (!BASE_URL) {
  throw new Error(
    'NEXT_PUBLIC_BACKEND_URL is not set — copy apps/web/.env.example to .env.local',
  );
}

/** A failure the API described in its own error contract. */
export class ApiRequestError extends Error {
  constructor(readonly error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
  }

  get statusCode(): number {
    return this.error.statusCode;
  }

  get code(): string {
    return this.error.code;
  }
}

/** A failure that never reached the API, or a response it did not describe. */
export class ApiTransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ApiTransportError';
  }
}

type RequestOptions = {
  query?: Record<string, string | number | undefined>;
  /** Seconds to cache. Omit for always-fresh. */
  revalidate?: number;
};

/**
 * The single door to the API.
 *
 * Responses are parsed against the contract schema rather than cast, so a
 * server that drifts from the contract fails here — with the offending field
 * named — instead of surfacing as `undefined` inside a component. That parse
 * is the entire reason @repo/contracts exists.
 */
export async function apiGet<T>(
  path: string,
  schema: ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      next:
        options.revalidate === undefined
          ? { revalidate: 0 }
          : { revalidate: options.revalidate },
    });
  } catch (cause) {
    throw new ApiTransportError(`Could not reach the API at ${url.pathname}`, {
      cause,
    });
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);

    throw parsed.success
      ? new ApiRequestError(parsed.data)
      : new ApiTransportError(
          `API returned ${response.status} with an unrecognised body`,
        );
  }

  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiTransportError(
      `Response from ${url.pathname} does not match its contract: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    );
  }

  return parsed.data;
}
