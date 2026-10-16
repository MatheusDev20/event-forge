import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { IdentityService } from '../application/identity.service';
import type { AuthenticatedAccount } from '../domain/account';
import { readSessionToken } from './session-cookie';

type AuthenticatedRequest = Request & { account?: AuthenticatedAccount };

/**
 * Lets a request through only with a live session, and puts the account on it
 * for `@CurrentAccount()` to read.
 *
 * Opt-in, per controller or route, rather than a global guard with a
 * `@Public()` escape hatch. Most of this API is deliberately anonymous — the
 * storefront's reads, and the hold race, which must stay that way
 * (docs/roadmap.md) — so the default that matches reality is "open", and every
 * protected route says so where it is declared.
 *
 * Exported from Identity's index.ts so other contexts can guard their own
 * controllers without reaching into this module.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly identity: IdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionToken(request);
    const account = token ? await this.identity.authenticate(token) : null;

    if (!account) {
      // One answer for "no cookie" and "expired cookie": the fix for both is
      // the login page, and the console treats any 401 that way.
      throw new UnauthorizedException('Not signed in');
    }

    request.account = account;
    return true;
  }
}

/**
 * The signed-in account, in a handler behind `SessionGuard`.
 *
 * Throws rather than returning undefined when the guard did not run: a route
 * that forgot `@UseGuards(SessionGuard)` should fail loudly in development, not
 * quietly act on behalf of nobody.
 */
export const CurrentAccount = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAccount => {
    const { account } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    if (!account) {
      throw new Error(
        '@CurrentAccount() used on a route without @UseGuards(SessionGuard)',
      );
    }

    return account;
  },
);
