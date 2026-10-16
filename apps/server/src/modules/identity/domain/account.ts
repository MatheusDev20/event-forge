/**
 * Identity's own vocabulary — docs/domain-model.md, "Identity — who is acting".
 *
 * Mirrors `accountRoleSchema` in @repo/contracts on purpose, for the same
 * reason Catalog's unions mirror theirs: the contract describes the wire, this
 * describes the domain, and the mapper is where they are proven to agree.
 */
export const ACCOUNT_ROLES = ['attendee', 'organizer', 'admin'] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/**
 * Who is acting, as every other context is allowed to know it.
 *
 * No password hash, no session: this is what a guard hands a controller, and
 * a controller has no business holding either. Other contexts are meant to
 * keep only `id` (docs/domain-model.md); the rest is here so the console can
 * greet someone by name without a second request.
 */
export type AuthenticatedAccount = {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
};

export type NewAccount = {
  name: string;
  /** Already normalised by the contract: trimmed and lower-cased. */
  email: string;
  password: string;
  role: AccountRole;
};
