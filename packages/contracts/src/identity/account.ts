import { z } from 'zod';

/**
 * Identity contracts — who is acting, as the wire describes them.
 *
 * Identity is meant to be boring (docs/product-brief.md), and these shapes are
 * the whole of what it says to the outside: an account, how to get a session
 * for one, and how to ask whose session this is. There is no signup: accounts
 * are created by an organizer's admins, through Catalog's member routes (see
 * `addOrganizerMemberRequestSchema`), or by `pnpm org:create`. The session itself never
 * appears here. It travels as an httpOnly cookie that no client script can
 * read, so there is nothing for a contract to describe — see
 * docs/adr/0008-identity-sessions-and-memberships.md.
 */

/** The three roles from docs/domain-model.md, declared whole. */
export const accountRoleSchema = z.enum(['attendee', 'organizer', 'admin']);

/**
 * Lower-cased and trimmed at the edge, so `Ana@Example.com ` and
 * `ana@example.com` are one account and the unique index agrees with the user
 * about what "the same email" means.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  // Piped, not chained: zod runs a string's checks in the order they are
  // declared, so `z.email().trim()` validates the untrimmed input and rejects
  // the very whitespace it was about to remove.
  .pipe(z.email().max(254));

/**
 * Length is the only rule, and the upper bound is not arbitrary: it caps how
 * much work one login request can ask the password hash to do. Composition
 * rules (a digit, a symbol) are left out on purpose — they push people towards
 * predictable passwords rather than long ones.
 */
export const passwordSchema = z.string().min(8).max(128);

export const accountSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: accountRoleSchema,
});

/**
 * No rules on the password beyond "present". A login form that rejects an
 * old, shorter password before checking it would lock out exactly the accounts
 * created under a looser policy.
 */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

/** What login and `GET /auth/me` both answer with. */
export const sessionResponseSchema = z.object({
  account: accountSchema,
});

export type AccountRole = z.infer<typeof accountRoleSchema>;
export type Account = z.infer<typeof accountSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
