import type { ZodError } from 'zod';
import { ApiRequestError } from './api/client';

export type FieldErrors = Record<string, string>;

/**
 * One message per field, from either side of the wire.
 *
 * The forms validate against the same contract schema the API uses, so most
 * mistakes are caught before a request is sent. The API's
 * `VALIDATION_FAILED` details use the same dotted paths, so whatever slips
 * through — or whatever the server checks that the client cannot — lands on
 * the same field.
 */
export function fieldErrorsFrom(error: ZodError | unknown): FieldErrors {
  const issues =
    error instanceof ApiRequestError
      ? (error.error.details ?? [])
      : isZodError(error)
        ? error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          }))
        : [];

  const errors: FieldErrors = {};
  for (const { path, message } of issues) errors[path] ??= message;

  return errors;
}

/** The message to show above the form, for failures that belong to no field. */
export function formErrorFrom(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiRequestError && error.error.details?.length) {
    return null;
  }

  return error instanceof Error ? error.message : 'Something went wrong';
}

function isZodError(error: unknown): error is ZodError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as ZodError).issues)
  );
}
