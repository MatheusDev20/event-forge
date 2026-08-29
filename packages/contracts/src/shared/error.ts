import { z } from 'zod';

/**
 * The single error shape every endpoint returns. Flat, and it repeats the
 * status code in the body on purpose: clients that log a failure should not
 * have to correlate two sources to know what happened.
 *
 * `code` is a stable machine-readable string. Clients branch on `code`; only
 * humans read `message`.
 */
export const apiErrorSchema = z.object({
  statusCode: z.int(),
  code: z.string(),
  message: z.string(),
  /** Field-level validation failures, keyed by dotted path. */
  details: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
  path: z.string(),
  timestamp: z.iso.datetime(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  /**
   * The request body was larger than the endpoint accepts — an upload over the
   * size limit, in practice. Distinct from VALIDATION_FAILED because a client
   * can act on it: the fix is a smaller file, not a corrected field.
   */
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
