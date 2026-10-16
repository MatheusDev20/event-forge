/**
 * How long a login lasts.
 *
 * Fixed rather than sliding: a session expires a week after it was created,
 * whether or not it was used. Sliding expiry would mean a write on every
 * authenticated request to push the date forward — a cost on the hot path to
 * buy a convenience an organizer console, used a few times a week, does not
 * need.
 */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}
