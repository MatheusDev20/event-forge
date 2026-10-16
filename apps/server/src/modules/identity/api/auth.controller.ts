import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  loginRequestSchema,
  type LoginRequest,
  type SessionResponse,
} from '@repo/contracts/identity';
import type { Request, Response } from 'express';
import type { Env } from '../../../config/env';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import {
  IdentityService,
  type IssuedSession,
} from '../application/identity.service';
import type { AuthenticatedAccount } from '../domain/account';
import {
  readSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './session-cookie';
import { CurrentAccount, SessionGuard } from './session.guard';

/**
 * Log in, log out, and "who am I?".
 *
 * No register: accounts are created by an organizer's admins (Catalog's
 * member routes) or by `pnpm org:create`, never by the person who will use
 * them — ADR-0008.
 *
 * A successful login answers with the account in the body and
 * the session in an httpOnly cookie. The body is for the console to render;
 * the cookie is for the browser to send back, and no script ever sees it.
 */
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly identity: IdentityService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookies =
      config.get('NODE_ENV', { infer: true }) !== 'development';
  }

  /** 200, not 201: a login creates a session, but nothing the caller would address. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const session = await this.identity.login(body.email, body.password);

    return this.startSession(response, session);
  }

  /**
   * Not guarded. Logging out with an expired session, or none, still clears
   * the cookie and still answers 204 — the user asked to be signed out, and
   * they are.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readSessionToken(request);

    if (token) await this.identity.logout(token);

    // Same attributes as when it was set, or the browser treats it as a
    // different cookie and keeps the old one.
    response.clearCookie(
      SESSION_COOKIE,
      sessionCookieOptions(this.secureCookies),
    );
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentAccount() account: AuthenticatedAccount): SessionResponse {
    return { account };
  }

  private startSession(
    response: Response,
    session: IssuedSession,
  ): SessionResponse {
    response.cookie(SESSION_COOKIE, session.token, {
      ...sessionCookieOptions(this.secureCookies),
      expires: session.expiresAt,
    });

    return { account: session.account };
  }
}
