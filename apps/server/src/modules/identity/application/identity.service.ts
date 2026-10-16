import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { QueryFailedError } from 'typeorm';
import type { AuthenticatedAccount, NewAccount } from '../domain/account';
import { sessionExpiry } from '../domain/session';
import { AccountsRepository } from '../infrastructure/accounts.repository';
import type { AccountEntity } from '../infrastructure/entities/account.entity';
import { PasswordHasher } from '../infrastructure/password-hasher';
import { SessionsRepository } from '../infrastructure/sessions.repository';

/** A freshly issued session: the raw token goes into the cookie, and nowhere else. */
export type IssuedSession = {
  token: string;
  expiresAt: Date;
  account: AuthenticatedAccount;
};

/**
 * Identity's public application surface: create accounts (for other
 * contexts to provision people), log in, log out, and answer "whose session
 * is this?".
 *
 * It knows nothing about cookies. Turning an `IssuedSession` into a
 * `Set-Cookie` header is the HTTP edge's job (api/session-cookie.ts), which is
 * what keeps this callable from a test, a CLI or a future non-HTTP transport.
 */
@Injectable()
export class IdentityService {
  /**
   * A real hash of a password nobody has, computed once. Login verifies
   * against it when the email is unknown, so "no such account" and "wrong
   * password" take the same ~50 ms. Without it, response time alone would
   * tell an attacker which emails are registered.
   */
  private readonly decoyHash: Promise<string>;

  constructor(
    private readonly accounts: AccountsRepository,
    private readonly sessions: SessionsRepository,
    private readonly passwords: PasswordHasher,
  ) {
    this.decoyHash = this.passwords.hash(randomBytes(16).toString('hex'));
  }

  /**
   * Creates an account. Does not sign it in — the caller is an organizer's
   * admin acting for someone else, or the `org:create` script, and neither
   * should walk away holding that person's session.
   *
   * There is deliberately no route that calls this for the requester's own
   * benefit: accounts are provided, not self-served (ADR-0008).
   */
  async createAccount(input: NewAccount): Promise<AuthenticatedAccount> {
    const passwordHash = await this.passwords.hash(input.password);

    const account = await this.accounts
      .create({
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role,
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `An account with email "${input.email}" already exists`,
          );
        }

        throw error;
      });

    return toAuthenticated(account);
  }

  /** For `pnpm org:create`, which attaches an existing account if there is one. */
  async findAccountByEmail(
    email: string,
  ): Promise<AuthenticatedAccount | null> {
    const account = await this.accounts.findByEmail(email);

    return account ? toAuthenticated(account) : null;
  }

  /**
   * Accounts by id, for contexts that hold only ids and need to show a name —
   * Catalog's member list. Unknown ids are simply absent from the result.
   */
  async findAccounts(ids: string[]): Promise<AuthenticatedAccount[]> {
    const accounts = await this.accounts.findByIds(ids);

    return accounts.map(toAuthenticated);
  }

  /**
   * One message for every failure, on purpose. "No account with that email"
   * is a free lookup service for anyone holding a list of addresses.
   */
  async login(email: string, password: string): Promise<IssuedSession> {
    const account = await this.accounts.findByEmail(email);
    const matches = await this.passwords.verify(
      password,
      account?.passwordHash ?? (await this.decoyHash),
    );

    if (!account || !matches) {
      // 401 maps to UNAUTHENTICATED in HttpExceptionFilter.
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueSession(account);
  }

  async logout(token: string): Promise<void> {
    await this.sessions.deleteByTokenHash(hashToken(token));
  }

  /** The account behind a token, or null when the token is unknown or expired. */
  async authenticate(token: string): Promise<AuthenticatedAccount | null> {
    const account = await this.sessions.findAccountByTokenHash(
      hashToken(token),
    );

    return account ? toAuthenticated(account) : null;
  }

  private async issueSession(account: AccountEntity): Promise<IssuedSession> {
    // 32 bytes from the CSPRNG: unguessable, so a plain SHA-256 of it is a
    // safe thing to store — see SessionEntity.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = sessionExpiry(new Date());

    await this.sessions.create({
      tokenHash: hashToken(token),
      accountId: account.id,
      expiresAt,
    });

    return { token, expiresAt, account: toAuthenticated(account) };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Drops the password hash. The only way an account leaves this context. */
function toAuthenticated(account: AccountEntity): AuthenticatedAccount {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === '23505'
  );
}
