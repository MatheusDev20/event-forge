/**
 * Identity's public surface.
 *
 * Other contexts get the guard, the decorator that reads its result, and the
 * account type it produces — enough to protect a route and know who called
 * it. Accounts, sessions and password hashes stay internal.
 */
export { IdentityModule } from './identity.module';
export { IdentityService } from './application/identity.service';
export { CurrentAccount, SessionGuard } from './api/session.guard';
export {
  ACCOUNT_ROLES,
  type AccountRole,
  type AuthenticatedAccount,
  type NewAccount,
} from './domain/account';
