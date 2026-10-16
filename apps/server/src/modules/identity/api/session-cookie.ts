import type { CookieOptions, Request } from 'express';

/**
 * The session's cookie, and everything about how it is written.
 *
 * `ef_session` is also read by name in apps/console/proxy.ts, which checks for
 * its presence before rendering a protected page. The two have to agree.
 */
export const SESSION_COOKIE = 'ef_session';

/**
 * - `httpOnly`: no script on any page can read the token, so an XSS bug in the
 *   console cannot exfiltrate a session.
 * - `sameSite: 'lax'`: the browser leaves the cookie off cross-site POSTs,
 *   which is the CSRF defence. The console and the API are the same *site*
 *   (localhost, ports aside — or console.x.com and api.x.com later), so their
 *   own requests still carry it.
 * - `secure` outside development: a session cookie sent over plain HTTP is a
 *   session anyone on the network can copy. Local dev has no TLS, so it is the
 *   one exception.
 * - `path: '/'`: the console's proxy has to see it on page requests, not only
 *   on calls under /api.
 *
 * No `expires` here: it is added when the cookie is set, and must be absent
 * when it is cleared.
 */
export function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/' };
}

/**
 * The raw token from the request's Cookie header, or null.
 *
 * Parsed by hand rather than with cookie-parser: one cookie, read in one
 * place, does not need a middleware and a dependency.
 */
export function readSessionToken(request: Request): string | null {
  const header = request.headers.cookie;

  if (!header) return null;

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;

    if (pair.slice(0, separator).trim() === SESSION_COOKIE) {
      const value = pair.slice(separator + 1).trim();
      return value === '' ? null : decodeURIComponent(value);
    }
  }

  return null;
}
