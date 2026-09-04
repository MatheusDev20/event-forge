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
  /**
   * The units asked for are not free. A 409, like CONFLICT, but distinguished
   * because it is the *expected* answer on the hold path rather than an
   * anomaly: in a race for one seat, every loser gets this, and a client — or
   * a test counting winners — must be able to tell "someone else got it" from
   * "the event is not on sale" and from "your connection died".
   */
  ALLOCATION_UNAVAILABLE: 'ALLOCATION_UNAVAILABLE',
  /**
   * The event exists and is not selling. Separate from ALLOCATION_UNAVAILABLE
   * because nothing about the request was wrong and retrying the same body
   * will work once the doors open.
   */
  EVENT_NOT_ON_SALE: 'EVENT_NOT_ON_SALE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
