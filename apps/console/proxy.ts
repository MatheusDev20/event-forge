import { NextResponse, type NextRequest } from 'next/server';

/**
 * Same name the API sets — apps/server/src/modules/identity/api/session-cookie.ts.
 *
 * The cookie is written by the API (port 3001) and read here (port 3002).
 * That works because cookies are scoped by host, not by port. In a deployment
 * the two have to share a site for the same reason — see ADR-0008.
 */
const SESSION_COOKIE = 'ef_session';

/**
 * Sends anyone without a session cookie to the login page before a protected
 * page renders.
 *
 * It checks presence only, and that is deliberate. This proxy cannot validate
 * the token — only the API can — so a stale or forged cookie gets through
 * here and is caught one step later, when `GET /auth/me` answers 401 and the
 * console shell redirects. What this buys is the common case: a signed-out
 * visitor never sees the shell flash before being bounced.
 *
 * It never redirects *away* from /login. With a stale cookie that would loop:
 * /login → / (cookie present) → 401 → /login → …
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const login = new URL('/login', request.url);

  if (pathname !== '/') login.searchParams.set('next', pathname + search);

  return NextResponse.redirect(login);
}

export const config = {
  /*
   * Everything except the login page and Next's own assets. There is no
   * signup page to exempt: accounts are provided by an admin.
   */
  matcher: ['/((?!login|_next/|icon\\.svg|favicon\\.ico).*)'],
};
